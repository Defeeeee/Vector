import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { chatConRespaldo } from "@/lib/gemini";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";
import { Flight, Aircraft, Profile, PilotDocument } from "@/types";
import { breakdownError, buildFlightBody, isAffirmation, proposalSummary } from "@/lib/copilot-guards";
import { canonicalRoute } from "@/lib/madhel-reference";
import { calculateFlightDuration, documentStatus } from "@/lib/utils";
import { anacIndicator } from "@/lib/madhel-reference";
import { componerFicha, datosAip } from "@/lib/aip";
import { DECLARACION_RAAC, REGLAS_RAAC, respuestaRaac } from "@/lib/raac-copiloto";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * Scrubs internal database IDs out of anything the pilot will read. The model
 * needs the UUIDs in its context to call update_flight/delete_flight, and it
 * used to echo them back ("... [ID: d8342011-...]"), which is an implementation
 * detail leaking into the product.
 */
function stripInternalIds(text: string): string {
  return text
    // "[ID: uuid]", "(ID: uuid)" and bare "ID: uuid" — with any surrounding space.
    .replace(new RegExp(`\\s*[\\[(]\\s*ID:\\s*${UUID}\\s*[\\])]`, "gi"), "")
    .replace(new RegExp(`\\s*\\bID:\\s*${UUID}\\b`, "gi"), "")
    // Anything that still slipped through as a naked UUID.
    .replace(new RegExp(UUID, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildFlightContext(
  flights: Flight[],
  aircraft: Aircraft[],
  profile: Profile | null,
  packs: any[],
  transactions: any[],
  balance: number,
  session: any,
  documents: PilotDocument[] = []
): string {
  const aircraftMap = new Map(aircraft.map(a => [a.id, a]));
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const totalHours = flights.reduce((s, f) => s + f.duration, 0);
  const totalLandings = flights.reduce((s, f) => s + f.landings, 0);

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
    .map(f => {
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

  const txLines = transactions.slice(0, 5).map(t => {
    return `- [${t.type.toUpperCase()}] ${new Date(t.created_at).toLocaleDateString("es-AR")}: $${t.amount} | ${t.description || ""}`;
  }).join("\n");

  const packLines = packs.map(p => {
    const acRegs = p.aircraft_ids.map((aid: string) => aircraftMap.get(aid)?.registration || "Avión").join(", ");
    return `- Pack "${p.name}": ${p.remaining_hours.toFixed(1)} hs restantes de ${p.total_hours.toFixed(1)} hs totales (aviones: ${acRegs}) | ${p.is_active ? "Activo" : "Inactivo"}`;
  }).join("\n");

  const activeSessionStr = session?.active 
    ? `Sí, activo en ${aircraftMap.get(session.session.aircraft_id)?.registration || "Desconocido"} desde las ${new Date(session.session.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : "No hay vuelo en curso.";

  // Expiries come from the documents table now, not a column on the profile, so
  // the copilot can answer about the licence or the insurance too — not just
  // the medical.
  const documentLines = documents
    .map(doc => {
      const status = documentStatus(doc.expiry_date);
      return `- ${doc.name}: vence ${doc.expiry_date} (${status.label.toLowerCase()})`;
    })
    .join("\n");

  return `
## Perfil del piloto
Nombre: ${profile ? `${profile.first_name} ${profile.last_name}` : "Desconocido"}
Licencia: ${profile?.license_type || "No especificada"}
Modo de seguimiento: ${profile?.tracking_mode === "balance" ? "Saldo en Cuenta ($)" : "Packs de Horas"}

## Documentos y vencimientos
${documentLines || "(Sin documentos cargados)"}

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
Aeronaves usadas: ${aircraft.map(a => `${a.registration} (${a.icao}, ${a.type})`).join("; ")}
Horas por aeronave: ${acSummary}
Rutas más frecuentes: ${topRoutes}
Vuelo más largo: ${flights.length > 0 ? Math.max(...flights.map(f => f.duration)).toFixed(1) + "h" : "0h"}
Promedio por vuelo: ${flights.length > 0 ? (totalHours / flights.length).toFixed(1) + "h" : "0h"}

## Registro completo de vuelos (${flights.length} vuelos)
${flightLines}
`.trim();
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

export async function POST(req: NextRequest) {
  // Primero la sesión, antes que nada: sin ella no se gasta la cuota de Gemini del
  // proyecto, ni se contesta nada que dependa de la configuración del servidor.
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  try {
    const { message, history } = await req.json();

    /**
     * Propuesta de vuelo esperando confirmación.
     *
     * Este chat no persiste el historial: lo manda el cliente en cada turno. La
     * propuesta viaja con él y vuelve acá, que es el mismo mecanismo que el de
     * WhatsApp con otra caja. Si el cliente la pierde, el vuelo no se escribe —
     * falla del lado seguro.
     */
    const propuestaPendiente = (history || [])
      .slice()
      .reverse()
      .find((m: { pendingFlight?: Record<string, unknown> }) => m?.pendingFlight)?.pendingFlight as
      | Record<string, any>
      | undefined;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "API key de Gemini no configurada" }, { status: 500 });
    }

    // Fetch pilot data in a consolidated call to dashboard
    const dashboardRes = await apiFetch("/dashboard");
    // Sin sesión válida el backend contesta 401: se corta acá, antes de llamar a Gemini.
    if (dashboardRes.status === 401) {
      return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    }
    if (!dashboardRes.ok) {
      return NextResponse.json({ error: "No se pudieron obtener los datos de la bitácora" }, { status: 500 });
    }

    const data = await dashboardRes.json();
    const flights: Flight[] = data.flights || [];
    const aircraft: Aircraft[] = data.aircraft || [];
    const profile: Profile | null = data.profile || null;
    const packs = data.packs || [];
    const transactions = data.transactions || [];
    const balance = data.balance || 0;
    const session = data.session || { active: false };
    const documents: PilotDocument[] = data.documents || [];

    const todayStr = new Date().toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const [d, m, y] = todayStr.split("/");
    const currentLocalDate = `${y}-${m}-${d}`;

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

    const systemPrompt = `Eres un asistente de aviación inteligente integrado en Vector, una aplicación de bitácora de vuelo.
Tu rol es ayudar al piloto a analizar su historial de vuelos, estadísticas, responder preguntas, y también puedes EDITAR, REGISTRAR o ELIMINAR vuelos del libro de vuelo usando tus herramientas integradas.

Responde siempre en español, de forma concisa y clara. Usa emojis cuando sean útiles.

La fecha actual de hoy es: ${currentLocalDate} (formato YYYY-MM-DD). Usa esta fecha actual de referencia cuando el usuario mencione "hoy", "ayer" o fechas relativas.

## REGLAS CRÍTICAS PARA REGISTRO Y EDICIÓN:
1. NUNCA inventes información. Si falta algún dato obligatorio para registrar un vuelo, pídeselo de forma clara al usuario.
2. Campos obligatorios para registrar un vuelo ('log_flight'):
   - aircraft_registration: Matrícula de la aeronave (debe coincidir con alguna en el hangar, ej: LV-S153).
   - date: Fecha (YYYY-MM-DD).
   - route: Ruta (ej: SADF - SADR).
   - duration: Horas de duración (ej: 1.5). Calcula o valida la duración SIEMPRE usando la conversión de minutos a decimales aeronáuticos que se detalla abajo.
   - takeoff: Hora despegue (HH:MM).
   - landing: Hora aterrizaje (HH:MM).
   - landings: Aterrizajes (número entero, por defecto pídelo o pon 1 si está implícito).
   - purpose: Finalidad del vuelo (debe ser un código corto como VP para Vuelo Privado, ENT para Entrenamiento, EXA para Examen, INST para Instrucción, etc. Si el piloto no lo indica, PREGÚNTALE siempre primero).
3. Si el usuario te pide editar ('update_flight') o eliminar ('delete_flight') un vuelo, busca el UUID de ese vuelo en tu contexto de vuelos registrados (representado como [ID: uuid]) y úsalo para llamar a la función. Si no estás seguro de cuál vuelo se refiere, muéstrale los candidatos con sus datos y pídele confirmación.
4. Si falta cualquier dato requerido, detente y pregunta amablemente. No inventes nada.

## NUNCA MUESTRES IDENTIFICADORES INTERNOS:
Los UUID que aparecen como [ID: ...] en tu contexto son EXCLUSIVAMENTE para pasárselos como argumento a las funciones. JAMÁS los escribas en el texto que ve el piloto: ni entre corchetes, ni como referencia, ni "por las dudas", ni aunque el usuario te los pida. Para identificar un vuelo ante el piloto usá siempre datos humanos: fecha, ruta, matrícula y duración (ej: "el vuelo del 12/03 SADM–SAEZ con LV-ABC, 1.4 h"). Lo mismo aplica a cualquier otro identificador interno de aeronaves, packs o transacciones.

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

## REGLAS PARA METAR, TAF, NOTAM Y DATOS DE AERÓDROMO:
1. Si el usuario te pregunta por el clima, reporte meteorológico, METAR o TAF de un aeropuerto, debes indicar que esa función está disponible en el Planificador de Ruta y que lamentablemente en este chat aún no puedes consultar el METAR en tiempo real.
2. Si el usuario te pregunta por NOTAMs, pistas, frecuencias, datos técnicos del aeródromo, combustible, teléfonos, normas operativas, o si un aeródromo está ABIERTO o CERRADO (ej: "NOTAMs de SAAK", "frecuencias de SADF", "pistas de Ezeiza"), debes usar la herramienta 'get_airport_info' que consulta el registro oficial MADHEL de la ANAC en tiempo real.
3. Al recibir los datos de 'get_airport_info', preséntale al piloto la ficha técnica en formato claro y organizado, incluyendo los NOTAMs activos si los hay.

${REGLAS_RAAC}

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
                  takeoff: { type: Type.STRING, description: "Hora de despegue en formato de 24 hs (HH:MM)" },
                  landing: { type: Type.STRING, description: "Hora de aterrizaje en formato de 24 hs (HH:MM)" },
                  landings: { type: Type.INTEGER, description: "Cantidad de aterrizajes realizados" },
                  purpose: { type: Type.STRING, description: "Código de finalidad del vuelo (ej. VP, ENT, EXA, INST, ACR, etc.)" },
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
                  discount_type: { type: Type.STRING, description: "Tipo de descuento aplicado, ej: pack, rate (opcional)" },
                  discount_amount: { type: Type.NUMBER, description: "Monto del descuento en horas o dinero (opcional)" }
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
              name: "delete_flight",
              description: "Elimina un vuelo existente por su UUID.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  flight_id: { type: Type.STRING, description: "UUID del vuelo a eliminar" }
                },
                required: ["flight_id"]
              }
            },
            DECLARACION_RAAC,
            {
              name: "get_airport_info",
              description: "Obtiene la ficha técnica completa de un aeródromo desde el registro oficial MADHEL de la ANAC Argentina: pistas y sus características, frecuencias de radio, ubicación respecto a la ciudad, combustible disponible, teléfonos de contacto, normas particulares y NOTAMs activos. Úsala cuando el usuario pregunte por datos técnicos, NOTAMs, pistas, frecuencias, información del aeropuerto o si está CERRADO.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  icao_code: { type: Type.STRING, description: "El código del aeródromo. Acepta TANTO códigos OACI de 4 letras (SADF, SAAK, SAEZ) COMO indicadores locales ANAC de 3 letras (MGI, FDO, GEZ, AER, EZE). Usa el código EXACTAMENTE como lo dice el usuario, sin agregar ni quitar letras." }
                },
                required: ["icao_code"]
              }
            }
          ]
        }
      ]
    };

    const formattedHistory = (history || []).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Gemini requires the history to start with a 'user' message.
    const firstUserIndex = formattedHistory.findIndex((h: any) => h.role === "user");
    const cleanHistory = firstUserIndex !== -1 ? formattedHistory.slice(firstUserIndex) : [];

    const chat = chatConRespaldo(genAI, parametrosModelo, cleanHistory);

    let result = await chat.sendMessage(message);
    let functionCalls = result.functionCalls;

    // La propuesta que quedó lista en este turno, si el modelo pidió registrar.
    // Fuera del bucle porque se resuelve al terminarlo.
    let propuestaNueva: Record<string, any> | null = null;
    let propuestaLabel = "";

    // Loop to handle potential multiple sequential function calls (multi-turn tool use)
    while (functionCalls && functionCalls.length > 0) {
      const toolResults: any[] = [];

      for (const call of functionCalls) {
        const args: any = call.args;

        try {
          if (call.name === "log_flight") {
            const ac = aircraft.find(
              a => a.registration.trim().toUpperCase() === String(args.aircraft_registration ?? "").trim().toUpperCase()
            );
            if (!ac) {
              toolResults.push({
                name: call.name,
                response: { error: `La aeronave con matrícula '${args.aircraft_registration}' no está registrada en tu hangar.` }
              });
              continue;
            }

            const computedDuration = calculateFlightDuration(args.takeoff, args.landing);

            // Las mismas defensas que el copiloto de WhatsApp. Estaban sólo de
            // aquel lado porque los dos caminos escribían su propio cuerpo, y por
            // eso este podía guardar un desglose que sumara más que el vuelo, o
            // una ruta sin canonicalizar que partía en dos un aeródromo.
            const invalid = breakdownError(args, Number(computedDuration));
            if (invalid) {
              toolResults.push({
                name: call.name,
                response: { error: `${invalid} Corregí el desglose y volvé a intentarlo.` }
              });
              continue;
            }

            // No escribe: propone. El vuelo se guarda recién cuando el piloto
            // confirma, resuelto antes de llamar al modelo. Era la última defensa
            // que tenía el copiloto de WhatsApp y este no.
            propuestaNueva = { ...args, aircraft_id: ac.id, duration: computedDuration };
            propuestaLabel = ac.registration;
            toolResults.push({
              name: call.name,
              response: { result: "Propuesta preparada. Se le muestra el resumen al piloto para que confirme." }
            });

          } else if (call.name === "delete_flight") {
            const response = await apiFetch(`/flights/${args.flight_id}`, {
              method: "DELETE"
            });

            if (!response.ok) {
              const errData = await response.json();
              toolResults.push({
                name: call.name,
                response: { error: errData.detail || "Error al eliminar el vuelo del servidor" }
              });
            } else {
              toolResults.push({
                name: call.name,
                response: { result: "Vuelo eliminado exitosamente" }
              });
            }

          } else if (call.name === "update_flight") {
            const flightResp = await apiFetch(`/flights/${args.flight_id}`);
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
                a => a.registration.trim().toUpperCase() === args.aircraft_registration.trim().toUpperCase()
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

            const response = await apiFetch(`/flights/${args.flight_id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const errData = await response.json();
              toolResults.push({
                name: call.name,
                response: { error: errData.detail || "Error al actualizar el vuelo en el servidor" }
              });
            } else {
              const resData = await response.json();
              toolResults.push({
                name: call.name,
                response: { result: `Vuelo actualizado exitosamente (duración calculada: ${duration}h)`, flight: resData }
              });
            }
          } else if (call.name === "consultar_raac") {
            // Sólo el texto de la norma que tiene Vector (`lib/raac-copiloto.ts`).
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

      // Convert tool results to Parts for the generative model
      const toolParts = toolResults.map(tr => ({
        functionResponse: {
          name: tr.name,
          response: tr.response
        }
      }));

      result = await chat.sendMessage(toolParts);
      functionCalls = result.functionCalls;
    }

    // Belt and braces on the "never show internal IDs" rule above: a system
    // prompt is guidance, not a guarantee, and a leaked UUID is user-visible.
    // Una propuesta pendiente corta el turno: el resumen lo arma el código y no el
    // modelo, porque tiene que describir exactamente lo que se va a escribir
    // cuando el piloto conteste que sí.
    if (propuestaNueva) {
      return NextResponse.json({
        reply: proposalSummary(propuestaNueva, propuestaLabel),
        pendingFlight: propuestaNueva,
      });
    }

    const text = stripInternalIds((result.text ?? ""));
    return NextResponse.json({ reply: text });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
