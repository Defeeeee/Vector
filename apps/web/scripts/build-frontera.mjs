#!/usr/bin/env node
/**
 * Guarda el límite Argentina–Chile en `src/data/frontera-chile.tsv`.
 *
 *   npm run build:frontera
 *   npm run build:frontera -- /ruta/a/ne_10m_admin_0_boundary_lines_land.geojson
 *
 * ## Para qué
 *
 * Para las FIR del Mapa (3.1.0). ENR 2.1 define el límite entre las FIR Mendoza, Córdoba y
 * Ezeiza arrancando en "2830S y límite internacional" o en "el paralelo 3830S y límite
 * internacional": un punto del que el AIP da la latitud y no la longitud, porque es la
 * frontera. Sin ella, el límite entre FIR se correría hasta un grado en Neuquén y Mendoza, y
 * Vector diría que hablás con el centro equivocado.
 *
 * ## De dónde sale
 *
 * De Natural Earth (`ne_10m_admin_0_boundary_lines_land`, versión 5.1.2), que es de dominio
 * público. Se guardan sólo los tramos Argentina–Chile, a 4 decimales (~11 m): a la escala
 * 1:10 millones el error es de un par de kilómetros, y se usa sólo para esos puntos.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "frontera-chile.tsv");
const FUENTE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_boundary_lines_land.geojson";

async function main() {
  const local = process.argv[2];
  const datos = local ? JSON.parse(fs.readFileSync(local, "utf8")) : await (await fetch(FUENTE)).json();
  const tramos = [];
  for (const f of datos.features) {
    const p = f.properties;
    const par = new Set([p.ADM0_A3_L, p.ADM0_A3_R]);
    if (!(par.has("ARG") && par.has("CHL") && par.size === 2)) continue;
    const lineas = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const l of lineas) tramos.push(l.map(([lon, lat]) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join(" "));
  }
  if (tramos.length === 0) throw new Error("No hay tramos Argentina–Chile: cambió el archivo.");
  const cabecera = [
    "# Límite Argentina–Chile, de Natural Earth 5.1.2 (ne_10m_admin_0_boundary_lines_land), dominio público.",
    "# Un tramo por renglón: lat,lon separados por espacio. Generado por scripts/build-frontera.mjs.",
  ].join("\n");
  fs.writeFileSync(SALIDA, `${cabecera}\n${tramos.join("\n")}\n`);
  console.log(`${tramos.length} tramos, ${tramos.reduce((t, x) => t + x.split(" ").length, 0)} puntos → src/data/frontera-chile.tsv`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
