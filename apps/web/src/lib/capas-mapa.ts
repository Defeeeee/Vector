/**
 * Qué se ve en el Mapa (3.9.0): el menú de capas, por grupo. Reemplazó al control de Leaflet,
 * que tenía cuatro casillas sueltas y en el teléfono quedaba debajo de la tarjeta.
 *
 * Lo elegido se recuerda en el navegador (`vector-mapa-capas`); lo que no se entiende de lo
 * guardado se descarta y vuelve lo de siempre.
 */

export type IdCapa =
  | "carta-inf"
  | "carta-sup"
  | "carta-vfr"
  | "tma"
  | "ctr"
  | "atz"
  | "firs"
  | "corredores"
  | "sectores-vfr"
  | "aerodromos"
  | "radioayudas";

export interface CapaDelMenu {
  id: IdCapa;
  nombre: string;
  detalle: string;
  /** La muestra de color, como se dibuja en el mapa. */
  muestra: { borde: string; relleno?: string; punteada?: boolean; punto?: boolean };
}

export interface GrupoDeCapas {
  titulo: string;
  nota?: string;
  capas: CapaDelMenu[];
}

export const GRUPOS_CAPAS: GrupoDeCapas[] = [
  {
    titulo: "Cartas del AIP",
    nota: "La carta tal cual, ciclo AIRAC 11/06/2026. La inferior y la superior se tapan: va una a la vez.",
    capas: [
      { id: "carta-inf", nombre: "En ruta inferior", detalle: "ENR 6 · INF 1, 2 y 3", muestra: { borde: "#1e3a8a", relleno: "#e0f2fe" } },
      { id: "carta-sup", nombre: "En ruta superior", detalle: "ENR 6 · SUP 1, 2 y 3", muestra: { borde: "#1e3a8a", relleno: "#fef3c7" } },
      { id: "carta-vfr", nombre: "VFR por debajo de las TMA", detalle: "ENR 6.10 Baires y 6.9 Córdoba", muestra: { borde: "#be185d", relleno: "#fce7f3" } },
    ],
  },
  {
    titulo: "Espacios aéreos",
    capas: [
      { id: "tma", nombre: "TMA", detalle: "Áreas de control terminal", muestra: { borde: "#2563eb", relleno: "#2563eb1a" } },
      { id: "ctr", nombre: "CTR", detalle: "Zonas de control", muestra: { borde: "#c026d3", relleno: "#c026d31a", punteada: true } },
      { id: "atz", nombre: "ATZ", detalle: "Zonas de tránsito de aeródromo", muestra: { borde: "#db2777", relleno: "#db27771f", punteada: true } },
      { id: "firs", nombre: "FIR y sectores", detalle: "Límites de cada centro", muestra: { borde: "#475569", punteada: true } },
    ],
  },
  {
    titulo: "VFR",
    capas: [
      { id: "corredores", nombre: "Corredores VFR", detalle: "Baires, con su ancho (ENR 3.3)", muestra: { borde: "#047857", relleno: "#10b98152" } },
      { id: "sectores-vfr", nombre: "Sectores VFR", detalle: "Clase G, con su techo", muestra: { borde: "#047857", relleno: "#10b9812e", punteada: true } },
    ],
  },
  {
    titulo: "Puntos",
    capas: [
      { id: "aerodromos", nombre: "Aeródromos", detalle: "Tocalos para sumarlos a la ruta", muestra: { borde: "#18181b", relleno: "#18181b", punto: true } },
      { id: "radioayudas", nombre: "Radioayudas", detalle: "VOR, NDB y DME", muestra: { borde: "#059669", relleno: "#d1fae5", punto: true } },
    ],
  },
];

const TODAS = GRUPOS_CAPAS.flatMap((g) => g.capas.map((c) => c.id));

/** De entrada, todo lo que dibuja Vector y ninguna carta. */
export const CAPAS_POR_DEFECTO: IdCapa[] = TODAS.filter((id) => !id.startsWith("carta-"));
export const OPACIDAD_CARTA_POR_DEFECTO = 1;
export const CLAVE_CAPAS = "vector-mapa-capas";

/** Prender o apagar una capa. La carta inferior y la superior cubren lo mismo: una apaga a la otra. */
export function alternarCapa(visibles: IdCapa[], id: IdCapa): IdCapa[] {
  if (visibles.includes(id)) return visibles.filter((v) => v !== id);
  const excluye: Partial<Record<IdCapa, IdCapa>> = { "carta-inf": "carta-sup", "carta-sup": "carta-inf" };
  return [...visibles.filter((v) => v !== excluye[id]), id];
}

/** Lo guardado en el navegador, validado. */
export function leerCapas(guardado: string | null): { visibles: IdCapa[]; opacidad: number } {
  const porDefecto = { visibles: CAPAS_POR_DEFECTO, opacidad: OPACIDAD_CARTA_POR_DEFECTO };
  if (!guardado) return porDefecto;
  try {
    const d = JSON.parse(guardado);
    if (!Array.isArray(d?.visibles)) return porDefecto;
    let visibles = d.visibles.filter((v: unknown): v is IdCapa => TODAS.includes(v as IdCapa));
    if (visibles.includes("carta-inf") && visibles.includes("carta-sup")) visibles = visibles.filter((v: IdCapa) => v !== "carta-sup");
    const opacidad = typeof d.opacidad === "number" && d.opacidad >= 0.2 && d.opacidad <= 1 ? d.opacidad : OPACIDAD_CARTA_POR_DEFECTO;
    return { visibles: [...new Set(visibles)] as IdCapa[], opacidad };
  } catch {
    return porDefecto;
  }
}
