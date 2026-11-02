import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { enviarMail, mailConfigurado } from "@/lib/mailer";
import { enviarConSeguimiento } from "@/lib/mail-envio";
import { armarMensajeNovedades } from "@/lib/novedades-mail";
import { linksDeBaja } from "@/lib/baja-mail";
import { linkCopiloto } from "@/lib/copiloto";
import { esAlumno } from "@/lib/licencias";

// Local por defecto, con /api, como los otros barridos (ver `lib/api.ts`).
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";

/**
 * El mail de novedades (`lib/novedades-mail.ts`). **No está en el crontab:** se manda a
 * mano, cuando hay algo que contar.
 *
 *   curl -X POST -H "X-Cron-Secret: …" ".../api/cron/novedades?clave=2026-10"
 *
 * - `clave` (obligatoria) nombra la tanda. El backend (`GET /mails/novedades/pendientes`)
 *   devuelve a quién le falta **esa** tanda: mail confirmado, sin baja de novedades y sin
 *   un envío anotado con esa clave. Correrlo dos veces no manda dos mails.
 * - `?solo=<id de la cuenta>` lo manda sólo a esa cuenta. Queda anotado, así que cuando
 *   salga la tanda entera no le llega de nuevo.
 * - `?prueba=<mail>` manda una copia de muestra a ese mail, sin cuenta: no entra en las
 *   métricas ni cuenta como enviada a nadie.
 *
 * Sale con seguimiento (`lib/mail-envio.ts`), y lo que anota ese envío es además lo que
 * evita repetir: por eso un envío que no se pudo anotar se informa como problema.
 */
function secretosCoinciden(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Pendiente {
  user_id: string;
  email: string;
  first_name: string | null;
  license_type: string | null;
  tiene_vuelos: boolean;
}

export async function POST(req: NextRequest) {
  const esperado = process.env.DOCUMENTS_ALERT_SECRET;
  if (!esperado) return NextResponse.json({ error: "Barrido no configurado" }, { status: 503 });
  if (!secretosCoinciden(req.headers.get("X-Cron-Secret") ?? "", esperado)) {
    return NextResponse.json({ error: "Secreto inválido" }, { status: 401 });
  }
  if (!mailConfigurado()) {
    const prueba = await enviarMail({ para: "x@x", asunto: "", texto: "", html: "" });
    return NextResponse.json({ enviados: 0, motivo: prueba.motivo });
  }

  const params = new URL(req.url).searchParams;
  const clave = params.get("clave")?.trim();
  if (!clave) return NextResponse.json({ error: "Falta ?clave= (el nombre de la tanda, por ejemplo 2026-10)" }, { status: 400 });

  const prueba = params.get("prueba");
  if (prueba) {
    const mensaje = armarMensajeNovedades({
      nombre: null,
      tieneVuelos: false,
      appUrl: APP_URL,
      linkCopiloto: linkCopiloto(),
      // Una copia de muestra no es de nadie: la baja lleva a la página, que dirá que el link no vale.
      linkBaja: `${APP_URL}/mail/baja`,
    });
    const r = await enviarConSeguimiento({ para: prueba, userId: null, tipo: "novedades", clave, mensaje });
    return NextResponse.json({ prueba: true, enviado: r.enviado, motivo: r.motivo ?? r.aviso ?? null });
  }

  let pendientes: Pendiente[];
  try {
    const res = await fetch(`${API_URL}/mails/novedades/pendientes?clave=${encodeURIComponent(clave)}`, {
      headers: { "X-Cron-Secret": esperado },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `El backend contestó ${res.status}` }, { status: 502 });
    pendientes = await res.json();
  } catch (err) {
    return NextResponse.json({ error: `No se pudo consultar el backend: ${err}` }, { status: 502 });
  }
  const solo = params.get("solo");
  if (solo) pendientes = pendientes.filter((p) => p.user_id === solo);

  let enviados = 0;
  const problemas: string[] = [];
  for (const p of pendientes) {
    const baja = linksDeBaja(APP_URL, p.user_id, esperado, "novedades");
    const mensaje = armarMensajeNovedades({
      nombre: p.first_name,
      tieneVuelos: p.tiene_vuelos,
      alumno: esAlumno(p.license_type),
      appUrl: APP_URL,
      linkCopiloto: linkCopiloto(),
      linkBaja: baja.pagina,
    });
    const r = await enviarConSeguimiento({
      para: p.email,
      userId: p.user_id,
      tipo: "novedades",
      clave,
      mensaje,
      cabeceras: {
        "List-Unsubscribe": `<${baja.unClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      sinSeguir: [baja.pagina],
    });
    if (r.enviado) enviados++;
    // Sin el mail en el log: el id alcanza para buscarlo.
    else problemas.push(`${p.user_id}: ${r.motivo ?? "no se pudo enviar"}`);
    // El mail salió pero no quedó anotado: si se corre de nuevo, le llegaría otra vez.
    if (r.aviso) problemas.push(`${p.user_id}: ${r.aviso}`);
  }

  return NextResponse.json({ clave, pendientes: pendientes.length, enviados, problemas });
}
