import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

// Local por defecto, con /api: nginx lo agrega solo por el dominio público, acá no
// hay nginx de por medio. Causa de la caída del 2026-08-27, ver `lib/api.ts`.
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

/**
 * Daily sweep that delivers document expiry warnings over WhatsApp.
 *
 * Runs here rather than in the backend because the Kapso credentials live in
 * this app. The backend decides *what* is due (`/document-alerts/pending`) and
 * records what was delivered (`/document-alerts/{id}/sent`); this route is only
 * the courier.
 *
 * Marking happens strictly after Kapso **accepts** the send, which is not the
 * same as the pilot receiving it: Meta resolves delivery asynchronously and
 * reports it later over the webhook. Se marca igual en la aceptación —esperar el
 * `delivered` dejaría una ventana en la que un segundo barrido manda el aviso
 * duplicado— y el webhook **desmarca** si el veredicto termina siendo `failed`,
 * con lo que el barrido del día siguiente reintenta.
 *
 * Fallar de este lado es el lado correcto: el peor caso es un reintento, no un
 * vencimiento del que el piloto nunca se enteró.
 *
 * Programarlo una vez por día, desde el mismo host que corre el backend. **El
 * secreto va por cabecera**: en query string se escribe en el access log de nginx
 * en cada corrida.
 *
 *   0 12 * * * curl -fsS -X POST \
 *     -H "X-Cron-Secret: $DOCUMENTS_ALERT_SECRET" \
 *     https://vector.fdiaznem.com.ar/api/cron/document-alerts
 */

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface PendingAlert {
  document_id: string;
  user_id: string;
  name: string;
  kind: string;
  expiry_date: string;
  threshold: number;
  days_remaining: number;
  whatsapp_phone?: string | null;
  first_name?: string | null;
  message: string;
}

/**
 * Las dos plantillas aprobadas por Meta, por entorno porque el nombre lo fija la
 * aprobación y no el código.
 *
 * **Los parámetros son posicionales**, en el mismo orden en que aparecen los
 * `{{n}}` del body. Si alguna vez se cargan plantillas con parámetros
 * *nombrados*, Meta exige `parameter_name` en cada uno y hay que cambiar
 * `sendWhatsAppTemplate`.
 *
 *   vencimiento_proximo  {{1}} nombre · {{2}} documento · {{3}} fecha · {{4}} días
 *   documento_vencido    {{1}} nombre · {{2}} documento · {{3}} fecha
 */
const TEMPLATE_PROXIMO = process.env.WHATSAPP_TEMPLATE_VENCIMIENTO || "vencimiento_proximo";
const TEMPLATE_VENCIDO = process.env.WHATSAPP_TEMPLATE_VENCIDO || "documento_vencido";

/** `0` es el centinela con el que el backend dice "ya venció" una sola vez. */
const EXPIRED_BUCKET = 0;

/**
 * "YYYY-MM-DD" a "DD/MM/YYYY", a mano.
 *
 * Sin `Date` ni `toLocaleDateString`: acá corre en el server y la fecha ya viene
 * como texto ISO, así que construir un `Date` sólo agregaría una zona horaria que
 * puede correr el día. Ya costó dos bugs de hidratación en este repo.
 */
function fechaLegible(iso: string): string {
  // Validado por forma y no sólo por "tiene tres partes": partir una cadena
  // cualquiera por guiones también da tres pedazos, y esto termina en un mensaje
  // que lee un piloto. Ante algo inesperado, devolver el original.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function POST(req: NextRequest) {
  const secret = process.env.DOCUMENTS_ALERT_SECRET;
  if (!secret) {
    console.error("DOCUMENTS_ALERT_SECRET not configured — refusing to run the expiry sweep.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const provided =
    req.nextUrl.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pending: PendingAlert[] = [];
  try {
    // El secreto va por cabecera y no en la URL: el access log de nginx y el de
    // uvicorn registran la URL entera, así que en query string se escribiría en
    // texto plano en el server en cada corrida diaria.
    const res = await fetch(`${API_URL}/document-alerts/pending`, {
      cache: "no-store",
      headers: { "X-Cron-Secret": secret },
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Expiry sweep: backend refused the pending query:", res.status, detail);
      return NextResponse.json({ error: "Backend error", status: res.status }, { status: 502 });
    }
    pending = await res.json();
  } catch (err) {
    console.error("Expiry sweep: could not reach the backend:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  // `accepted` y no `sent`: es lo que efectivamente sabemos al terminar el
  // barrido. Cuántos llegaron lo dicen los webhooks de status, más tarde.
  let accepted = 0;
  let skipped = 0;
  let failed = 0;

  for (const alert of pending) {
    if (!alert.whatsapp_phone) {
      // No number on file: nothing to deliver to. Left unmarked so the alert
      // still fires if the pilot adds their WhatsApp later.
      skipped += 1;
      continue;
    }

    // Plantilla y no texto libre: este envío es proactivo y Meta rechaza texto
    // fuera de la ventana de 24 h. Ver `sendWhatsAppTemplate`.
    const vencido = alert.threshold === EXPIRED_BUCKET;
    const nombre = (alert.first_name || "").trim() || "piloto";
    const params = vencido
      ? [nombre, alert.name, fechaLegible(alert.expiry_date)]
      : [nombre, alert.name, fechaLegible(alert.expiry_date), String(alert.threshold)];

    const envio = await sendWhatsAppTemplate(
      alert.whatsapp_phone,
      vencido ? TEMPLATE_VENCIDO : TEMPLATE_PROXIMO,
      params
    );
    if (!envio.accepted) {
      failed += 1;
      continue;
    }

    try {
      // El wamid va al marcar: es lo único con lo que después se puede desandar
      // esta marca si Meta reporta que la entrega falló. Sin él el documento queda
      // marcado igual —que es el comportamiento correcto para no duplicar— pero
      // ese aviso en particular ya no se reintenta solo.
      const query = new URLSearchParams({ threshold: String(alert.threshold) });
      if (envio.messageId) query.set("message_id", envio.messageId);

      const markRes = await fetch(
        `${API_URL}/document-alerts/${alert.document_id}/sent?${query}`,
        { method: "POST", cache: "no-store", headers: { "X-Cron-Secret": secret } }
      );
      if (!markRes.ok) {
        // Accepted but not recorded: the pilot may get one duplicate tomorrow,
        // which is the right way round to fail.
        console.error("Expiry sweep: accepted but could not mark", alert.document_id, markRes.status);
      }
      accepted += 1;
    } catch (err) {
      console.error("Expiry sweep: accepted but could not mark", alert.document_id, err);
      accepted += 1;
    }
  }

  return NextResponse.json({ pending: pending.length, accepted, skipped, failed });
}
