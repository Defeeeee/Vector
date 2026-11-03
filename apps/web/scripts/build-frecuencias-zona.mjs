#!/usr/bin/env node
/**
 * Los canales de llamada de los aeródromos **no controlados** de la zona, de la lista que pasó
 * Federico (`docs/fuentes/frecuencias-zona.pdf`, 2026-11-03), a `src/data/frecuencias-zona.tsv`.
 *
 *   npm run build:frecuencias-zona
 *   npm run build:frecuencias-zona -- /ruta/a/otra-lista.pdf
 *
 * ## Por qué, si no es el AIP
 *
 * Porque el AIP no la tiene: MADHEL publica el canal de llamada de sólo 31 aeródromos no
 * controlados, en sus normas particulares, y no el de Isla Martín García (122.50), por ejemplo,
 * que es el que se usa. **MADHEL gana** donde publica uno, y la pantalla dice de dónde sale cada
 * canal. Donde las dos fuentes dicen algo, coinciden (lo fija `frecuencias-zona.test.ts`).
 *
 * La lista tiene dos columnas: CONTROLADOS (torre, aproximación, VOR, ILS: eso sale del AIP) y
 * NO CONTROLADOS, con un renglón por aeródromo que termina en " -": "MGI / SAAK 122.50 -".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = process.argv[2] ?? path.join(RAIZ, "..", "..", "docs", "fuentes", "frecuencias-zona.pdf");
const SALIDA = path.join(RAIZ, "src", "data", "frecuencias-zona.tsv");

const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(FUENTE)));
const { text } = await extractText(pdf, { mergePages: true });
const filas = [];
for (const m of text.matchAll(/\b([A-Z]{3})(?: \/ ([A-Z]{4}))? (1\d{2}\.\d{2,3}) -/g)) {
  filas.push([m[1], m[2] ?? "", m[3]]);
}
if (filas.length < 40) throw new Error(`Sólo ${filas.length} aeródromos: el formato cambió.`);
filas.sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(
  SALIDA,
  [
    "# Canales de llamada de aeródromos no controlados de la zona, de la lista de Federico",
    "# (docs/fuentes/frecuencias-zona.pdf, 2026-11-03). No es del AIP: MADHEL gana donde publica uno.",
    "# Generado por scripts/build-frecuencias-zona.mjs; NO EDITAR A MANO.",
    "# designador\ticao\tMHz",
    ...filas.map((f) => f.join("\t")),
  ].join("\n") + "\n"
);
console.log(`${filas.length} aeródromos no controlados → ${path.relative(RAIZ, SALIDA)}`);
