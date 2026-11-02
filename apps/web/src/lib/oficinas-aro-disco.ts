import fs from "node:fs";
import path from "node:path";
import { getAirport } from "./airports";
import { parsearHorarios, parsearOficinas, type OficinaUbicada } from "./oficinas-aro";

/**
 * Las oficinas de la AIC A 19/2026 con las coordenadas de su aeródromo, del directorio.
 * Server-only: lee el disco. La lista es chica (49) y se lee una sola vez.
 */
let cache: OficinaUbicada[] | null = null;

export function oficinasAro(): OficinaUbicada[] {
  if (cache) return cache;
  const datos = path.join(process.cwd(), "src", "data");
  const tsv = fs.readFileSync(path.join(datos, "oficinas-aro.tsv"), "utf8");
  const horarios = parsearHorarios(fs.readFileSync(path.join(datos, "aip-horarios-aro.tsv"), "utf8"));
  cache = parsearOficinas(tsv).map((o) => {
    const ad = getAirport(o.oaci);
    return { ...o, nombre: ad?.label ?? o.oaci, lat: ad?.lat, lon: ad?.lon, horario: horarios.get(o.oaci) };
  });
  return cache;
}
