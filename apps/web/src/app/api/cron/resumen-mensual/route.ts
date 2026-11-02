import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { enviarMail, mailConfigurado } from "@/lib/mailer";
import { enviarConSeguimiento } from "@/lib/mail-envio";
import { armarMensajeResumen, calcularResumen } from "@/lib/resumen-mensual";
import { linksDeBaja } from "@/lib/baja-mail";
import { esTravesiaLarga } from "@/lib/travesia-larga";
import type { Aircraft, Flight, FlightPack, Logbook, Transaction } from "@/types";

// Local por defecto, con /api, como los otros barridos (ver `lib/api.ts`).
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";

/**
 * El resumen del mes por mail. El día 1, desde el crontab del server, con el mes anterior:
 *
 *   0 12 1 * * ~/bin/vector-resumen-mensual.sh     # 09:00 ART
 *
 * El backend (`GET /resumen-mensual/pendientes`) dice a quién y trae sus filas; acá se
 * calcula con las mismas funciones del inicio (`lib/resumen-mensual.ts`), se manda, y se
 * marca a quiénes les llegó (`POST /resumen-mensual/enviados`). **Correrlo dos veces no
 * manda dos mails:** la marca guarda el mes.
 *
 * - `?mes=YYYY-MM` resume otro mes (por defecto, el anterior).
 * - `?solo=<id de la cuenta>` lo manda sólo a esa cuenta **y no la marca**: para probarlo
 *   sin que después le falte el de verdad.
 *
 * Cada mail lleva `List-Unsubscribe` con un link firmado (`lib/baja-mail.ts`): Gmail y
 * los demás muestran "Desuscribirse" arriba, y el pie del mail lleva el mismo link.
 */
function secretosCoinciden(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Piloto {
  user_id: string;
  email: string;
  first_name: string | null;
  license_type: string | null;
  fecha_ppa: string | null;
  tracking_mode: string | null;
  flights: Flight[];
  aircraft: Aircraft[];
  logbooks: Logbook[];
  transactions: Transaction[];
  documents: { kind: string; expiry_date: string | null }[];
  packs: FlightPack[];
}

/** "Hoy" en Argentina, "YYYY-MM-DD". En el server: Node con ICU completo. */
const hoyEnArgentina = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

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
  const solo = params.get("solo");
  const mesPedido = params.get("mes");

  let mes: string;
  let pilotos: Piloto[];
  try {
    const q = mesPedido ? `?mes=${encodeURIComponent(mesPedido)}` : "";
    const res = await fetch(`${API_URL}/resumen-mensual/pendientes${q}`, {
      headers: { "X-Cron-Secret": esperado },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `El backend contestó ${res.status}` }, { status: 502 });
    ({ mes, pilotos } = await res.json());
  } catch (err) {
    return NextResponse.json({ error: `No se pudo consultar el backend: ${err}` }, { status: 502 });
  }
  if (solo) pilotos = pilotos.filter((p) => p.user_id === solo);

  const hoyIso = hoyEnArgentina();
  const exitosos: string[] = [];
  const problemas: string[] = [];
  for (const p of pilotos) {
    try {
      const resumen = calcularResumen({
        mes,
        hoyIso,
        nombre: p.first_name,
        licencia: p.license_type,
        fechaPpa: p.fecha_ppa,
        trackingMode: p.tracking_mode,
        flights: p.flights,
        aircraft: p.aircraft,
        logbooks: p.logbooks,
        transactions: p.transactions,
        documents: p.documents,
        packs: p.packs,
        travesiaLarga: esTravesiaLarga,
      });
      const baja = linksDeBaja(APP_URL, p.user_id, esperado);
      const mensaje = armarMensajeResumen(resumen, { appUrl: APP_URL, linkBaja: baja.pagina });
      const r = await enviarConSeguimiento({
        para: p.email,
        userId: p.user_id,
        tipo: "resumen-mensual",
        clave: mes,
        mensaje,
        cabeceras: {
          "List-Unsubscribe": `<${baja.unClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        // La baja no pasa por la redirección: tiene que andar aunque el seguimiento falle.
        sinSeguir: [baja.pagina],
      });
      if (r.aviso) problemas.push(`${p.user_id}: ${r.aviso}`);
      if (r.enviado) exitosos.push(p.user_id);
      // Sin el mail en el log: el id alcanza para buscarlo.
      else problemas.push(`${p.user_id}: ${r.motivo ?? "no se pudo enviar"}`);
    } catch (err) {
      // Un piloto con datos raros no puede dejar sin resumen a los demás.
      problemas.push(`${p.user_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let marcados = 0;
  if (exitosos.length && !solo) {
    try {
      const res = await fetch(`${API_URL}/resumen-mensual/enviados`, {
        method: "POST",
        headers: { "X-Cron-Secret": esperado, "Content-Type": "application/json" },
        body: JSON.stringify({ mes, user_ids: exitosos }),
      });
      if (res.ok) marcados = (await res.json()).marcados ?? 0;
      else problemas.push(`marcar enviados: el backend contestó ${res.status}`);
    } catch (err) {
      problemas.push(`marcar enviados: ${err}`);
    }
  }

  return NextResponse.json({ mes, pendientes: pilotos.length, enviados: exitosos.length, marcados, problemas });
}
