import { DECLARACION_RAAC, REGLAS_RAAC, respuestaRaac } from "@/lib/raac-copiloto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { chatConRespaldo } from "@/lib/gemini";
import { calculateFlightDuration, documentStatus } from "@/lib/utils";
import { sendWhatsAppDocument, sendWhatsAppMessage } from "@/lib/whatsapp";
import { armarPdfDelLibro } from "@/lib/libro-anac-armar";
import { nombreDelPeriodo, resumenDeHoras } from "@/lib/resumen-horas";
import { pdfDelResumen } from "@/lib/resumen-horas-pdf";
import type { Flight, Profile } from "@/types";
import { apellidoYNombre, fechaDeGeneracion } from "@/lib/libro-anac";
import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { timingSafeEqual } from "crypto";
import { anacIndicator } from "@/lib/madhel-reference";
import { componerFicha, datosAip } from "@/lib/aip";
import {
  ChatEntry,
  alreadyHandled,
  breakdownError,
  isAffirmation,
  pendingFlight,
  proposalSummary,
  rateLimited,
  writeProposedFlight,
  yaAvisadoDelLimite,
} from "@/lib/copilot-guards";

// Compares the caller-supplied secret against the configured one without leaking timing info,
// and without throwing when lengths differ (timingSafeEqual requires equal-length buffers).
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Fast path for retries that arrive while this process is still alive.
 *
 * It is only a fast path: the set empties on every restart, and this process has
 * been restarted well over a hundred times. The durable check lives in
 * `alreadyHandled`, against the stored chat history — without it, a Kapso retry
 * that lands just after a deploy logs the pilot's flight twice.
 */
const processedMessageIds = new Set<string>();

function formatForWhatsApp(text: string): string {
  let formatted = text;

  // 1. Convert headers (e.g. ### Title) to bold uppercase titles: *TITLE*
  formatted = formatted.replace(/^(#{1,6})\s+(.*?)$/gm, (match, hashes, title) => {
    return `\n*${title.trim().toUpperCase()}*\n`;
  });

  // 2. Convert markdown bold (**text**) to WhatsApp bold (*text*)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "*$1*");

  // 3. Remove horizontal rules
  formatted = formatted.replace(/^\s*[-*_]{3,}\s*$/gm, "\n*~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~*\n");

  // 4. Format bullet lists: convert lines starting with `* ` or `- ` (plus optional whitespace) to `• ` and strip extra indentation
  formatted = formatted.replace(/^\s*[-*]\s+(.*?)$/gm, "• $1");

  // 5. Clean up numbered lists (remove extra spaces between number and text)
  formatted = formatted.replace(/^\s*(\d+)\.\s+(.*?)$/gm, "$1. $2");

  // 6. Format Markdown links [text](url) to "text (url)" or "text: url"
  formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, "$1: $2");

  // 7. Remove excessive vertical whitespace (more than 2 consecutive newlines)
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return formatted.trim();
}

