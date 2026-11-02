/**
 * Las cifras de la carrera que encabezan el inicio: las horas totales y la fila de abajo.
 *
 * Federico pidió el 2026-10-10 que el inicio arranque por las horas, "de la misma manera
 * que el resumen", y que el tracker de la PCA deje de ser lo principal. Por eso las
 * cuentas son las del Resumen (`headlineStats` y `openingTotals`, de `lib/summary.ts`):
 * con la apertura de los libros sumada, el número del inicio y el del Resumen en "todo"
 * no pueden diferir.
 *
 * Lo que entra son los vuelos ya filtrados por quien llama: sin simuladores
 * (`soloVolados`, invariante 4) y desde la PPA si la rindió (`vuelosDesdeLaPpa`).
 *
 * "Últimos 30 días" no suma la apertura: no tiene fecha (invariante 5).
 */
import type { Flight, Logbook } from "@/types";
import { headlineStats, openingTotals } from "@/lib/summary";

export interface CifrasDeCarrera {
  total: number;
  ultimos30: number;
  pic: number;
  noche: number;
  imc: number;
  aterrizajes: number;
  vuelos: number;
}

export function cifrasDeCarrera(vuelos: Flight[], libros: Logbook[], todayIso: string, opciones: { alumno?: boolean } = {}): CifrasDeCarrera {
  const base = headlineStats(vuelos);
  // `alumno` se pasa siempre desde el inicio: el que ya rindió la PPA deja afuera sus horas
  // de alumno, como sus vuelos (`vuelosDesdeLaPpa`).
  const apertura = openingTotals(libros, opciones);
  const hace30 = new Date(Date.parse(`${todayIso}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  return {
    total: base.totalHours + apertura.totalHours,
    ultimos30: vuelos.filter((f) => (f.date || "").slice(0, 10) >= hace30).reduce((t, f) => t + (f.duration || 0), 0),
    pic: base.pic + apertura.pic,
    noche: base.night + apertura.night,
    imc: base.imc + apertura.imc,
    aterrizajes: base.landings + apertura.landings,
    vuelos: base.flights,
  };
}
