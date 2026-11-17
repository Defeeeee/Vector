/**
 * Leer hojas del libro de vuelo con Gemini: el esquema, el prompt y la llamada, compartidos por
 * `/api/parse-logbook` (un archivo chico) y por las importaciones en segundo plano
 * (`lib/importar-libro-servidor.ts`), que leen de a lotes.
 */
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { generarConRespaldo } from "@/lib/gemini";
import { parsearVuelos, type VueloLeido } from "@/lib/importar-libro";

/** Un lote chico (3 páginas o 4 fotos) se lee en un minuto; esto deja margen para el respaldo. */
export const ESPERA_LOTE_MS = 120_000;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ParteArchivo {
  inlineData: { data: string; mimeType: string };
}

export const PARAMETROS_LECTURA: GenerateContentConfig = {
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.ARRAY,
    description: "Lista de vuelos extraídos del libro de vuelo PDF",
    items: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "Fecha del vuelo en formato YYYY-MM-DD (ej: 2026-06-30)" },
        aircraft_registration: { type: Type.STRING, description: "Matrícula de la aeronave (ej. LV-S153, N12345). Vacía si es un simulador" },
        aircraft_model: { type: Type.STRING, description: "Marca y modelo de la aeronave tal como figura en el libro (ej. Cessna 152, Tecnam P2008, Piper PA-11). Vacío si no se lee" },
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


const armarPrompt = (descripcion: string, hayFotos: boolean) => `Analiza detalladamente este libro de vuelo de piloto (${descripcion}).
Es, casi siempre, el libro de ANAC Argentina: cada renglón es un vuelo, con fecha (el año suele estar en el encabezado de la hoja), horas de salida y llegada en UTC, desde y hasta (un vuelo local lleva el mismo aeródromo en los dos), finalidad, aeronave (marca y modelo, matrícula), tiempos de vuelo sobre aeródromo o travesía, de día o de noche, como piloto o copiloto, aterrizajes y la discriminación (instrumentos, capota, simulador).
${hayFotos ? "Las fotos pueden estar torcidas, con sombras o con letra a mano: leé con cuidado cada renglón. Si una hoja aparece en dos fotos, no repitas sus vuelos." : ""}
Extrae todos los vuelos. Para cada uno:
- Fecha (date) en YYYY-MM-DD.
- Matrícula de la aeronave (aircraft_registration) y su marca y modelo tal como figuran en el libro (aircraft_model, por ejemplo 'Cessna 152'). Un simulador no tiene matrícula: dejala vacía.
- Ruta (route): desde y hasta, por ejemplo 'SADF SAAK'; un vuelo local, 'SADF SADF'.
- Duración total en horas decimales (duration).
- Horas de salida (takeoff) y llegada (landing) en HH:MM, tal como figuran (UTC).
- Aterrizajes (landings). Si no se detalla, 1.
- Finalidad (purpose) con las siglas del libro: 'VP' vuelo privado, 'INST' instrucción recibida, 'I' instructor, 'ENT' entrenamiento, 'EXA' examen, 'ADAP' adaptación, 'ACR' acrobacia. Si no está claro, 'VP'.
- Los tiempos del desglose (piloto o copiloto, día o noche, aeródromo o travesía, IMC, capota, simulador) en su columna, en horas decimales.
No inventes vuelos ni completes datos que no se lean: si un campo no se lee, dejalo vacío o en 0. No cuentes como vuelos las filas de totales ("Totales a la página siguiente", "Totales página anterior").
Procesá todas las páginas.`;

/** Lee las hojas y devuelve los vuelos. Si Gemini no contesta un JSON, un error claro. */
export async function leerHojasConGemini(partes: ParteArchivo[], descripcion: string, hayFotos: boolean): Promise<VueloLeido[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API Key no configurada");
  const result = await generarConRespaldo(genAI, PARAMETROS_LECTURA, [...partes, armarPrompt(descripcion, hayFotos)], ESPERA_LOTE_MS);
  const vuelos = parsearVuelos(result.text ?? "");
  if (!vuelos) throw new Error("No pudimos entender la lectura de las hojas. Probá de nuevo.");
  return vuelos;
}
