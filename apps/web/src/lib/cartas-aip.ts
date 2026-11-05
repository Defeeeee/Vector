/**
 * Las cartas de navegación del AIP como capas del Mapa (3.9.0): las ENR 6 en ruta inferiores
 * (INF 1–3) y superiores (SUP 1–3) y las cartas VFR por debajo de las TMA Baires y Córdoba
 * (ENR 6.10 y 6.9), **la carta tal cual**, georreferenciada, para prender y apagar.
 *
 * ## Cómo se georreferencian
 *
 * `scripts/cartas/` (ver su README): las cartas son PDF vectoriales en Lambert cónica conforme
 * sobre WGS84 (lo dicen en el margen). Los meridianos y paralelos son trazos propios del PDF,
 * con su rótulo de grados en el borde: cada cruce es un punto de control exacto (12 a 77 por
 * carta). Con eso se ajusta la constante del cono y una semejanza (escala, giro, desplazamiento);
 * el error medio queda debajo de 0,13 pt de la carta (~100 m en las ENR a 1:2.300.000, ~20 m en
 * las VFR a 1:500.000). Las seis ENR dan la misma constante (−0,620): son una sola proyección.
 *
 * Las teselas (256 px, Web Mercator, WebP) se generan en la compu y viven en el VPS, en
 * `~/Vector/datos/cartas/<capa>/<z>/<x>/<y>.webp`: no van al repo (pesan) ni al build.
 */

export interface CapaCarta {
  id: "inf" | "sup" | "vfr";
  nombre: string;
  /** Hasta dónde hay teselas propias; más cerca, Leaflet agranda las del último nivel. */
  zoomNativo: number;
  zoomMinimo: number;
  /** [[sur, oeste], [norte, este]]: fuera de esto no se piden teselas. */
  limites: [[number, number], [number, number]];
}

/** El ciclo AIRAC de las cartas: va en la URL para que un ciclo nuevo no salga del cache. */
export const AIRAC_CARTAS = "2026-06-11";

export const CAPAS_CARTAS: CapaCarta[] = [
  { id: "inf", nombre: "Carta en ruta inferior (ENR 6)", zoomMinimo: 5, zoomNativo: 9, limites: [[-57, -76], [-20, -50]] },
  { id: "sup", nombre: "Carta en ruta superior (ENR 6)", zoomMinimo: 5, zoomNativo: 9, limites: [[-57, -76], [-20, -50]] },
  { id: "vfr", nombre: "Cartas VFR Baires y Córdoba", zoomMinimo: 8, zoomNativo: 12, limites: [[-36.5, -66], [-30, -56.5]] },
];

export const urlTeselaCarta = (id: CapaCarta["id"]) => `/api/cartas/${id}/{z}/{x}/{y}?airac=${AIRAC_CARTAS}`;

/** Lo que acepta la ruta: la capa, y z/x/y enteros dentro del rango de la capa. */
export function teselaValida(capa: string, z: string, x: string, y: string): { capa: CapaCarta; z: number; x: number; y: number } | null {
  const c = CAPAS_CARTAS.find((k) => k.id === capa);
  if (!c || ![z, x, y].every((v) => /^\d{1,7}$/.test(v))) return null;
  const [Z, X, Y] = [Number(z), Number(x), Number(y)];
  if (Z < c.zoomMinimo || Z > c.zoomNativo || X >= 2 ** Z || Y >= 2 ** Z) return null;
  return { capa: c, z: Z, x: X, y: Y };
}
