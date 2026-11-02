/**
 * La travesía de RAAC 61.520(a)(1)(iii), medida con las coordenadas de los aeródromos.
 *
 * Vive aparte de `ppa-progress.ts` porque necesita `getAirport`, que lee los TSV del
 * disco: sólo corre en el server. `ppa-progress.ts` recibe el resultado y sigue siendo
 * puro.
 */
import type { Flight } from "@/types";
import { getAirport } from "@/lib/airports";
import { legDistanceNm } from "@/lib/distance";
import { parsearRuta } from "@/lib/ruta-planificada";
import { cumpleTravesiaLarga } from "@/lib/ppa-progress";

export function esTravesiaLarga(f: Flight): boolean {
  const codigos = parsearRuta(f.route ?? "");
  if (codigos.length < 2) return false;
  const puntos = codigos.map((c) => getAirport(c));
  const tramos = puntos.slice(1).map((p, i) => legDistanceNm(puntos[i], p));
  return cumpleTravesiaLarga(codigos, tramos, f.landings ?? 0);
}
