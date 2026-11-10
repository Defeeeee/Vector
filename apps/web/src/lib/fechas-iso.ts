/**
 * Aritmética de fechas "YYYY-MM-DD" en UTC, sin construir un `Date` local (invariante 1: con un
 * `Date` local, el 1 de agosto a las 00:00 en Buenos Aires es el 31 de julio en UTC). Vivía en
 * `planned-flights.ts`, que se sacó con los vuelos programados en la 3.15.0.
 */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
