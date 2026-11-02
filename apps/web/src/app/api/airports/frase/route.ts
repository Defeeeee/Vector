import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type GenerateContentConfig } from "@google/genai";
import { generarConRespaldo } from "@/lib/gemini";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";
import { provinciasArgentinas, searchAirports } from "@/lib/airports";
import { filtrosDeModelo, paramsDeFiltros, type FiltrosDelModelo } from "@/lib/filtro-aerodromos";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const MAX_FRASE = 240;
/** Una frase corta: si Gemini tarda más que esto, mejor que el piloto use los filtros. */
const ESPERA_MS = 12_000;

const CONFIG: GenerateContentConfig = {
  temperature: 0,
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      lugar: { type: Type.STRING, nullable: true, description: "El aeródromo o la ciudad desde donde medir la distancia, tal como lo escribió (\"San Fernando\", \"SADF\", \"GEZ\"). null si no hay." },
      radio: {
        type: Type.OBJECT,
        nullable: true,
        description: "La distancia máxima desde el lugar, sin convertir.",
        properties: {
          valor: { type: Type.NUMBER },
          unidad: { type: Type.STRING, enum: ["nm", "km", "mi"], description: "nm = millas náuticas (\"millas\" a secas en aviación), km, mi = millas terrestres." },
        },
        required: ["valor", "unidad"],
      },
      largoMinimo: {
        type: Type.OBJECT,
        nullable: true,
        description: "El largo mínimo de pista, sin convertir.",
        properties: {
          valor: { type: Type.NUMBER },
          unidad: { type: Type.STRING, enum: ["m", "ft"] },
        },
        required: ["valor", "unidad"],
      },
      superficie: { type: Type.STRING, nullable: true, enum: ["dura", "blanda"], description: "dura = asfalto, hormigón, pavimento. blanda = pasto, tierra, ripio." },
      combustible: { type: Type.STRING, nullable: true, enum: ["100LL", "JETA1"], description: "100LL = AVGAS, nafta de aviación. JETA1 = JET A-1, kerosene." },
      controlado: { type: Type.BOOLEAN, nullable: true, description: "true si pide aeródromos controlados (con torre), false si pide no controlados." },
      uso: { type: Type.STRING, nullable: true, enum: ["publico", "privado"] },
      provincia: { type: Type.STRING, nullable: true, description: "La provincia argentina, si la nombra." },
      noEntendido: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lo que pidió y no entra en estos campos (\"con hangar\", \"con restaurante\"), en pocas palabras." },
    },
  },
  systemInstruction:
    "Convertís una búsqueda de aeródromos argentinos, escrita por un piloto en castellano, en filtros. " +
    "Completá sólo lo que la frase dice: no supongas valores que no están. No conviertas unidades: copiá el número y su unidad. " +
    "Lo que pida y no se pueda expresar con estos campos va en noEntendido.",
};

/**
 * POST /api/airports/frase  { frase }  →  { params, noEntendido }
 *
 * "A menos de 100 NM de San Fernando con 100LL y pista de asfalto de más de 800 m" a los
 * filtros de la pestaña Aeropuertos. **Gemini sólo lee la frase**; el aeródromo lo
 * resuelve el directorio, las unidades las convierte el código (`filtrosDeModelo`) y la
 * búsqueda la hace `/api/airports/filtrar`. Así el modelo no puede inventar un aeródromo,
 * una pista ni un combustible.
 *
 * Pide sesión, como `parse-logbook`: `/api/*` no pasa por el proxy y esto gasta la cuota
 * de Gemini del proyecto.
 */
export async function POST(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  const quien = await apiFetch("/profiles", { cache: "no-store" });
  if (quien.status === 401) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "La búsqueda con una frase no está disponible ahora. Usá los filtros." }, { status: 503 });
  }

  const cuerpo = await req.json().catch(() => null);
  const frase = typeof cuerpo?.frase === "string" ? cuerpo.frase.trim().slice(0, MAX_FRASE) : "";
  if (frase.length < 3) {
    return NextResponse.json({ error: "Escribí qué aeródromos buscás." }, { status: 400 });
  }

  let delModelo: FiltrosDelModelo;
  try {
    const r = await generarConRespaldo(genAI, CONFIG, frase, ESPERA_MS);
    delModelo = JSON.parse(r.text ?? "{}");
  } catch (err) {
    console.error("airports/frase:", err);
    return NextResponse.json({ error: "No pude leer la frase. Probá de nuevo o usá los filtros." }, { status: 502 });
  }

  const resolverLugar = (texto: string) =>
    searchAirports(texto, 8).find((a) => a.country === "AR" && a.size !== "H" && a.lat !== undefined)?.icao ?? null;
  const { filtros, noEntendido } = filtrosDeModelo(delModelo, resolverLugar, provinciasArgentinas());

  return NextResponse.json({ params: paramsDeFiltros(filtros).toString(), noEntendido });
}
