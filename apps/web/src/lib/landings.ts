import { Flight } from "@/types";

/**
 * Cómo se cuentan los aterrizajes cuando el número tiene consecuencias.
 *
 * Vive aparte porque lo consumen dos cosas que no se pueden contradecir: el
 * progreso hacia el PCA y —desde el plan 08— la experiencia reciente. Que dos
 * pantallas den distinto el mismo conteo es peor que cualquiera de las dos.
 */

/** Horas nocturnas al mando. Es el único indicio de nocturnidad que hay por vuelo. */
const nightHours = (f: Flight) => (f.pic_night_loc || 0) + (f.pic_night_tra || 0);
const dayHours = (f: Flight) => (f.pic_day_loc || 0) + (f.pic_day_tra || 0);

/**
 * Aterrizajes nocturnos de un vuelo.
 *
 * **Vector no registra si un aterrizaje fue de día o de noche** — `landings` es un
 * solo número (`types/index.ts`) — así que esto es una inferencia, no un dato.
 *
 * La versión anterior sumaba **todos** los aterrizajes de un vuelo que tuviera
 * cualquier hora nocturna. Una sesión de circuitos que cruza el ocaso —seis
 * aterrizajes, uno solo después de la puesta— sumaba seis.
 *
 * La regla acá:
 *
 * - Vuelo **enteramente** nocturno (sin horas diurnas): cuentan todos. No hay otra
 *   cosa que pudieran haber sido.
 * - Vuelo **mixto**: cuenta **uno**. Es el único que se puede afirmar, porque el
 *   vuelo terminó de noche.
 *
 * Subcuenta en vez de inflar, y esa dirección es deliberada: inflar un requisito de
 * aterrizajes nocturnos manda a un piloto a un examen creyendo que ya cumple.
 */
export function nightLandingsOf(flight: Flight): number {
  if (nightHours(flight) <= 0) return 0;
  const landings = flight.landings || 0;
  if (dayHours(flight) <= 0) return landings;
  return Math.min(1, landings);
}

/**
 * Total de aterrizajes nocturnos de una lista de vuelos.
 *
 * Los saldos iniciales de los libros **no entran acá y no deben entrar**: no están
 * separados día/noche, y un conteo arrastrado no se puede suponer nocturno.
 */
export function totalNightLandings(flights: Flight[]): number {
  return flights.reduce((acc, f) => acc + nightLandingsOf(f), 0);
}
