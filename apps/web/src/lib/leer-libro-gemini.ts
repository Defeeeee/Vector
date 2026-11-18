/**
 * Leer hojas del libro de vuelo con Gemini: el esquema, el prompt y la llamada, compartidos por
 * `/api/parse-logbook` (un archivo chico) y por las importaciones en segundo plano
 * (`lib/importar-libro-servidor.ts`), que leen de a lotes.
 */
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { generarConRespaldo } from "@/lib/gemini";
import { conDesglose, faltaDesglose, parsearVuelos, type VueloLeido } from "@/lib/importar-libro";

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
        aircraft_model: { type: Type.STRING, description: "Marca y modelo de la aeronave, o su designador, tal como figura en el libro (ej. Cessna 152, Tecnam P2008, ECHO, PA30). No la clase (MONT-T, MULT-T): eso es otra columna. Vacío si no se lee" },
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
- **El desglose, siempre que esté escrito.** El libro de ANAC tiene ocho columnas de tiempo de vuelo: PILOTO diurno (local / travesía), PILOTO nocturno (local / travesía), COPILOTO diurno (local / travesía) y COPILOTO nocturno (local / travesía). Cada renglón tiene su tiempo en una o más de esas columnas y **la suma da la duración**. Copiá cada número en su campo (pic_day_loc, pic_day_tra, pic_night_loc, pic_night_tra, sic_…). "Local" es sobre el aeródromo; "travesía" (o traslado), de un lugar a otro. Mirá en qué columna está escrito el número, **leyendo el encabezado de cada columna en esa hoja** (no todos los libros las ponen en el mismo orden): no lo deduzcas de la ruta ni de la hora.
- La discriminación también en su columna, en horas decimales: IMC real (piloto o copiloto), **capota** (instrumentos simulados en el avión, va en el campo capota) y **simulador** (sólo las sesiones en un simulador, sin matrícula). Las horas de capota de un vuelo en avión nunca van en los campos de simulador.
No inventes vuelos ni completes datos que no se lean: si un campo no se lee, dejalo vacío o en 0. No cuentes como vuelos las filas de totales ("Totales a la página siguiente", "Totales página anterior").
Procesá todas las páginas.`;

const SEGUNDA_VUELTA = `
En una lectura anterior de estas mismas hojas quedaron muchos vuelos sin desglose. En el libro cada renglón tiene el número escrito en alguna de las ocho columnas de PILOTO / COPILOTO (diurno o nocturno, local o travesía): buscalo renglón por renglón y completá esos campos.`;

/** Lee las hojas y devuelve los vuelos. Si Gemini no contesta un JSON, un error claro. */
export async function leerHojasConGemini(partes: ParteArchivo[], descripcion: string, hayFotos: boolean): Promise<VueloLeido[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API Key no configurada");
  const result = await generarConRespaldo(genAI, PARAMETROS_LECTURA, [...partes, armarPrompt(descripcion, hayFotos)], ESPERA_LOTE_MS);
  const vuelos = parsearVuelos(result.text ?? "");
  if (!vuelos) throw new Error("No pudimos entender la lectura de las hojas. Probá de nuevo.");
  // Gemini a veces devuelve la duración y se saltea las columnas (Berni, 2026-11-18: 141 de 180 vuelos
  // sin desglose). Si pasa en la mitad o más del lote, se lee una vez más pidiéndolo, y queda la
  // lectura con más desglose. Una sola vuelta: es un pedido más por lote, sólo cuando hace falta.
  if (!faltaDesglose(vuelos)) return vuelos;
  try {
    const otra = await generarConRespaldo(genAI, PARAMETROS_LECTURA, [...partes, armarPrompt(descripcion, hayFotos) + SEGUNDA_VUELTA], ESPERA_LOTE_MS);
    const segunda = parsearVuelos(otra.text ?? "");
    if (segunda && conDesglose(segunda) > conDesglose(vuelos)) return segunda;
  } catch {
    // La primera lectura sirve igual: el desglose se puede completar en la revisión.
  }
  return vuelos;
}

const PROMPT_PLANILLA = `Esto es parte de una planilla (Excel, Google Sheets o CSV) donde un piloto argentino lleva su libro de vuelo.
Las columnas pueden tener **cualquier nombre, en cualquier orden y en cualquier idioma**: deducí qué es cada una por su encabezado y por los datos (por ejemplo "Matr.", "Avión" o "Registration" son la matrícula; "Desde/Hasta", "Origen/Destino" o "Ruta" son la ruta; "PIC", "Piloto al mando" o "P1" son horas de piloto; "Noche", "Nocturno" o "Night" son horas de noche; "XC", "Travesía" o "Cross country" son travesía; "Capota", "Hood" o "Simulated instrument" son capota; "IMC" o "Actual instrument" son instrumentos real; "Sim", "FSTD" o "Adiestrador" son simulador).
Extraé **un vuelo por cada fila de datos de "Filas a leer"**, con los campos del esquema. Reglas:
- Fecha (date) en YYYY-MM-DD. Si viene como 05/03/2025, es día/mes/año (formato argentino) salvo que la planilla deje claro otro orden.
- La duración (duration) en horas decimales: 1:30 son 1.5. Si no hay una columna de total, es la suma de las horas de piloto y copiloto de esa fila.
- Horas de salida y llegada (takeoff, landing) en HH:MM tal como figuran.
- El desglose: piloto o copiloto, de día o de noche, local (sobre el aeródromo, sale y llega al mismo) o travesía, cada número en su campo. Si la planilla sólo dice "PIC" y "Noche", el tiempo de noche va en pic_night_* y el resto en pic_day_*; local o travesía según la ruta.
- La capota va en capota y el simulador sólo en los campos de simulador (una fila de simulador no tiene matrícula: dejala vacía y poné el modelo del equipo en aircraft_model).
- Ignorá filas vacías, de totales, de subtotales o de "transporte". No inventes vuelos ni completes datos que no estén.`;

/** Lee un lote de filas de una planilla (ver `lib/planilla.ts`). */
export async function leerPlanillaConGemini(texto: string): Promise<VueloLeido[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API Key no configurada");
  const result = await generarConRespaldo(genAI, PARAMETROS_LECTURA, [`${PROMPT_PLANILLA}\n\n${texto}`], ESPERA_LOTE_MS);
  const vuelos = parsearVuelos(result.text ?? "");
  if (!vuelos) throw new Error("No pudimos entender la lectura de la planilla. Probá de nuevo.");
  return vuelos.map((v) => ({ ...v, fuente: "planilla" }));
}
