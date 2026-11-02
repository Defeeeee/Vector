/**
 * Qué números van en la tarjeta que se comparte.
 *
 * Es el único número de Vector que el piloto **no puede corregir después de
 * mandarlo**: una vez que la imagen entró a un grupo de WhatsApp, ya está. Por eso
 * todo el cálculo pasa por `summary.ts` en vez de volver a sumar acá.
 *
 * En la app ya conviven tres implementaciones de "horas totales" —`summary.ts`, la
 * suma en línea de `dashboard/page.tsx`, y el memo de `SummaryClient`—. Una cuarta
 * que discrepe sería justo la que termina en una captura de pantalla.
 */

import type { Aircraft, Flight, Logbook } from "@/types";
import { allAirports, byAircraft, headlineStats, openingTotals } from "./summary";

export type TileId =
  | "pic"
  | "vuelos"
  | "aterrizajes"
  | "aerodromos"
  | "noche"
  | "imc"
  | "capota"
  | "aeronaves"
  | "aeronave_top";

export interface TileDef {
  id: TileId;
  label: string;
  /**
   * Si la ficha suma los saldos de apertura.
   *
   * **La regla vive en el dato y no en una condición que alguien tenga que
   * acordarse de escribir en cada lugar.** Un saldo de apertura no tiene fecha
   * (`summary.ts:65-72`), así que una ficha de carrera lo suma y una de ventana no
   * podría. Hoy todas las fichas son de carrera; el día que entre una de período,
   * este campo es lo que evita que invente horas.
   */
  incluyeApertura: boolean;
  /** Si expone algo que identifica al piloto o su aeronave. */
  identificante?: boolean;
}

export const TILES: TileDef[] = [
  { id: "pic", label: "Horas PIC", incluyeApertura: true },
  { id: "vuelos", label: "Vuelos", incluyeApertura: false },
  { id: "aterrizajes", label: "Aterrizajes", incluyeApertura: true },
  { id: "aerodromos", label: "Aeródromos", incluyeApertura: false, identificante: true },
  { id: "noche", label: "Horas noche", incluyeApertura: true },
  { id: "imc", label: "Horas IMC", incluyeApertura: true },
  { id: "capota", label: "Capota", incluyeApertura: true },
  { id: "aeronaves", label: "Aeronaves", incluyeApertura: false },
  { id: "aeronave_top", label: "Más volada", incluyeApertura: false, identificante: true },
];

/** Cuántas fichas entran en la fila de la tarjeta sin que se vuelva ilegible. */
export const MAX_TILES = 4;

export const TILES_POR_DEFECTO: TileId[] = ["pic", "vuelos", "aterrizajes", "aerodromos"];

const VALIDOS = new Set<string>(TILES.map((t) => t.id));

/**
 * Lee la selección del query string.
 *
 * Nunca falla: un id desconocido se descarta y una selección vacía cae en la de por
 * defecto. **El query string no es una frontera de seguridad** —los números se
 * calculan en el servidor a partir de la sesión, no de la URL—, así que es apenas
 * una preferencia de presentación, y devolver una pantalla de error por un
 * parámetro que el usuario puede editar en la barra de direcciones es un ticket de
 * soporte que nadie necesita.
 */
export function parseTiles(raw: string | null | undefined): TileId[] {
  if (!raw) return TILES_POR_DEFECTO;
  const vistos = new Set<TileId>();
  for (const parte of raw.split(",")) {
    const id = parte.trim();
    if (VALIDOS.has(id)) vistos.add(id as TileId);
    if (vistos.size >= MAX_TILES) break;
  }
  return vistos.size > 0 ? [...vistos] : TILES_POR_DEFECTO;
}

export function serializeTiles(ids: TileId[]): string {
  return ids.join(",");
}

function unaDecimal(n: number): string {
  return n.toFixed(1);
}

export interface TarjetaValor {
  id: TileId;
  label: string;
  value: string;
}

export interface DatosTarjeta {
  /** Horas totales de carrera, el número protagonista. */
  horas: string;
  tiles: TarjetaValor[];
}

/**
 * Las horas que van grandes.
 *
 * **Incluye los saldos de apertura, siempre.** La tarjeta es la carrera entera y
 * nunca un período, así que la regla de `openingTotals` —sumarlos sólo en "todo"—
 * se cumple por construcción. Un piloto que migró 500 horas de papel y comparte
 * "1.0 hs" es el peor resultado posible de esta función.
 *
 * `openingTotals.totalHours` es `pic + sic` y deja afuera IMC y capota a propósito:
 * esas se **superponen** con el tiempo de vuelo en vez de particionarlo, y sumarlas
 * duplicaría horas.
 */
export function heroHoras(flights: Flight[], logbooks: Logbook[]): number {
  return headlineStats(flights).totalHours + openingTotals(logbooks).totalHours;
}

/**
 * Resuelve la tarjeta entera.
 *
 * El orden de salida sigue al de `ids` y no al de `TILES`: el orden en que el piloto
 * toca las fichas es el orden en que salen en la imagen.
 */
export function datosTarjeta(input: {
  ids: TileId[];
  flights: Flight[];
  logbooks: Logbook[];
  aircraft: Aircraft[];
}): DatosTarjeta {
  const { ids, flights, logbooks, aircraft } = input;
  const h = headlineStats(flights);
  const ap = openingTotals(logbooks);

  const valor = (id: TileId): string => {
    switch (id) {
      case "pic":
        return unaDecimal(h.pic + ap.pic);
      case "vuelos":
        return String(h.flights);
      case "aterrizajes":
        return String(Math.round(h.landings + ap.landings));
      case "aerodromos":
        return String(allAirports(flights).length);
      case "noche":
        return unaDecimal(h.night + ap.night);
      case "imc":
        return unaDecimal(h.imc + ap.imc);
      case "capota":
        return unaDecimal(h.hood + ap.hood);
      case "aeronaves":
        return String(new Set(flights.map((f) => f.aircraft_id).filter(Boolean)).size);
      case "aeronave_top": {
        const top = byAircraft(flights, aircraft, 1)[0];
        return top?.registration || "—";
      }
    }
  };

  return {
    horas: unaDecimal(heroHoras(flights, logbooks)),
    tiles: ids.map((id) => ({
      id,
      label: TILES.find((t) => t.id === id)!.label,
      value: valor(id),
    })),
  };
}
