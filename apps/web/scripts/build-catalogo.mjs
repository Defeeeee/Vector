#!/usr/bin/env node
/**
 * Genera `public/catalogo-aeronautico.json`: los datos que el planificador necesita
 * para resolver puntos **sin señal**.
 *
 *   npm run build:catalogo
 *
 * **El resultado se commitea**, como los otros nueve generadores y a diferencia de
 * `sw.js`: la salida es determinista y no depende del build. Por eso no corre en
 * `npm run build` — correrlo en cada deploy sería regenerar un archivo idéntico. Que
 * el commiteado esté al día lo garantiza un test, no la disciplina.
 *
 * ## Qué entra y qué no, con los números al lado
 *
 * Entra **Argentina sola**: los aeródromos de MADHEL y los argentinos del directorio
 * mundial, más las 96 radioayudas, los 1018 puntos significativos, las 220 aerovías y
 * las fuentes del AIP que la resolución consulta.
 *
 * Queda afuera el resto del mundo, y la cuenta lo explica: `airports.tsv` son 17.129
 * filas y **469 KB comprimido** — diez veces todo lo demás junto, para poder resolver
 * aeródromos de Kazajistán en el celular de un PPA que junta horas para el PCA. Si
 * algún día hace falta Colonia o Punta del Este, se agregan a mano por
 * `airports-overlay.tsv`, que es un patrón que este repo ya tiene.
 *
 * ⚠️ **Esa asimetría es visible y hay que decirla.** El catálogo del servidor conoce
 * el mundo entero; éste conoce Argentina. Un código extranjero resuelve con señal y no
 * resuelve sin ella, y eso el planificador lo avisa en vez de dejar al piloto pensando
 * que el punto no existe.
 *
 * ## Por qué empaqueta TypeScript en vez de leer los TSV
 *
 * Porque el catálogo sale de `allAirports()`, `allRadioayudas()`, `allFixes()` y
 * `allAerovias()` — **las mismas funciones que usa el servidor**. Un generador que
 * re-parseara los TSV sería una tercera implementación de la lectura de datos, y se
 * separaría de las otras dos la primera vez que alguien tocara un parser sin acordarse
 * de este archivo. Ver `scripts/catalogo-fuente.ts`.
 *
 * Esos módulos son `.ts` y usan el alias `@`, así que hay que empaquetarlos. esbuild ya
 * está para el service worker; es el mismo martillo.
 *
 * ## Determinismo
 *
 * La salida va ordenada y sin marcas de tiempo, así que **regenerarlo dos veces da el
 * mismo byte**. `catalogo.test.ts` lo comprueba: si difiere, o el generador dejó de ser
 * determinista o alguien editó el JSON a mano.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "public", "catalogo-aeronautico.json");

/**
 * Empaqueta `catalogo-fuente.ts` y lo corre.
 *
 * Se deja en un archivo temporal en vez de importarlo por `data:` URL porque los
 * módulos leen los TSV con rutas relativas a `process.cwd()`, y eso sólo funciona con
 * un import de archivo normal.
 */
async function armar() {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vector-catalogo-")), "fuente.mjs");

  await esbuild.build({
    entryPoints: [path.join(RAIZ, "scripts", "catalogo-fuente.ts")],
    outfile: tmp,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    // `node:fs` y compañía se resuelven en runtime, no se empaquetan.
    packages: "external",
    alias: { "@": path.join(RAIZ, "src") },
    logLevel: "warning",
  });

  const { armarCatalogo } = await import(tmp);
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  return armarCatalogo();
}

const catalogo = await armar();
// Sin indentación ni saltos: es un archivo para una máquina, y cada espacio viaja.
const json = JSON.stringify(catalogo);
fs.writeFileSync(SALIDA, json);

const gzip = zlib.gzipSync(Buffer.from(json)).length;
console.log(
  `catalogo-aeronautico.json  ${(json.length / 1024).toFixed(0)} KB` +
    ` (${(gzip / 1024).toFixed(0)} KB comprimido)`
);
for (const [nombre, tabla] of Object.entries(catalogo)) {
  if (Array.isArray(tabla)) console.log(`  ${nombre.padEnd(13)} ${String(tabla.length).padStart(5)}`);
}
