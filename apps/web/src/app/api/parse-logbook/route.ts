import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { generarConRespaldo } from "@/lib/gemini";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";

/**
 * Un libro de muchas hojas tarda en leerse bastante más que una respuesta del copiloto:
 * el tope por modelo de `lib/gemini.ts` lo cortaría a mitad de camino.
 */
const ESPERA_PDF_MS = 120_000;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/** Un libro escaneado entero entra holgado; más que esto no es un libro de vuelo. */
const PDF_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Las fotos de las hojas (2.28.0): llegan ya achicadas desde el navegador (`comprimirImagen`,
 * a 2400 px), así que doce hojas entran en el mismo tope que el PDF.
 */
const MAX_FOTOS = 12;
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Importar el libro de papel: el PDF va a Gemini, que devuelve los vuelos.
 *
 * **Pide sesión antes de tocar nada.** Hasta el 2026-09-23 no la pedía: `/api/*` no
 * pasa por el proxy, así que cualquiera podía mandar PDFs y gastar la cuota de Gemini
 * del proyecto. La cookie sola no alcanza —el proxy no verifica firmas—, así que se le
 * pregunta al backend quién es.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionToken())) {
      return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    }
    const quien = await apiFetch("/profiles", { cache: "no-store" });
    if (quien.status === 401) {
      return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    }
    if (!quien.ok) {
      return NextResponse.json({ error: "No se pudo verificar tu sesión. Probá de nuevo." }, { status: 503 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API Key no configurada" }, { status: 500 });
    }

    // Antes de leer el cuerpo: un archivo enorme ni se baja a memoria.
    if (Number(req.headers.get("content-length") || 0) > PDF_MAX_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "El PDF pesa demasiado (máximo 15 MB)." }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const fotos = formData.getAll("fotos").filter((f): f is File => typeof f !== "string");

    // Un PDF, o fotos de las hojas: lo mismo para Gemini, una parte por archivo.
    let partes: { inlineData: { data: string; mimeType: string } }[];
    if (fotos.length > 0) {
      if (fotos.length > MAX_FOTOS) return NextResponse.json({ error: `Subí hasta ${MAX_FOTOS} fotos por vez.` }, { status: 400 });
      if (fotos.some((f) => !TIPOS_FOTO.has(f.type))) return NextResponse.json({ error: "Las fotos tienen que ser JPG, PNG o WebP." }, { status: 400 });
      if (fotos.reduce((t, f) => t + f.size, 0) > PDF_MAX_BYTES) return NextResponse.json({ error: "Las fotos pesan demasiado (máximo 15 MB en total)." }, { status: 413 });
      partes = await Promise.all(
        fotos.map(async (f) => ({ inlineData: { data: Buffer.from(await f.arrayBuffer()).toString("base64"), mimeType: f.type } }))
      );
    } else {
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No se subió ningún archivo." }, { status: 400 });
      }
      if (file.size > PDF_MAX_BYTES) {
        return NextResponse.json({ error: "El PDF pesa demasiado (máximo 15 MB)." }, { status: 413 });
      }
      partes = [{ inlineData: { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType: "application/pdf" } }];
    }

    // El modelo y su respaldo viven en lib/gemini.ts.
    const parametrosModelo: GenerateContentConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "Lista de vuelos extraídos del libro de vuelo PDF",
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Fecha del vuelo en formato YYYY-MM-DD (ej: 2026-06-30)" },
            aircraft_registration: { type: Type.STRING, description: "Matrícula de la aeronave (ej. LV-S153, N12345)" },
            route: { type: Type.STRING, description: "Ruta del vuelo (ej. SADF - SAAK o SADF/SAAK)" },
            duration: { type: Type.NUMBER, description: "Duración en horas decimales (ej. 1.2, 0.8, 1.5)" },
            takeoff: { type: Type.STRING, description: "Hora de salida como figura en el libro (UTC), formato HH:MM (ej. 14:30)" },
            landing: { type: Type.STRING, description: "Hora de llegada como figura en el libro (UTC), formato HH:MM (ej. 15:50)" },
            landings: { type: Type.INTEGER, description: "Cantidad de aterrizajes. Por defecto poner 1 si no se especifica" },
            purpose: { type: Type.STRING, description: "Código de finalidad (ej. VP, ENT, INST, EXA). Por defecto 'VP'" },
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
            sim_pil_en_inst: { type: Type.NUMBER, description: "Horas en Simulador como Piloto en Instrucción (opcional)" }
          },
          required: ["date", "aircraft_registration", "route", "duration", "takeoff", "landing", "landings", "purpose"]
        }
      }
    };

    const prompt = `Analiza detalladamente este libro de vuelo de piloto (${fotos.length ? `${fotos.length === 1 ? "una foto de una hoja" : `${fotos.length} fotos de hojas`} del libro de papel` : "un PDF"}).
Es, casi siempre, el libro de ANAC Argentina: cada renglón es un vuelo, con fecha (el año suele estar en el encabezado de la hoja), horas de salida y llegada en UTC, desde y hasta (un vuelo local lleva el mismo aeródromo en los dos), finalidad, aeronave (marca y modelo, matrícula), tiempos de vuelo sobre aeródromo o travesía, de día o de noche, como piloto o copiloto, aterrizajes y la discriminación (instrumentos, capota, simulador).
${fotos.length ? "Las fotos pueden estar torcidas, con sombras o con letra a mano: leé con cuidado cada renglón. Si una hoja aparece en dos fotos, no repitas sus vuelos." : ""}
Extrae todos los vuelos. Para cada uno:
- Fecha (date) en YYYY-MM-DD.
- Matrícula de la aeronave (aircraft_registration).
- Ruta (route): desde y hasta, por ejemplo 'SADF SAAK'; un vuelo local, 'SADF SADF'.
- Duración total en horas decimales (duration).
- Horas de salida (takeoff) y llegada (landing) en HH:MM, tal como figuran (UTC).
- Aterrizajes (landings). Si no se detalla, 1.
- Finalidad (purpose) con las siglas del libro: 'VP' vuelo privado, 'INST' instrucción recibida, 'I' instructor, 'ENT' entrenamiento, 'EXA' examen, 'ADAP' adaptación, 'ACR' acrobacia. Si no está claro, 'VP'.
- Los tiempos del desglose (piloto o copiloto, día o noche, aeródromo o travesía, IMC, capota, simulador) en su columna, en horas decimales.
No inventes vuelos ni completes datos que no se lean: si un campo no se lee, dejalo vacío o en 0. No cuentes como vuelos las filas de totales ("Totales a la página siguiente", "Totales página anterior").
Procesá todas las páginas.`;

    const result = await generarConRespaldo(genAI, parametrosModelo, [...partes, prompt], ESPERA_PDF_MS);

    const text = (result.text ?? "");
    const parsedFlights = JSON.parse(text);

    return NextResponse.json({ flights: parsedFlights });
  } catch (err: any) {
    console.error("parse-logbook API error:", err);
    return NextResponse.json({ error: err.message || "Error al procesar el libro de vuelo" }, { status: 500 });
  }
}
