import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { armarMensaje, type PuntoBriefing } from "@/lib/briefing-mail";
import { enviarMail, mailConfigurado } from "@/lib/mailer";
import { enviarConSeguimiento } from "@/lib/mail-envio";
import { componentesDePista, mejorPista } from "@/lib/briefing";
import { getAirport } from "@/lib/airports";
import { parsearRuta, rutaAUrl } from "@/lib/ruta-planificada";

// Local por defecto, con /api: nginx lo agrega solo por el dominio público, acá no
// hay nginx de por medio. Causa de la caída del 2026-08-27, ver `lib/api.ts`.
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";

/**
 * Barrido que manda el briefing del vuelo de mañana.
 *
 * Corre a la tarde, una vez por día, desde el mismo host que el backend. **El secreto va
 * por cabecera**: en query string se escribe en el access log de nginx en cada corrida.
 *
 *   0 21 * * * curl -fsS -X POST \
 *     -H "X-Cron-Secret: $DOCUMENTS_ALERT_SECRET" \
 *     https://vector.fdiaznem.com.ar/api/cron/briefing-vuelos
 *
 * ## Por qué la tarde anterior
 *
 * Porque el vuelo del sábado se decide el viernes a la noche: el TAF del día ya está
 * publicado y todavía se está a tiempo de cambiar el plan, la aeronave o la hora. Un aviso
 * el mismo día a la mañana llega para confirmar, no para decidir.
 *
 * ## Está acá y no en el backend, como el de vencimientos
 *
 * El backend dice **a quién** hay que avisarle —`/flight-briefings/pending`— y esto arma el
 * mensaje y lo entrega, porque las credenciales del proveedor de correo viven en esta app.
 * Es la misma división que el barrido de documentos.
 *
 * ## Sin proveedor de correo no falla: no hace nada y lo dice
 *
 * Devuelve `200` con `enviados: 0` y el motivo. Un barrido que se cae porque una feature
 * todavía no se activó ensucia los logs y esconde las que sí importan.
 */