// Helper to fetch MADHEL and NOTAMs directly from official sources
async function getAirportInfoHelper(icao: string) {
  const code = icao.trim().toUpperCase();
  

  const indicator = anacIndicator(code);


  let madhelSummary = "No se encontraron datos MADHEL para este aeródromo.";
  let notamSummary = "Sin NOTAMs activos.";

  // Fetch MADHEL
  try {
    const madhelRes = await fetch(`https://datos.anac.gob.ar/madhel/api/v2/airports/${indicator}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      }
    });

    if (madhelRes.ok) {
      const mJson = await madhelRes.json();
      if (mJson && mJson.metadata) {
        /*
          El AIP rellena lo que MADHEL deja vacío en los aeródromos controlados, y **nunca
          lo pisa**. Ver `lib/aip.ts`: antes acá había una tabla escrita a mano que sí lo
          pisaba, y le dictaba al modelo frecuencias que no existen.
        */
        const aip = datosAip(code) ?? datosAip(mJson.metadata.identifiers?.icao ?? "");
        let radioList: string[] = [];
        if (mJson.data?.helpers_system?.radio && mJson.data.helpers_system.radio.length > 0) {
          radioList = mJson.data.helpers_system.radio;
        } else if (mJson.data?.norms?.particular?.content) {
          const freqMatch = mJson.data.norms.particular.content.match(/(?:Frecuencia|canal de llamada|Frec)\s*(\d+[\,\.]\d+)\s*MHz/i);
          if (freqMatch) radioList = [`Frecuencia común: ${freqMatch[1]} MHz`];
        }

        let locStr = mJson.data?.human_readable_localization || "";
        if (locStr.includes("***Consultar en el sitio web")) locStr = "";

        const ficha = componerFicha(
          {
            runways: mJson.data?.rwy || [],
            radio: radioList,
            localization: locStr,
            fuel: mJson.data?.fuel || "",
            telephone: mJson.data?.telephone || [],
          },
          aip
        );

        const m = {
          fullName: mJson.human_readable_identifier || mJson.the_geom?.properties?.name || code,
          state: mJson.metadata.localization?.state || "",
          fir: mJson.metadata.localization?.fir || "",
          elevation: mJson.metadata.localization?.elevation || 0,
          condition: mJson.metadata.condition || "",
          control: mJson.metadata.control || "",
          traffic: mJson.metadata.traffic || "",
          runways: ficha.runways,
          radio: ficha.radio,
          localization: ficha.localization,
          fuel: ficha.fuel || "No especificado",
          telephone: ficha.telephone,
          norms: mJson.data?.norms?.particular?.content || ""
        };

        madhelSummary = [
          `Aeródromo: ${m.fullName}`,
          `Estado: ${m.state || "Desconocido"}`,
          `FIR: ${m.fir || "Desconocido"}`,
          `Elevación: ${m.elevation}m (${Math.round(m.elevation * 3.28084)}ft)`,
          `Condición: ${m.condition}`,
          `Control: ${m.control}`,
          `Tráfico: ${m.traffic}`,
          `Pistas: ${m.runways?.length > 0 ? m.runways.join(" | ") : "No especificadas"}`,
          `Frecuencias: ${m.radio?.length > 0 ? m.radio.join(" | ") : "No especificadas"}`,
          `Ubicación: ${m.localization || "No especificada"}`,
          `Combustible: ${m.fuel || "No especificado"}`,
          `Teléfonos: ${m.telephone?.length > 0 ? m.telephone.join(", ") : "No especificados"}`,
          m.norms ? `Normas Particulares: ${m.norms}` : ""
        ].filter(Boolean).join("\n");
      }
    }
  } catch (e: any) {
    console.error("Error fetching MADHEL in helper:", e);
    madhelSummary = `Error consultando MADHEL: ${e.message}`;
  }

  // Fetch NOTAMs
  try {
    const notamRes = await fetch("https://ais.anac.gob.ar/notam/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://ais.anac.gob.ar/notam",
        "User-Agent": "Mozilla/5.0"
      },
      body: `indicador=${encodeURIComponent(indicator)}`
    });

    if (notamRes.ok) {
      const nJson = await notamRes.json();
      if (Array.isArray(nJson) && nJson.length > 0) {
        notamSummary = nJson.map((item: any, i: number) => {
          const rawBody = (item.novedad || "").replace(/<\/?[^>]+(>|$)/g, "").trim();
          let textEsp = rawBody;
          if (rawBody.includes("Versión en Español:")) {
            textEsp = rawBody.split("Versión en Español:")[1].trim();
          }
          const toVal = item.hasta === "0000-00-00 00:00:00" ? "PERMANENTE" : item.hasta;
          return `NOTAM ${i + 1} [${item.notam || "NOTAM"}] Desde: ${item.desde || ""} | Hasta: ${toVal}\n${textEsp}`;
        }).join("\n\n");
      } else {
        notamSummary = "Sin NOTAMs activos.";
      }
    }
  } catch (e: any) {
    console.error("Error fetching NOTAMs in helper:", e);
    notamSummary = `Error consultando NOTAMs: ${e.message}`;
  }

  return {
    madhel: madhelSummary,
    notams: notamSummary
  };
}

function buildFlightContext(
  flights: any[],
  aircraft: any[],
  profile: any,
  packs: any[],
  transactions: any[],
  balance: number,
  session: any,
  documents: any[] = []
): string {
  const aircraftMap = new Map(aircraft.map((a: any) => [a.id, a]));
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const totalHours = flights.reduce((s: number, f: any) => s + f.duration, 0);
  const totalLandings = flights.reduce((s: number, f: any) => s + f.landings, 0);

  const hoursPerAircraft = new Map<string, number>();
  for (const f of flights) {
    const ac = f.aircraft_id ? aircraftMap.get(f.aircraft_id) : undefined;
    const key = ac ? `${ac.registration} (${ac.icao})` : "Desconocida";
    hoursPerAircraft.set(key, (hoursPerAircraft.get(key) || 0) + f.duration);
  }

  const routeFreq = new Map<string, number>();
  for (const f of flights) {
    const r = f.route.trim().toUpperCase();
    routeFreq.set(r, (routeFreq.get(r) || 0) + 1);
  }

  const topRoutes = Array.from(routeFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([r, n]) => `${r} (${n} veces)`)
    .join(", ");

  const flightLines = [...flights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((f: any) => {
      const ac = f.aircraft_id ? aircraftMap.get(f.aircraft_id) : undefined;
      const d = new Date(f.date + "T00:00:00");
      const label = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const acStr = ac ? `${ac.registration} (${ac.icao}, ${ac.type_acft || "MONT-T"})` : "aeronave desconocida";
      const times = f.takeoff && f.landing
        ? ` | Salida ${f.takeoff.slice(11, 16)} UTC - Llegada ${f.landing.slice(11, 16)} UTC`
        : "";
      const cols = [
        f.pic_day_loc   ? `PIC diurno local ${f.pic_day_loc}h` : "",
        f.pic_day_tra   ? `PIC diurno traslado ${f.pic_day_tra}h` : "",
        f.pic_night_loc ? `PIC nocturno local ${f.pic_night_loc}h` : "",
        f.pic_night_tra ? `PIC nocturno traslado ${f.pic_night_tra}h` : "",
        f.sic_day_loc   ? `SIC diurno local ${f.sic_day_loc}h` : "",
        f.imc_pil       ? `IMC piloto ${f.imc_pil}h` : "",
        f.capota        ? `Capotaje ${f.capota}h` : "",
      ].filter(Boolean).join(", ");
      return `- [ID: ${f.id}] ${label}: ${f.route.toUpperCase()} | ${acStr} | ${f.duration}h | ${f.landings} aterrizajes${times}${cols ? " | " + cols : ""}`;
    })
    .join("\n");

  const acSummary = Array.from(hoursPerAircraft.entries())
    .map(([k, h]) => `${k}: ${h.toFixed(1)}h`)
    .join("; ");

  const txLines = transactions.slice(0, 5).map((t: any) => {
    return `- [${t.type.toUpperCase()}] ${new Date(t.created_at).toLocaleDateString("es-AR")}: $${t.amount} | ${t.description || ""}`;
  }).join("\n");

  const packLines = packs.map((p: any) => {
    const acRegs = p.aircraft_ids.map((aid: string) => aircraftMap.get(aid)?.registration || "Avión").join(", ");
    return `- Pack "${p.name}": ${p.remaining_hours.toFixed(1)} hs restantes de ${p.total_hours.toFixed(1)} hs totales (aviones: ${acRegs}) | ${p.is_active ? "Activo" : "Inactivo"}`;
  }).join("\n");

  const activeSessionStr = session?.active 
    ? `Sí, activo en ${aircraftMap.get(session.session.aircraft_id)?.registration || "Desconocido"} desde las ${new Date(session.session.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : "No hay vuelo en curso.";

  // Expiries live in the documents table now, so the copilot can answer about
  // the licence or the insurance too — not only the medical.
  const documentLines = documents
    .map((doc: any) => {
      const status = documentStatus(doc.expiry_date);
      // Sin fecha no se escribe "vence null": desde la migración 007 un documento
      // puede no caducar, y decir que vence en null es peor que no decir nada.
      const cuando = doc.expiry_date ? `vence ${doc.expiry_date}` : "no vence";
      return `- ${doc.name}: ${cuando} (${status.label.toLowerCase()})`;
    })
    .join("\n");

  /**
   * Los que **ya cruzaron un umbral de aviso** y por lo tanto el copiloto tiene
   * que mencionar sin que se lo pregunten.
   *
   * Es la mitad gratis del sistema de avisos. Un aviso proactivo por WhatsApp es
   * una plantilla y Meta la cobra por entrega; **responder dentro de la ventana de
   * 24 h no se cobra nunca**. Así que si el piloto ya está escribiendo, avisarle
   * sale cero.
   *
   * No reemplaza al aviso proactivo —sólo llega si el piloto abre la conversación—
   * pero la información ya estaba acá sin usarse.
   */
  const urgentes = documents
    .filter((doc: any) => {
      const t = documentStatus(doc.expiry_date).tone;
      return t === "expired" || t === "critical" || t === "warning";
    })
    .map((doc: any) => `- ${doc.name}: ${documentStatus(doc.expiry_date).label.toLowerCase()}`)
    .join("\n");

  return `
## Perfil del piloto
Nombre: ${profile ? `${profile.first_name} ${profile.last_name}` : "Desconocido"}
Licencia: ${profile?.license_type || "No especificada"}
Modo de seguimiento: ${profile?.tracking_mode === "balance" ? "Saldo en Cuenta ($)" : "Packs de Horas"}

## Documentos y vencimientos
${documentLines || "(Sin documentos cargados)"}
${urgentes ? `\n### ⚠️ Requieren atención\n${urgentes}` : ""}

## Estado Financiero (Modo Saldo en Cuenta)
Saldo disponible en cuenta: $ ${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
Últimos movimientos de dinero:
${txLines || "(Sin transacciones registradas)"}

## Packs de Horas (Modo Packs de Horas)
${packLines || "(Sin packs de horas registrados)"}

## Vuelo en Vivo (Flight Helper)
Vuelo actual en curso: ${activeSessionStr}

## Resumen estadístico de bitácora
Total vuelos registrados: ${flights.length}
Total horas voladas: ${totalHours.toFixed(1)}h
Total aterrizajes: ${totalLandings}
Aeronaves usadas: ${aircraft.map((a: any) => `${a.registration} (${a.icao}, ${a.type})`).join("; ")}
Horas por aeronave: ${acSummary}
Rutas más frecuentes: ${topRoutes}
Vuelo más largo: ${flights.length > 0 ? Math.max(...flights.map((f: any) => f.duration)).toFixed(1) + "h" : "0h"}
Promedio por vuelo: ${flights.length > 0 ? (totalHours / flights.length).toFixed(1) + "h" : "0h"}

## Registro completo de vuelos (${flights.length} vuelos)
${flightLines}
`.trim();
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("WHATSAPP_VERIFY_TOKEN is not configured; rejecting webhook verification.");
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && secretsMatch(token, verifyToken)) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }
  return new Response("OK", { status: 200 });
}

/**
 * Un veredicto de entrega de Meta, si el payload traía uno.
 *
 * Meta manda estos avisos por el **mismo webhook** que los mensajes entrantes,
 * con `statuses` en lugar de `messages`. Hasta ahora ninguna de las tres ramas de
 * parseo de abajo matcheaba esa forma, así que se caían al final con el teléfono
 * vacío y se descartaban en silencio: los `failed` ya venían llegando y los
 * tirábamos.
 *
 * Se aceptan también las formas de Kapso porque el resto del archivo ya convive
 * con sus dos envoltorios y no hay razón para suponer que acá manda sólo Meta
 * crudo.
 */
function parseStatus(body: any): { messageId: string; status: string } | null {
  const meta = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  const kapso = body?.status && body?.message_id ? body : null;
  const evento =
    typeof body?.event === "string" && body.event.startsWith("whatsapp.message.status")
      ? body?.data
      : null;

  const s = meta || evento || kapso;
  if (!s) return null;

  const messageId = s.id || s.message_id || "";
  const status = String(s.status || "").toLowerCase();
  if (!messageId || !status) return null;
  return { messageId, status };
}

/**
 * Le avisa al backend que un aviso de vencimiento no llegó, para que limpie la
 * marca y el barrido lo reintente mañana.
 *
 * **Silenciosa cuando no hay coincidencia**, y esa es la parte importante: por acá
 * pasan los status de *todos* los mensajes que salen, incluidas las respuestas del
 * copiloto. Que un id no corresponda a ningún documento es lo normal, no un error.
 */
async function desmarcarAvisoFallido(messageId: string): Promise<void> {
  const secret = process.env.DOCUMENTS_ALERT_SECRET;
  if (!secret) {
    console.error(
      "Llegó un status 'failed' pero DOCUMENTS_ALERT_SECRET no está configurada — el aviso no se va a reintentar."
    );
    return;
  }

  // Local por defecto, con /api: nginx lo agrega solo por el dominio público, acá
  // no hay nginx de por medio. Causa de la caída del 2026-08-27, ver `lib/api.ts`.
  const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
  try {
    // El id va por query string y el secreto por cabecera, igual que en el resto
    // del barrido: la URL entera se escribe en el access log de nginx.
    const query = new URLSearchParams({ message_id: messageId });
    const res = await fetch(`${API_URL}/document-alerts/failed?${query}`, {
      method: "POST",
      cache: "no-store",
      headers: { "X-Cron-Secret": secret },
    });
    if (!res.ok) {
      console.error("No se pudo desmarcar el aviso fallido:", res.status, await res.text());
    }
  } catch (err) {
    console.error("No se pudo avisar del fallo de entrega:", err);
  }
}

export async function POST(req: NextRequest) {
  // Authenticate via Kapso's X-Webhook-Signature header (HMAC-SHA256 of raw body with our secret).
  //
  // Falla cerrado. Antes, sin `KAPSO_WEBHOOK_SECRET` seteada, se saltaba la
  // validación entera y quedaba abierto: cualquiera podía postear un payload
  // armado con el teléfono de otro piloto y hacer que el copiloto contestara con
  // sus datos. Y no estaba seteada.
  const webhookSecret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("KAPSO_WEBHOOK_SECRET no está configurada — se rechaza el webhook.");
    return new Response("Service Unavailable", { status: 503 });
  }

  const rawBodyText: string = await req.text();
  const { createHmac } = await import("crypto");
  const expectedSig = createHmac("sha256", webhookSecret).update(rawBodyText).digest("hex");
  const providedSig = req.headers.get("x-webhook-signature") || "";
  // Kapso may send the signature as "sha256=<hex>" or just "<hex>"
  const normalizedSig = providedSig.startsWith("sha256=") ? providedSig.slice(7) : providedSig;
  if (!normalizedSig || !secretsMatch(normalizedSig, expectedSig)) {
    // Nunca loguear `expectedSig`: es una firma válida para este cuerpo exacto,
    // así que dejarla en los logs le regala una a quien pueda leerlos.
    console.error("Rejected WhatsApp webhook POST: invalid X-Webhook-Signature.");
    return new Response("Forbidden", { status: 403 });
  }

  let fromNumber = "";
  let payloadPhoneNumberId = "";
  try {
    // Ya se consumió arriba para verificar la firma, y `req.text()` no se puede
    // llamar dos veces — el fallback que había acá quedó muerto cuando la
    // verificación pasó a ser obligatoria.
    const body = JSON.parse(rawBodyText);
    console.log("Incoming WhatsApp Webhook Payload:", JSON.stringify(body, null, 2));

    // Los veredictos de entrega se resuelven acá y no siguen de largo.
    //
    // Va **antes** del deduplicador: un status trae el id del mensaje *saliente*,
    // que para un aviso de vencimiento es un id que este proceso ya vio al
    // enviarlo. Dejarlo pasar por `processedMessageIds` lo haría descartar como si
    // fuera un reenvío del webhook, que es justo el aviso que no queremos perder.
    const status = parseStatus(body);
    if (status) {
      if (status.status === "failed") {
        await desmarcarAvisoFallido(status.messageId);
      }
      // El resto —`sent`, `delivered`, `read`— no cambia nada: el documento ya
      // quedó marcado al aceptarse el envío. Se responde 200 igual para que Meta
      // no reintente.
      return NextResponse.json({ success: true, status: status.status });
    }

    let messageId = "";
    let messageText = "";
    let mediaId = "";
    let audioMimeType = "";

    // Parse Kapso format or Meta raw format
    if (body.message) {
      messageId = body.message.id || "";
      fromNumber = body.message.from || body.conversation?.phone_number || "";
      payloadPhoneNumberId = body.phone_number_id || body.conversation?.phone_number_id || "";
      if (body.message.type === "audio" && body.message.audio) {
        mediaId = body.message.audio.id;
        audioMimeType = body.message.audio.mime_type || "audio/ogg";
      } else {
        messageText = body.message.text?.body || body.message.kapso?.content || "";
      }
    } else if (body.event === "whatsapp.message.received" && body.data) {
      messageId = body.data.id || "";
      fromNumber = body.data.from;
      messageText = body.data.text?.body || "";
    } else if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      messageId = msg.id || "";
      fromNumber = msg.from;
      payloadPhoneNumberId = body.entry[0].changes[0].value.metadata?.phone_number_id || "";
      if (msg.type === "audio" && msg.audio) {
        mediaId = msg.audio.id;
        audioMimeType = msg.audio.mime_type || "audio/ogg";
      } else {
        messageText = msg.text?.body || "";
      }
    }

    // Deduplicate webhook retries
    if (messageId) {
      if (processedMessageIds.has(messageId)) {
        console.log(`Duplicate WhatsApp webhook delivery detected for message ID: ${messageId}. Ignoring.`);
        return NextResponse.json({ success: true, message: "Duplicate message ignored" });
      }
      processedMessageIds.add(messageId);

      // Keep cache size manageable to prevent memory growth
      if (processedMessageIds.size > 1000) {
        const first = processedMessageIds.values().next().value;
        if (first) processedMessageIds.delete(first);
      }
    }

    let audioBuffer: Buffer | null = null;
    if (mediaId) {
      console.log(`Processing incoming WhatsApp audio. MediaID: ${mediaId}, MimeType: ${audioMimeType}`);
      try {
        const mediaRes = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${mediaId}?phone_number_id=${payloadPhoneNumberId || "597907523413541"}`, {
          headers: { "X-API-Key": process.env.KAPSO_API_KEY || "" }
        });
        if (mediaRes.ok) {
          const mediaMeta = await mediaRes.json();
          const downloadUrl = mediaMeta.download_url;
          if (downloadUrl) {
            const audioFileRes = await fetch(downloadUrl);
            if (audioFileRes.ok) {
              const arrayBuffer = await audioFileRes.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              console.log(`Successfully downloaded audio binary. Size: ${audioBuffer.length} bytes`);
            } else {
              console.error(`Failed to download audio file from Kapso CDN. Status: ${audioFileRes.status}`);
            }
          } else {
            console.error("Kapso media metadata response does not contain a download_url");
          }
        } else {
          console.error(`Failed to fetch media metadata from Kapso. Status: ${mediaRes.status}`);
        }
      } catch (err) {
        console.error("Error retrieving media from Kapso:", err);
      }
    }

    if (!fromNumber || (!messageText.trim() && !audioBuffer)) {
      return NextResponse.json({ success: true, message: "Ignored (empty values)" });
    }

    // Fetch user dashboard data from Python backend using WhatsApp phone number.
    //
    // No fallback constant. The one that used to live here is in a public repo,
    // and since neither .env set the variable it *was* the live credential for an
    // endpoint that reads any pilot's logbook by phone number. The backend now
    // fails closed too, so a missing variable has to be loud on both sides rather
    // than quietly downgrading to a published secret.
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!secret) {
      console.error("WHATSAPP_WEBHOOK_SECRET no está configurada — no se consulta el backend.");
      return NextResponse.json(
        { success: false, message: "WhatsApp integration is not configured." },
        { status: 503 }
      );
    }
    // Local por defecto, con /api: nginx lo agrega solo por el dominio público, acá
    // no hay nginx de por medio. Causa de la caída del 2026-08-27, ver `lib/api.ts`.
    const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

    // H1.1, paso 2 de 3. El secreto y el teléfono viajan en cabeceras y ya no en
    // la URL: la query string queda escrita en texto plano en los logs de nginx y
    // de PM2 en cada mensaje que recibe el bot.
    //
    // El backend ya acepta las dos formas (paso 1, desplegado y verificado en
    // producción el 2026-08-06: una llamada sin parámetros devuelve 401 y no 400,
    // que es lo que devolvía cuando `secret` era obligatorio). El paso 3 le saca
    // el soporte de query string, después de confirmar en los logs que no queda
    // ninguna llamada vieja.
    const vectorHeaders = (extra: Record<string, string> = {}) => ({
      "X-Vector-Secret": secret,
      "X-Vector-Phone": fromNumber,
      ...extra,
    });


    const userRes = await fetch(`${API_URL}/whatsapp/user-data`, { headers: vectorHeaders() });
    if (!userRes.ok) {
      const errText = await userRes.text().catch(() => "");
      console.error("Failed to fetch user-data from backend. Status:", userRes.status, "Body:", errText, "URL:", userRes.url);

      // **Sólo un 404 significa que el número no está vinculado.** Cualquier otro
      // status es un problema nuestro —401 por secreto desalineado, 5xx por
      // backend caído— y decirle al piloto "tu número no está asociado" lo manda
      // a revisar su perfil, que está bien.
      //
      // Ya pasó dos veces: en el plan 07 se perdió un buen rato buscando en la
      // tabla de perfiles un problema que estaba en el `.env`, y volvió a
      // confundir el 2026-08-11 al conectar el número de producción.
      const noVinculado = userRes.status === 404;
      await sendWhatsAppMessage(
        fromNumber,
        noVinculado
          ? "Hola 🛩️ Tu número de WhatsApp no está asociado a ningún piloto en Vector. Ingresá a la web, ve a tu Perfil y vinculá tu número en el campo 'WhatsApp (para Copiloto IA)'."
          : "Hola 🛩️ Tuvimos un problema técnico para acceder a tus datos. No es algo de tu cuenta: ya quedó registrado y lo estamos viendo. Probá de nuevo en un rato.",
        payloadPhoneNumberId
      );
      return NextResponse.json({ success: true });
    }

    const userData = await userRes.json();
    const userApiKey = userData.profile.api_key;
    if (!userApiKey) {
      await sendWhatsAppMessage(
        fromNumber,
        "Hola 🛩️ Tu cuenta no tiene un token de acceso activo. Ingresá a la web y genera tu token en el perfil.",
        payloadPhoneNumberId
      );
      return NextResponse.json({ success: true });
    }

    const flights = userData.flights || [];
    const aircraft = userData.aircraft || [];
    const profile = userData.profile || null;
    const packs = userData.packs || [];
    const transactions = userData.transactions || [];
    const balance = userData.balance || 0;
    const session = userData.session || { active: false };
    const documents = userData.documents || [];
    const logbooks = userData.logbooks || [];

    // Fetch chat history from Python backend
    const historyRes = await fetch(`${API_URL}/whatsapp/chat-history`, { headers: vectorHeaders() });
    let history: ChatEntry[] = [];
    if (historyRes.ok) {
      const histData = await historyRes.json();
      history = histData.history || [];
    }

    // Durable de-duplication. The in-memory set above catches retries within the
    // life of this process; this catches the ones that arrive after a restart,
    // which is when it matters — a retried webhook re-runs the whole turn, and if
    // that turn was a confirmed `log_flight` the pilot gets the flight twice.
    if (alreadyHandled(history, messageId)) {
      console.log(`Duplicate delivery for message ${messageId} found in stored history. Ignoring.`);
      return NextResponse.json({ success: true, message: "Duplicate message ignored" });
    }

    // H1.3. Corta antes de llamar a Gemini, que es lo que cuesta plata.
    if (rateLimited(history)) {
      if (!yaAvisadoDelLimite(history)) {
        const aviso = "Pará un poco 🛩️ Estás mandando mensajes muy seguido. Probá de nuevo en un par de minutos.";
        await fetch(`${API_URL}/whatsapp/chat-history`, {
          method: "POST",
          headers: vectorHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            history: [
              ...history,
              { role: "user", content: messageText.trim() || "[Nota de voz]", id: messageId, at: Date.now() },
              { role: "assistant", content: aviso, rate_notice: true },
            ],
          }),
        });
        await sendWhatsAppMessage(fromNumber, aviso, payloadPhoneNumberId);
      }
      // Si ya se avisó, se descarta en silencio: contestar cada mensaje de una
      // ráfaga es gastar llamadas a Kapso para pelearle a quien la está mandando.
      return NextResponse.json({ success: true, message: "Rate limited" });
    }

    // Check for history clearing commands
    const cleanMsg = messageText.toLowerCase().trim();
    if (cleanMsg === "borrar historial" || cleanMsg === "reiniciar chat" || cleanMsg === "limpiar chat") {
      await fetch(`${API_URL}/whatsapp/chat-history`, {
        method: "POST",
        headers: vectorHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ history: [] })
      });
      await sendWhatsAppMessage(
        fromNumber,
        "Hola 🛩️ He borrado tu historial de conversación con el Copiloto IA. El chat ha sido reiniciado y listo para consultar el clima.",
        payloadPhoneNumberId
      );
      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------------
    // Confirmación de un vuelo propuesto.
    //
    // Corre ANTES del modelo y a propósito: si dependiera de que el modelo
    // vuelva a llamar a `log_flight` al leer "ok", un turno en que decida
    // contestar "listo!" sin llamar a nada dejaría al piloto creyendo que su
    // vuelo quedó registrado cuando no se escribió nada.
    //
    // Se escribe la propuesta guardada, no lo que el modelo reconstruya ahora:
    // lo que se guarda tiene que ser exactamente lo que el piloto vio.
    // ---------------------------------------------------------------------
    const proposed = pendingFlight(history);
    if (proposed) {
      if (isAffirmation(messageText)) {
        const written = await writeProposedFlight(proposed, userApiKey, API_URL);
        const historyAfter: ChatEntry[] = [
          ...history.filter((h) => !h.pending_flight),
          { role: "user", content: messageText.trim() || "[Nota de voz]", id: messageId, at: Date.now() },
          { role: "assistant", content: written.message },
        ];
        await fetch(`${API_URL}/whatsapp/chat-history`, {
          method: "POST",
          headers: vectorHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ history: historyAfter }),
        });
        await sendWhatsAppMessage(fromNumber, formatForWhatsApp(written.message), payloadPhoneNumberId);
        return NextResponse.json({ success: true });
      }
      // Cualquier otra cosa cancela la propuesta: si el piloto corrige un dato,
      // el turno siguiente arma una nueva. Nunca se arrastra una vieja.
      history = history.filter((h) => !h.pending_flight);
    }

    const flightContext = buildFlightContext(
      flights,
      aircraft,
      profile,
      packs,
      transactions,
      balance,
      session,
      documents
    );

    const todayStr = new Date().toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const [d, m, y] = todayStr.split("/");
    const currentLocalDate = `${y}-${m}-${d}`;

    const systemPrompt = `Eres un asistente de aviación inteligente integrado en Vector, una aplicación de bitácora de vuelo.
Estás interactuando con el piloto a través de WHATSAPP.
Tu rol es ayudar al piloto a analizar su historial de vuelos, estadísticas, responder preguntas, y también puedes EDITAR, REGISTRAR o ELIMINAR vuelos del libro de vuelo usando tus herramientas integradas.

Responde siempre en español, de forma concisa y clara. Usa emojis cuando sean útiles.

## VENCIMIENTOS: avisá sin que te pregunten
Si el contexto trae una sección "⚠️ Requieren atención", mencionalo **una sola vez
al principio de tu primera respuesta de la conversación**, en una línea, antes de
contestar lo que el piloto haya preguntado. Después no lo repitas salvo que él
saque el tema.

Es el único canal por el que hoy se entera: el aviso automático de vencimientos
necesita una plantilla paga de WhatsApp, y esta conversación no cuesta nada.

No dramatices ni repitas la lista entera si es larga: nombrá lo más urgente y
ofrecé el detalle. Y no inventes fechas — usá exactamente las del contexto.

La fecha actual de hoy es: ${currentLocalDate} (formato YYYY-MM-DD). Usa esta fecha actual de referencia cuando el usuario mencione "hoy", "ayer" o fechas relativas.

## REGLAS CRÍTICAS PARA REGISTRO Y EDICIÓN:
1. NUNCA inventes información. Si falta algún dato obligatorio para registrar un vuelo, pídeselo de forma clara al usuario.
2. Campos obligatorios para registrar un vuelo ('log_flight'):
   - aircraft_registration: Matrícula de la aeronave (debe coincidir con alguna en el hangar, ej: LV-S153).
   - date: Fecha (YYYY-MM-DD).
   - route: Ruta (ej: SADF - SADR).
   - duration: Horas de duración (ej: 1.5). Calcula o valida la duración SIEMPRE usando la conversión de minutos a decimales aeronáuticos que se detalla abajo.
   - takeoff: Hora de salida, motor encendido (HH:MM). Es lo que pide ANAC, no la hora de rueda arriba.
   - landing: Hora de llegada, motor apagado (HH:MM).
   - landings: Aterrizajes (número entero, por defecto pídelo o pon 1 si está implícito).
   - purpose: Finalidad del vuelo (debe ser un código corto como VP para Vuelo Privado, ENT para Entrenamiento, EXA para Examen, INST para Instrucción, etc. Si el piloto no lo indica, PREGÚNTALE siempre primero).
3. CONFIRMACIÓN: llamar a 'log_flight' NO registra el vuelo. Deja una propuesta pendiente, y el sistema —no vos— le muestra al piloto el resumen exacto de lo que se va a escribir y le pide que confirme. El vuelo se escribe recién cuando el piloto responde que sí, y se escribe la propuesta tal cual quedó.
   - Por eso no hace falta que redactes vos el resumen ni que pidas la confirmación: llamá a 'log_flight' con los datos completos y el sistema se encarga.
   - Si el piloto corrige un dato, volvé a llamar a 'log_flight' con los datos corregidos: la propuesta anterior se descarta sola.
   - El desglose PIC/SIC no puede sumar más que la duración del vuelo. Si lo intentás, la herramienta te lo rechaza con el detalle.
4. Si el usuario te pide editar ('update_flight') o eliminar ('delete_flight') un vuelo, busca el UUID de ese vuelo en tu contexto de vuelos registrados (representado como [ID: uuid]) y úsalo para llamar a la función. Si no estás seguro de cuál vuelo se refiere, muéstrale los candidatos con sus datos y pídele confirmación.
5. Si falta cualquier dato requerido, detente y pregunta amablemente. No inventes nada.

## REGLAS PARA INICIAR/FINALIZAR VUELO EN VIVO (cronómetro):
1. El contexto te indica si el piloto ya tiene un vuelo en curso ("Vuelo en Vivo" arriba). Úsalo para decidir si el piloto quiere iniciar o finalizar.
2. Si el piloto avisa que está por despegar o iniciar un vuelo, llama a 'start_flight_session' con la matrícula de la aeronave. NO pidas confirmación previa para esto (a diferencia de 'log_flight'), es una acción reversible de bajo riesgo.
3. Si el piloto avisa que aterrizó o terminó el vuelo, llama a 'end_flight_session'. Al recibir la respuesta, informa la duración calculada y, si te devuelve un link, compártelo para que el piloto revise y guarde el vuelo completo con todos los detalles.
4. Solo incluye el parámetro 'time' si el piloto menciona una hora explícita (ej. "arranqué a las 14:30"); si no la menciona, omite el parámetro por completo para que se use la hora actual.

## LÍMITE OPERATIVO (no negociable):
Los datos de aeródromo, pistas, frecuencias y teléfonos que devuelven tus herramientas son de referencia y pueden estar desactualizados. Cuando informes pistas, frecuencias, combustible o cualquier dato para una operación, cerrá SIEMPRE recordando que hay que verificarlo contra el AIP y los NOTAM vigentes antes de volar. Nunca presentes esta información como apta para tomar una decisión operativa por sí sola.

${REGLAS_RAAC}

## REGLAS PARA METAR, TAF, NOTAM Y DATOS DE AERÓDROMO:
1. Si el usuario te pregunta por el clima, reporte meteorológico, METAR o TAF de un aeropuerto (ej: "clima en SADF" o "METAR SAEZ"), debes obtenerlo usando la herramienta 'get_airport_weather'.
2. Al recibir la respuesta de la herramienta, debes decodificar/explicar el reporte METAR y TAF en español claro y conciso para el piloto, e incluir el reporte en texto crudo (raw) al final.
3. Si el usuario te pregunta por NOTAMs, pistas, frecuencias, datos técnicos del aeródromo, combustible, teléfonos, normas operativas, o si un aeródromo está ABIERTO o CERRADO (ej: "NOTAMs de SAAK", "frecuencias de SADF", "pistas de Ezeiza", "info MGI", "notam FDO"), debes usar la herramienta 'get_airport_info' que consulta el registro oficial MADHEL de la ANAC.
4. Al recibir los datos de 'get_airport_info', preséntale al piloto la ficha técnica en formato claro y organizado, incluyendo los NOTAMs si los hay.
5. CRÍTICO: La herramienta 'get_airport_info' acepta TANTO códigos OACI de 4 letras (SADF, SAEZ, SAAK) COMO indicadores locales ANAC de 3 letras (MGI, FDO, GEZ, AER, EZE, PAL, PTA). NUNCA inventes ni modifiques el código: si el usuario dice 'MGI' llama a la herramienta con 'MGI', si dice 'info FDO' usa 'FDO', si dice 'SADF' usa 'SADF'. No le agregues ni quites letras.

## EL LIBRO DE VUELO EN PDF:
Si el piloto pide su libro de vuelo, la bitácora en PDF, "las hojas del libro" o algo parecido, usá la herramienta 'send_logbook_pdf': se lo manda como archivo por este chat, con la hoja del libro de ANAC. Si lleva más de un libro en Vector y nombra uno, pasá ese nombre. Después confirmale en una línea que se lo mandaste. No lo llames "oficial": es el libro en papel que convive con el CAD de ANAC.

## EL RESUMEN DE HORAS EN PDF:
Si el piloto pide que le mandes un resumen o un certificado de sus horas, o "mis horas del año / del mes / de septiembre" como archivo, usá 'send_hours_pdf' con el período en fechas YYYY-MM-DD (hoy es ${currentLocalDate}): "este año" es del 1 de enero a hoy; "septiembre", del 1 al 30 de septiembre; sin período, toda la bitácora (sin 'desde' ni 'hasta'). Si sólo pregunta un número ("¿cuántas horas tengo?"), contestale con texto, sin PDF. Después confirmale en una línea qué le mandaste. No lo llames "certificado oficial": es un resumen hecho con su bitácora.

## CONVERSIÓN DE MINUTOS A DECIMALES AERONÁUTICOS:
Para determinar la duración de un vuelo o validarla, resta la hora de despegue de la de aterrizaje para obtener horas y minutos. Los minutos deben convertirse a decimales con precisión según la siguiente tabla exacta:
- 0 a 2 minutos: .0
- 3 a 8 minutos: .1
- 9 a 14 minutos: .2
- 15 a 20 minutos: .3
- 21 a 26 minutos: .4
- 27 a 33 minutos: .5
- 34 a 39 minutos: .6
- 40 a 45 minutos: .7
- 46 a 51 minutos: .8
- 52 a 57 minutos: .9
- 58 a 60 minutos: 1.0 (suma una hora al total)
Ejemplos: 
- Un vuelo de 1 hora y 15 minutos dura exactamente 1.3 horas (y no 1.25).
- Un vuelo de 45 minutos dura exactamente 0.7 horas.
Informa al usuario usando siempre esta tabla para ser consistente con la web.

## Datos de la bitácora del piloto:
${flightContext}`;

    // El modelo y su respaldo viven en lib/gemini.ts.
    const parametrosModelo: GenerateContentConfig = {
      systemInstruction: systemPrompt,
      tools: [
        {
          functionDeclarations: [
            {
              name: "log_flight",
              description: "Registra un nuevo vuelo en la bitácora del piloto. Todos los campos requeridos son estrictamente obligatorios.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  aircraft_registration: { type: Type.STRING, description: "Matrícula de la aeronave (ej. LV-S153)" },
                  date: { type: Type.STRING, description: "Fecha del vuelo en formato YYYY-MM-DD" },
                  route: { type: Type.STRING, description: "Ruta del vuelo (ej. SADF - SADR)" },
                  duration: { type: Type.NUMBER, description: "Duración total del vuelo en horas decimales (ej. 1.2)" },
                  takeoff: { type: Type.STRING, description: "Hora de salida (motor encendido) en formato de 24 hs (HH:MM)" },
                  landing: { type: Type.STRING, description: "Hora de llegada (motor apagado) en formato de 24 hs (HH:MM)" },
                  landings: { type: Type.INTEGER, description: "Cantidad de aterrizajes realizados" },
                  purpose: { type: Type.STRING, description: "Código de finalidad del vuelo (ej. VP, ENT, EXA, INST, ACR, etc.)" },
                  logbook_name: { type: Type.STRING, description: "Nombre del libro de vuelo donde registrarlo. Omitir si el piloto no lo menciona: se usa el libro por defecto." },
                  pic_day_loc: { type: Type.NUMBER, description: "Horas PIC Diurno Local (opcional)" },
                  pic_day_tra: { type: Type.NUMBER, description: "Horas PIC Diurno Traslado (opcional)" },
                  pic_night_loc: { type: Type.NUMBER, description: "Horas PIC Nocturno Local (opcional)" },
                  pic_night_tra: { type: Type.NUMBER, description: "Horas PIC Nocturno Traslado (opcional)" },
                  sic_day_loc: { type: Type.NUMBER, description: "Horas SIC Diurno Local (opcional)" },
                  sic_day_tra: { type: Type.NUMBER, description: "Horas SIC Diurno Traslado (opcional)" },
                  sic_night_loc: { type: Type.NUMBER, description: "Horas SIC Nocturno Local (opcional)" },
                  sic_night_tra: { type: Type.NUMBER, description: "Horas SIC Nocturno Traslado (opcional)" },
                  imc_pil: { type: Type.NUMBER, description: "Horas de vuelo en IMC Real Piloto (opcional)" },
                  imc_cop: { type: Type.NUMBER, description: "Horas de vuelo en IMC Real Copiloto (opcional)" },
                  capota: { type: Type.NUMBER, description: "Horas de vuelo bajo Capota/Instrumental Simulado (opcional)" },
                  sim_instructor: { type: Type.NUMBER, description: "Horas en Simulador como Instructor (opcional)" },
                  sim_pil_en_inst: { type: Type.NUMBER, description: "Horas en Simulador como Piloto en Instrucción (opcional)" },
                  discount_type: { type: Type.STRING, description: "Tipo de descuento aplicado (opcional)" },
                  discount_amount: { type: Type.NUMBER, description: "Monto del descuento (opcional)" }
                },
                required: ["aircraft_registration", "date", "route", "duration", "takeoff", "landing", "landings", "purpose"]
              }
            },
            {
              name: "update_flight",
              description: "Actualiza los datos de un vuelo existente.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  flight_id: { type: Type.STRING, description: "El UUID del vuelo a actualizar" },
                  aircraft_registration: { type: Type.STRING, description: "Nueva matrícula de aeronave (opcional)" },
                  date: { type: Type.STRING, description: "Nueva fecha en formato YYYY-MM-DD (opcional)" },
                  route: { type: Type.STRING, description: "Nueva ruta (opcional)" },
                  duration: { type: Type.NUMBER, description: "Nueva duración en horas (opcional)" },
                  takeoff: { type: Type.STRING, description: "Nueva hora de despegue (HH:MM) (opcional)" },
                  landing: { type: Type.STRING, description: "Nueva hora de aterrizaje (HH:MM) (opcional)" },
                  landings: { type: Type.INTEGER, description: "Nueva cantidad de aterrizajes (opcional)" },
                  purpose: { type: Type.STRING, description: "Nueva finalidad (opcional)" },
                  pic_day_loc: { type: Type.NUMBER, description: "Nuevas horas PIC Diurno Local (opcional)" },
                  pic_day_tra: { type: Type.NUMBER, description: "Nuevas horas PIC Diurno Traslado (opcional)" },
                  pic_night_loc: { type: Type.NUMBER, description: "Nuevas horas PIC Nocturno Local (opcional)" },
                  pic_night_tra: { type: Type.NUMBER, description: "Nuevas horas PIC Nocturno Traslado (opcional)" },
                  sic_day_loc: { type: Type.NUMBER, description: "Nuevas horas SIC Diurno Local (opcional)" },
                  sic_day_tra: { type: Type.NUMBER, description: "Nuevas horas SIC Diurno Traslado (opcional)" },
                  sic_night_loc: { type: Type.NUMBER, description: "Nuevas horas SIC Nocturno Local (opcional)" },
                  sic_night_tra: { type: Type.NUMBER, description: "Nuevas horas SIC Nocturno Traslado (opcional)" },
                  imc_pil: { type: Type.NUMBER, description: "Nuevas horas IMC Real Piloto (opcional)" },
                  imc_cop: { type: Type.NUMBER, description: "Nuevas horas IMC Real Copiloto (opcional)" },
                  capota: { type: Type.NUMBER, description: "Nuevas horas bajo Capota (opcional)" },
                  sim_instructor: { type: Type.NUMBER, description: "Nuevas horas Simulador como Instructor (opcional)" },
                  sim_pil_en_inst: { type: Type.NUMBER, description: "Nuevas horas Simulador como Piloto en Instrucción (opcional)" },
                  discount_type: { type: Type.STRING, description: "Nuevo tipo de descuento (opcional)" },
                  discount_amount: { type: Type.NUMBER, description: "Nuevo monto de descuento (opcional)" }
                },
                required: ["flight_id"]
              }
            },
            {
              name: "start_flight_session",
              description: "Inicia el cronómetro de un vuelo en curso (check-in) en una aeronave. Úsala cuando el piloto avise que está por despegar o iniciar un vuelo (ej. 'arranco vuelo en LV-S153', 'despego ahora'). Si el piloto no menciona una hora explícita, NO incluyas el parámetro 'time' y se usará la hora actual del mensaje.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  aircraft_registration: { type: Type.STRING, description: "Matrícula de la aeronave (ej. LV-S153)" },
                  time: { type: Type.STRING, description: "Hora de despegue en formato 24hs HH:MM, SOLO si el piloto la menciona explícitamente (opcional)" }
                },
                required: ["aircraft_registration"]
              }
            },
            {
              name: "end_flight_session",
              description: "Finaliza el vuelo en curso (check-out) y calcula la duración automáticamente. Úsala cuando el piloto avise que aterrizó o terminó el vuelo (ej. 'aterricé', 'terminé el vuelo'). Si el piloto no menciona una hora explícita, NO incluyas el parámetro 'time' y se usará la hora actual del mensaje.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING, description: "Hora de aterrizaje en formato 24hs HH:MM, SOLO si el piloto la menciona explícitamente (opcional)" }
                },
                required: []
              }
            },
            {
              name: "get_airport_weather",
              description: "Obtiene la información meteorológica en tiempo real (METAR y TAF) para un aeropuerto/aeródromo específico mediante su código OACI (ICAO).",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  icao_code: { type: Type.STRING, description: "El código OACI de 4 letras del aeropuerto (ej. SADF, SADR, SAEZ)" }
                },
                required: ["icao_code"]
              }
            },
            DECLARACION_RAAC,
            {
              name: "get_airport_info",
              description: "Obtiene la ficha técnica completa de un aeródromo desde el registro oficial MADHEL de la ANAC Argentina: pistas y sus características, frecuencias de radio, ubicación respecto a la ciudad, combustible disponible, teléfonos de contacto, normas particulares y NOTAMs activos. Úsala cuando el usuario pregunte por datos técnicos de un aeródromo, NOTAMs, pistas, frecuencias, información del aeropuerto o si está CERRADO.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  icao_code: { type: Type.STRING, description: "El código del aeródromo. Acepta TANTO códigos OACI de 4 letras (SADF, SAAK, SAEZ) COMO indicadores locales ANAC de 3 letras (MGI, FDO, GEZ, AER, EZE). NUNCA modifiques ni le agregues letras al código que te pasa el usuario: si dice MGI usa MGI, si dice SAAK usa SAAK." }
                },
                required: ["icao_code"]
              }
            },
            {
              name: "send_hours_pdf",
              description: "Le manda al piloto, por este chat, un PDF con el resumen de sus horas de un período: tiempos de vuelo como en el libro, aterrizajes, instrumentos, capota, simulador, por avión y por finalidad.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  desde: { type: Type.STRING, description: "Primer día del período, YYYY-MM-DD. Omitir para toda la bitácora." },
                  hasta: { type: Type.STRING, description: "Último día del período, YYYY-MM-DD. Omitir para toda la bitácora o hasta hoy." }
                }
              }
            },
            {
              name: "send_logbook_pdf",
              description: "Le manda al piloto, por este chat, su libro de vuelo en PDF con la hoja del libro de ANAC. Úsala cuando pida su libro, su bitácora en PDF o las hojas del libro.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  logbook_name: { type: Type.STRING, description: "Nombre del libro, sólo si el piloto lleva más de uno y nombra cuál. Omitir para el principal." }
                }
              }
            }
          ]
        }
      ]
    };

    // Las entradas que sólo llevan una propuesta pendiente no tienen texto y no
    // van al modelo: son estado nuestro, no parte de la conversación.
    const formattedHistory = (history || [])
      .filter((m) => typeof m.content === "string" && m.content.length > 0)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content as string }],
      }));

    // Gemini requires history to start with user
    const firstUserIndex = formattedHistory.findIndex((h: any) => h.role === "user");
    const cleanHistory = firstUserIndex !== -1 ? formattedHistory.slice(firstUserIndex) : [];

    const chat = chatConRespaldo(genAI, parametrosModelo, cleanHistory);

    const chatParts: any[] = [];
    if (audioBuffer) {
      chatParts.push({
        inlineData: {
          data: audioBuffer.toString("base64"),
          mimeType: audioMimeType
        }
      });
      chatParts.push({
        text: "Transcribe y procesa esta nota de voz. Si el piloto solicita registrar un vuelo, recuerda que primero debes presentar un resumen de confirmación antes de llamar a la herramienta 'log_flight'. Si no, responde su pregunta normalmente."
      });
    } else {
      chatParts.push({ text: messageText });
    }

    let result = await chat.sendMessage(chatParts);
    let functionCalls = result.functionCalls;

    // La propuesta de vuelo que quedó lista en este turno, si el modelo pidió
    // registrar uno. Vive fuera del bucle porque se resuelve al terminarlo.
    let pendingProposal: { proposal: Record<string, any>; aircraftLabel: string; logbookLabel?: string } | null = null;

    while (functionCalls && functionCalls.length > 0) {
      const toolResults: any[] = [];

      for (const call of functionCalls) {
        const args: any = call.args;

        try {
          if (call.name === "log_flight") {
            // El copiloto nunca escribe acá. Deja la propuesta pendiente y el
            // piloto la confirma en el mensaje siguiente; esa confirmación se
            // resuelve antes de llamar al modelo, así que este camino es el
            // único que existe y no puede saltearse.
            //
            // Antes la confirmación era una instrucción en el prompt ("NO
            // llames a log_flight inmediatamente"). Eso es pedirle a un modelo
            // que se porte bien antes de escribir un registro regulatorio.
            const ac = aircraft.find(
              (a: any) => a.registration.trim().toUpperCase() === String(args.aircraft_registration ?? "").trim().toUpperCase()
            );
            if (!ac) {
              toolResults.push({
                name: call.name,
                response: { error: `La aeronave con matrícula '${args.aircraft_registration}' no está registrada en tu hangar.` }
              });
              continue;
            }

            const proposedDuration = calculateFlightDuration(args.takeoff, args.landing);
            const invalid = breakdownError(args, Number(proposedDuration));
            if (invalid) {
              toolResults.push({
                name: call.name,
                response: { error: `${invalid} Corregí el desglose y volvé a proponerlo.` }
              });
              continue;
            }

            // Si el piloto nombró un libro, se resuelve contra los suyos. Un
            // nombre que no existe se rechaza en vez de caer al libro por
            // defecto en silencio: escribir en el libro equivocado es peor que
            // no escribir.
            let logbookId: string | undefined;
            let logbookLabel = "";
            if (args.logbook_name) {
              const wanted = String(args.logbook_name).trim().toLowerCase();
              const book = logbooks.find((l: any) => String(l.name ?? "").trim().toLowerCase() === wanted);
              if (!book) {
                const names = logbooks.map((l: any) => l.name).filter(Boolean).join(", ");
                toolResults.push({
                  name: call.name,
                  response: { error: `No encontré un libro llamado '${args.logbook_name}'. Los tuyos son: ${names || "ninguno"}.` }
                });
                continue;
              }
              logbookId = book.id;
              logbookLabel = book.name;
            }

            const proposal = { ...args, aircraft_id: ac.id, duration: proposedDuration, logbook_id: logbookId };
            pendingProposal = { proposal, aircraftLabel: ac.registration, logbookLabel };
            toolResults.push({
              name: call.name,
              response: { result: "Propuesta preparada. Se le mostró el resumen al piloto para que confirme." }
            });

          } else if (call.name === "delete_flight") {
            toolResults.push({
              name: call.name,
              response: { error: "Por razones de seguridad, la eliminación de vuelos está deshabilitada desde WhatsApp. Por favor, hazlo desde la web oficial de Vector." }
            });

          } else if (call.name === "update_flight") {
            const flightResp = await fetch(`${API_URL}/flights/${args.flight_id}`, {
              headers: {
                "X-API-Key": userApiKey
              }
            });
            if (!flightResp.ok) {
              toolResults.push({
                name: call.name,
                response: { error: "Vuelo no encontrado" }
              });
              continue;
            }
            const existingFlight = await flightResp.json();

            const targetDate = args.date || existingFlight.date;
            let targetAircraftId = existingFlight.aircraft_id;

            if (args.aircraft_registration) {
              const ac = aircraft.find(
                (a: any) => a.registration.trim().toUpperCase() === args.aircraft_registration.trim().toUpperCase()
              );
              if (!ac) {
                toolResults.push({
                  name: call.name,
                  response: { error: `La aeronave con matrícula '${args.aircraft_registration}' no está registrada en tu hangar.` }
                });
                continue;
              }
              targetAircraftId = ac.id;
            }

            let takeoff_dt = existingFlight.takeoff;
            if (args.takeoff) {
              takeoff_dt = new Date(`${targetDate}T${args.takeoff}:00Z`).toISOString().split('.')[0] + 'Z';
            } else if (args.date && existingFlight.takeoff) {
              const originalTime = existingFlight.takeoff.split('T')[1].slice(0, 5);
              takeoff_dt = new Date(`${targetDate}T${originalTime}:00Z`).toISOString().split('.')[0] + 'Z';
            }

            let landing_dt = existingFlight.landing;
            if (args.landing) {
              landing_dt = new Date(`${targetDate}T${args.landing}:00Z`).toISOString().split('.')[0] + 'Z';
            } else if (args.date && existingFlight.landing) {
              const originalTime = existingFlight.landing.split('T')[1].slice(0, 5);
              landing_dt = new Date(`${targetDate}T${originalTime}:00Z`).toISOString().split('.')[0] + 'Z';
            }

            let takeoffTime = args.takeoff || existingFlight.takeoff?.split('T')[1]?.slice(0, 5);
            let landingTime = args.landing || existingFlight.landing?.split('T')[1]?.slice(0, 5);
            let duration = args.duration !== undefined ? args.duration : existingFlight.duration;
            if (args.takeoff || args.landing) {
              duration = calculateFlightDuration(takeoffTime, landingTime);
            }

            const payload = {
              aircraft_id: targetAircraftId,
              date: targetDate,
              route: args.route !== undefined ? args.route : existingFlight.route,
              landings: args.landings !== undefined ? args.landings : existingFlight.landings,
              duration: duration,
              takeoff: takeoff_dt,
              landing: landing_dt,
              purpose: args.purpose !== undefined ? args.purpose : existingFlight.purpose,
              pic_day_loc: args.pic_day_loc !== undefined ? args.pic_day_loc : existingFlight.pic_day_loc,
              pic_day_tra: args.pic_day_tra !== undefined ? args.pic_day_tra : existingFlight.pic_day_tra,
              pic_night_loc: args.pic_night_loc !== undefined ? args.pic_night_loc : existingFlight.pic_night_loc,
              pic_night_tra: args.pic_night_tra !== undefined ? args.pic_night_tra : existingFlight.pic_night_tra,
              sic_day_loc: args.sic_day_loc !== undefined ? args.sic_day_loc : existingFlight.sic_day_loc,
              sic_day_tra: args.sic_day_tra !== undefined ? args.sic_day_tra : existingFlight.sic_day_tra,
              sic_night_loc: args.sic_night_loc !== undefined ? args.sic_night_loc : existingFlight.sic_night_loc,
              sic_night_tra: args.sic_night_tra !== undefined ? args.sic_night_tra : existingFlight.sic_night_tra,
              "IMC Pil": args.imc_pil !== undefined ? args.imc_pil : existingFlight["IMC Pil"],
              "IMC Cop": args.imc_cop !== undefined ? args.imc_cop : existingFlight["IMC Cop"],
              "Capota": args.capota !== undefined ? args.capota : existingFlight["Capota"],
              "Sim Instructor": args.sim_instructor !== undefined ? args.sim_instructor : existingFlight["Sim Instructor"],
              "Sim Pil en Inst": args.sim_pil_en_inst !== undefined ? args.sim_pil_en_inst : existingFlight["Sim Pil en Inst"],
              discount_type: args.discount_type !== undefined ? args.discount_type : existingFlight.discount_type,
              discount_amount: args.discount_amount !== undefined ? args.discount_amount : existingFlight.discount_amount
            };

            const response = await fetch(`${API_URL}/flights/${args.flight_id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": userApiKey
              },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const errData = await response.json();
              toolResults.push({
                name: call.name,
                response: { error: errData.detail || "Error al actualizar el vuelo" }
              });
            } else {
              const resData = await response.json();
              toolResults.push({
                name: call.name,
                response: { result: `Vuelo actualizado exitosamente (duración calculada: ${duration}h)`, flight: resData }
              });
            }
          } else if (call.name === "start_flight_session" || call.name === "end_flight_session") {
            const isStart = call.name === "start_flight_session";

            if (isStart) {
              const ac = aircraft.find(
                (a: any) => a.registration.trim().toUpperCase() === args.aircraft_registration?.trim().toUpperCase()
              );
              if (!ac) {
                toolResults.push({
                  name: call.name,
                  response: { error: `La aeronave con matrícula '${args.aircraft_registration}' no está registrada en tu hangar.` }
                });
                continue;
              }
              args._resolvedRegistration = ac.registration;
            }

            const nowIso = new Date().toISOString();
            const timestamp = args.time
              ? `${nowIso.split('T')[0]}T${args.time}:00Z`
              : nowIso;

            const payload: Record<string, unknown> = {
              action: isStart ? "start" : "end",
              timestamp
            };
            if (isStart) {
              payload.aircraft = args._resolvedRegistration;
            }

            const response = await fetch(`${API_URL}/flight-helper/session/shortcut`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": userApiKey
              },
              body: JSON.stringify(payload)
            });

            const resData = await response.json().catch(() => ({}));
            if (!response.ok) {
              toolResults.push({
                name: call.name,
                response: { error: resData.detail || resData.message || "Error al procesar el vuelo en curso" }
              });
            } else {
              toolResults.push({
                name: call.name,
                response: { result: resData.message, link: resData.link }
              });
            }

          } else if (call.name === "get_airport_weather") {
            const icao = args.icao_code?.trim().toUpperCase();
            if (!icao) {
              toolResults.push({
                name: call.name,
                response: { error: "Código OACI no provisto." }
              });
              continue;
            }
            try {
              const metarRes = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=raw`, {
                headers: { "User-Agent": "Vector-Flight-Log-App" }
              });
              const metar = metarRes.ok ? await metarRes.text() : "No disponible";

              const tafRes = await fetch(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=raw`, {
                headers: { "User-Agent": "Vector-Flight-Log-App" }
              });
              const taf = tafRes.ok ? await tafRes.text() : "No disponible";

              toolResults.push({
                name: call.name,
                response: { metar: metar.trim(), taf: taf.trim() }
              });
            } catch (err: any) {
              toolResults.push({
                name: call.name,
                response: { error: `Error consultando clima: ${(err as any).message}` }
              });
            }
          } else if (call.name === "send_hours_pdf") {
            // El resumen de horas (`lib/resumen-horas.ts`), con los datos leídos con la clave del
            // piloto, como el libro. Las horas de alumno no cuentan después de la PPA (`vuelosDesdeLaPpa`).
            const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
            let desde = fecha(args.desde);
            let hasta = fecha(args.hasta);
            if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
            const leer = (ruta: string) => fetch(`${API_URL}${ruta}`, { headers: { "X-API-Key": userApiKey }, cache: "no-store" });
            const [pr, vr, ar, lr] = await Promise.all([leer("/profiles"), leer("/flights"), leer("/aircraft"), leer("/logbooks")]);
            if (![pr, vr, ar, lr].every((r) => r.ok)) {
              toolResults.push({ name: call.name, response: { error: "No se pudieron leer sus datos para armar el resumen. Que pruebe en un rato." } });
              continue;
            }
            const perfil = ((await pr.json()) as Profile[])[0] ?? null;
            const alumno = esAlumno(perfil?.license_type);
            const todos = (await vr.json()) as Flight[];
            const resumen = resumenDeHoras(alumno ? todos : vuelosDesdeLaPpa(todos, perfil?.fecha_ppa), await ar.json(), await lr.json(), { desde, hasta }, { alumno });
            const bytes = await pdfDelResumen(resumen, {
              piloto: apellidoYNombre(perfil?.first_name, perfil?.last_name),
              licencia: perfil?.license_type && perfil.license_type !== "-" ? perfil.license_type : "",
              generado: fechaDeGeneracion(new Date()),
            });
            const total = resumen.horas + (resumen.apertura ?? 0);
            const periodo = nombreDelPeriodo(resumen.desde, resumen.hasta);
            const enviado = await sendWhatsAppDocument(
              fromNumber,
              { bytes, nombre: `resumen-de-horas-${resumen.desde ?? "inicio"}-a-${resumen.hasta ?? "hoy"}.pdf` },
              `Resumen de horas · ${periodo}: ${total.toFixed(1).replace(".", ",")} h en ${resumen.vuelos} ${resumen.vuelos === 1 ? "vuelo" : "vuelos"}.`,
              payloadPhoneNumberId
            );
            toolResults.push({
              name: call.name,
              response: enviado
                ? { result: `Se le mandó el resumen (${periodo}): ${total.toFixed(1)} h en ${resumen.vuelos} vuelos.` }
                : { error: "No se pudo mandar el archivo por WhatsApp." },
            });
          } else if (call.name === "send_logbook_pdf") {
            // El mismo libro que se baja de la web (`lib/libro-anac-armar.ts`), leído con la
            // clave del piloto. Se manda como documento antes de que el modelo conteste, así
            // la confirmación llega después del archivo.
            const libro = await armarPdfDelLibro(
              (ruta) => fetch(`${API_URL}${ruta}`, { headers: { "X-API-Key": userApiKey }, cache: "no-store" }),
              { libroNombre: typeof args.logbook_name === "string" ? args.logbook_name : null }
            );
            if (!libro.ok) {
              toolResults.push({ name: call.name, response: { error: libro.error } });
              continue;
            }
            const caption = `Tu libro de vuelo${libro.libro ? ` (${libro.libro})` : ""}: ${libro.vuelos} ${libro.vuelos === 1 ? "vuelo" : "vuelos"}.`;
            const enviado = await sendWhatsAppDocument(fromNumber, { bytes: libro.bytes, nombre: libro.archivo }, caption, payloadPhoneNumberId);
            toolResults.push({
              name: call.name,
              response: enviado
                ? { result: `Se le mandó el PDF (${libro.archivo}, ${libro.vuelos} vuelos).` }
                : { error: "No se pudo mandar el archivo por WhatsApp. Que lo baje desde la web: Bitácora, botón de descarga." },
            });
          } else if (call.name === "consultar_raac") {
            // "Preguntale a la RAAC", igual que en la web (`lib/raac-copiloto.ts`).
            toolResults.push({ name: call.name, response: respuestaRaac(args.consulta) });
          } else if (call.name === "get_airport_info") {
            const icao = args.icao_code?.trim().toUpperCase();
            if (!icao) {
              toolResults.push({
                name: call.name,
                response: { error: "Código OACI no provisto." }
              });
              continue;
            }
            try {
              const info = await getAirportInfoHelper(icao);
              toolResults.push({
                name: call.name,
                response: {
                  madhel: info.madhel,
                  notams: info.notams
                }
              });
            } catch (err: any) {
              toolResults.push({
                name: call.name,
                response: { error: `Error consultando MADHEL: ${err.message}` }
              });
            }
          }
        } catch (err: any) {
          toolResults.push({
            name: call.name,
            response: { error: err.message || "Error al procesar la herramienta" }
          });
        }
      }

      const toolParts = toolResults.map(tr => ({
        functionResponse: {
          name: tr.name,
          response: tr.response
        }
      }));

      result = await chat.sendMessage(toolParts);
      functionCalls = result.functionCalls;
    }

    // Una propuesta pendiente corta el turno acá: el resumen lo arma el código,
    // no el modelo, porque tiene que describir exactamente lo que se va a
    // escribir cuando el piloto conteste que sí.
    if (pendingProposal) {
      const summary = proposalSummary(
        pendingProposal.proposal,
        pendingProposal.aircraftLabel,
        pendingProposal.logbookLabel
      );
      const historyWithProposal: ChatEntry[] = [
        ...history.filter((h) => !h.pending_flight),
        { role: "user", content: messageText.trim() || "[Nota de voz]", id: messageId, at: Date.now() },
        { role: "assistant", content: summary },
        { role: "system", pending_flight: pendingProposal.proposal, at: Date.now() },
      ];
      await fetch(`${API_URL}/whatsapp/chat-history`, {
        method: "POST",
        headers: vectorHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ history: historyWithProposal }),
      });
      await sendWhatsAppMessage(fromNumber, formatForWhatsApp(summary), payloadPhoneNumberId);
      return NextResponse.json({ success: true });
    }

    const replyText = (result.text ?? "");

    const userMessageContent = messageText.trim() || "[Nota de voz]";
    // El id va guardado con el mensaje: es lo que hace que `alreadyHandled`
    // reconozca un reintento después de un reinicio del proceso.
    const updatedHistory: ChatEntry[] = [
      ...history,
      { role: "user", content: userMessageContent, id: messageId, at: Date.now() },
      { role: "assistant", content: replyText }
    ];

    await fetch(`${API_URL}/whatsapp/chat-history`, {
      method: "POST",
      headers: vectorHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ history: updatedHistory })
    });

    await sendWhatsAppMessage(fromNumber, formatForWhatsApp(replyText), payloadPhoneNumberId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("WhatsApp webhook execution error:", err);
    if (fromNumber) {
      const isQuotaError = err.message?.includes("quota") || err.message?.includes("429");
      const userMessage = isQuotaError
        ? "Hola 🛩️ He recibido tu mensaje, pero el Copiloto IA ha alcanzado temporalmente su límite de cuota diaria. Por favor, intenta de nuevo en unos minutos."
        : "Hola 🛩️ Ocurrió un error al procesar tu solicitud con el Copiloto IA. Por favor, intenta de nuevo en un momento.";
      try {
        await sendWhatsAppMessage(fromNumber, userMessage, payloadPhoneNumberId);
      } catch (sendErr) {
        console.error("Failed to send fallback WhatsApp error message:", sendErr);
      }
    }
    // Return 200 to prevent retry loops
    return NextResponse.json({ success: false, error: err.message || "Internal error" });
  }
}
