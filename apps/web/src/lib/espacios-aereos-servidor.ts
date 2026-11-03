import fs from "node:fs";
import path from "node:path";
import { getAirport } from "./airports";
import { allRadioayudas } from "./radioayudas";
import { armarEspacios, type EspacioAereo, type EspacioDescartado } from "./espacios-aereos";

/**
 * Los espacios aéreos armados desde el texto del AIP commiteado (`lib/espacios-aereos.ts`).
 * Sólo servidor. Se arman una vez por proceso: el texto cambia con un deploy, nunca en caliente.
 */
const CARPETA = path.join(process.cwd(), "src", "data", "aip");

let memo: { espacios: EspacioAereo[]; descartados: EspacioDescartado[] } | null = null;

export function espaciosAereos(): { espacios: EspacioAereo[]; descartados: EspacioDescartado[] } {
  if (memo) return memo;
  const ad217 = fs
    .readdirSync(CARPETA)
    .filter((f) => /^SA[A-Z]{2}\.txt$/.test(f))
    .sort()
    .map((f) => {
      const icao = f.slice(0, 4);
      const texto = fs.readFileSync(path.join(CARPETA, f), "utf8");
      const i = texto.indexOf("AD 2.17 ESPACIO");
      const j = texto.indexOf("AD 2.18", i);
      const ad = getAirport(icao);
      return {
        icao,
        bloque: i < 0 ? "" : texto.slice(i, j > i ? j : undefined),
        arp: ad?.lat !== undefined && ad?.lon !== undefined ? { lat: ad.lat, lon: ad.lon } : null,
      };
    })
    .filter((x) => x.bloque);
  const enr = path.join(CARPETA, "ENR-2.1.txt");
  const radioayudas = new Map(allRadioayudas().map((r) => [r.ident, { lat: r.lat, lon: r.lon }]));
  memo = armarEspacios({ ad217, enr21: fs.existsSync(enr) ? fs.readFileSync(enr, "utf8") : "", radioayudas });
  return memo;
}