function secretosCoinciden(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Pendiente {
  planned_id: string;
  user_id: string;
  date: string;
  route?: string | null;
  registration?: string | null;
  first_name?: string | null;
  email?: string | null;
}

/**
 * El estado de un punto de la ruta.
 *
 * **`respondio: false` cuando la consulta falla**, y no una categoría inventada. Es la
 * regla que `veredictoDeRuta` necesita para poder decir "no sabemos" en vez de "está todo
 * bien", que era el bug de la pantalla vieja de Ruta METAR.
 */
async function estadoDe(icao: string): Promise<PuntoBriefing> {
  const aeropuerto = getAirport(icao);
  const base: PuntoBriefing = {
    icao,
    label: aeropuerto?.label ?? "",
    categoria: "UNK",
    respondio: false,
  };

  try {
    const [clima, notams] = await Promise.allSettled([
      fetch(`${APP_URL}/api/weather?icao=${encodeURIComponent(icao)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${APP_URL}/api/notams?icao=${encodeURIComponent(icao)}`).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (clima.status !== "fulfilled" || !clima.value) return base;
    const d = clima.value;

    const punto: PuntoBriefing = {
      ...base,
      respondio: true,
      categoria: d.category ?? "UNK",
      metar: typeof d.metar === "string" ? d.metar : undefined,
      taf: typeof d.taf === "string" ? d.taf : undefined,
      vientoKt: Number.isFinite(Number(d.windSpeed)) ? Number(d.windSpeed) : null,
      notams: notams.status === "fulfilled" && notams.value ? (notams.value.notams?.length ?? null) : null,
    };

    // Viento cruzado sobre la pista que conviene, si hay pistas y hay viento.
    const dir = Number(d.windDir);
    const vel = Number(d.windSpeed);
    if (aeropuerto?.pistas?.length && Number.isFinite(dir) && Number.isFinite(vel)) {
      const mejor = mejorPista(aeropuerto.pistas, dir, vel);
      if (mejor) {
        punto.pista = mejor.cabecera;
        punto.cruzadoKt = mejor.cruzadoKt;
      }
    }
    return punto;
  } catch {
    return base;
  }
}

export async function POST(req: NextRequest) {
  const esperado = process.env.DOCUMENTS_ALERT_SECRET;
  if (!esperado) {
    return NextResponse.json({ error: "Barrido no configurado" }, { status: 503 });
  }
  const recibido = req.headers.get("X-Cron-Secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!secretosCoinciden(recibido, esperado)) {
    return NextResponse.json({ error: "Secreto inválido" }, { status: 401 });
  }

  if (!mailConfigurado()) {
    const prueba = await enviarMail({ para: "x@x", asunto: "", texto: "", html: "" });
    return NextResponse.json({ enviados: 0, motivo: prueba.motivo });
  }

  let pendientes: Pendiente[] = [];
  try {
    /*
      **Sin `/api` adelante.** `NEXT_PUBLIC_API_URL` ya apunta a la raíz de la API: el cron
      de vencimientos pide `${API_URL}/document-alerts/pending` y así funciona hace meses.
      El prefijo `/api` existe en el router de Litestar pero nginx lo absorbe, así que
      agregarlo daba 404 — y como el barrido devuelve 502 ante cualquier respuesta que no
      sea OK, se habría visto como "el backend no contesta" en vez de como una URL mal
      armada.
    */
    const res = await fetch(`${API_URL}/flight-briefings/pending`, {
      headers: { "X-Cron-Secret": esperado },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `El backend contestó ${res.status}` }, { status: 502 });
    }
    pendientes = await res.json();
  } catch (err) {
    return NextResponse.json({ error: `No se pudo consultar el backend: ${err}` }, { status: 502 });
  }

  const armadoA = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  let enviados = 0;
  const problemas: string[] = [];
  const exitosos: string[] = [];

  for (const p of pendientes) {
    if (!p.email) {
      problemas.push(`${p.planned_id}: el piloto no tiene mail`);
      continue;
    }
    const codigos = parsearRuta(p.route ?? "");
    if (codigos.length === 0) {
      // Un plan sin ruta —"el sábado vuelo"— es legítimo y no da briefing. No es un problema.
      continue;
    }

    const puntos = await Promise.all(codigos.map(estadoDe));
    const mensaje = armarMensaje({
      fecha: p.date,
      ruta: codigos.join(" "),
      matricula: p.registration ?? undefined,
      puntos,
      urlPlanificador: `${APP_URL}/dashboard/planificador?ruta=${encodeURIComponent(rutaAUrl(codigos))}`,
      armadoA,
      appUrl: APP_URL,
    });

    const r = await enviarConSeguimiento({ para: p.email, userId: p.user_id, tipo: "briefing", clave: p.date, mensaje });
    if (r.aviso) problemas.push(`${p.planned_id}: ${r.aviso}`);
    if (r.enviado) {
      enviados++;
      exitosos.push(p.planned_id);
    } else {
      problemas.push(`${p.planned_id}: ${r.motivo}`);
    }
  }

  if (exitosos.length > 0) {
    /*
      Sin esta marca, la próxima corrida los vuelve a mandar. `fetch` no tira por un 4xx
      o 5xx, así que la respuesta se mira: un backend que rechaza la marca tiene que
      aparecer en `problemas`, no pasar como marcado.
    */
    try {
      const res = await fetch(`${API_URL}/flight-briefings/mark-sent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Secret": esperado,
        },
        body: JSON.stringify(exitosos),
      });
      if (!res.ok) problemas.push(`No se pudieron marcar como notificados: el backend contestó ${res.status}`);
    } catch (err) {
      problemas.push(`No se pudo marcar como notificados en el backend: ${err}`);
    }
  }

  /*
    **Siempre 200 mientras el barrido haya corrido.** Los problemas por vuelo van en el
    cuerpo, no en el código de estado: un 500 porque a un piloto le falta el mail haría que
    el cron reintente todo y mande dos veces a los demás.
  */
  return NextResponse.json({ pendientes: pendientes.length, enviados, problemas });
}
