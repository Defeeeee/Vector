/**
 * Los esquemas de color de la imagen de "Tu año en vuelo" (3.39.0). Los usa la ruta que la
 * dibuja con satori (`/api/tu-ano/imagen`) y la historia final, que muestra los mismos colores
 * en los chips. Hex y degradés literales: satori no entiende variables CSS.
 */

export const ESQUEMAS = {
  noche: {
    nombre: "Noche",
    fondo: "#0b0d10",
    degrade: "radial-gradient(circle at 85% 8%, rgba(56,189,248,0.28), rgba(11,13,16,0) 55%), linear-gradient(180deg, #0b0d10 0%, #0c1a26 100%)",
    texto: "#ffffff",
    tenue: "rgba(255,255,255,0.58)",
    linea: "rgba(255,255,255,0.14)",
    acento: "#38bdf8",
    acento2: "#a5e4ff",
    marcaClara: false,
  },
  atardecer: {
    nombre: "Atardecer",
    fondo: "#1a0f2e",
    degrade: "radial-gradient(circle at 20% 92%, rgba(251,146,60,0.55), rgba(26,15,46,0) 60%), linear-gradient(180deg, #1a0f2e 0%, #3b1352 55%, #7a1f5c 100%)",
    texto: "#fff7ed",
    tenue: "rgba(255,237,213,0.66)",
    linea: "rgba(255,237,213,0.2)",
    acento: "#fb923c",
    acento2: "#f9a8d4",
    marcaClara: false,
  },
  cielo: {
    nombre: "Cielo",
    fondo: "#e0f2fe",
    degrade: "radial-gradient(circle at 80% 6%, rgba(255,255,255,0.95), rgba(224,242,254,0) 55%), linear-gradient(180deg, #bae6fd 0%, #e0f2fe 55%, #ffffff 100%)",
    texto: "#0b2a3d",
    tenue: "rgba(11,42,61,0.62)",
    linea: "rgba(11,42,61,0.2)",
    acento: "#0369a1",
    acento2: "#0ea5e9",
    marcaClara: true,
  },
  pista: {
    nombre: "Pista",
    fondo: "#0a0a0a",
    degrade: "linear-gradient(180deg, #0a0a0a 0%, #141414 100%)",
    texto: "#ffffff",
    tenue: "rgba(255,255,255,0.6)",
    linea: "rgba(250,204,21,0.35)",
    acento: "#facc15",
    acento2: "#fde68a",
    marcaClara: false,
  },
} as const;

export type EsquemaId = keyof typeof ESQUEMAS;
export type Esquema = (typeof ESQUEMAS)[EsquemaId];

export const ESQUEMA_POR_DEFECTO: EsquemaId = "noche";
export const ORDEN_ESQUEMAS: EsquemaId[] = ["noche", "atardecer", "cielo", "pista"];

/** De la lista blanca o el de siempre: lo único que la URL puede decidir del color. */
export function esquemaDe(valor: string | null | undefined): EsquemaId {
  return valor && Object.prototype.hasOwnProperty.call(ESQUEMAS, valor) ? (valor as EsquemaId) : ESQUEMA_POR_DEFECTO;
}
