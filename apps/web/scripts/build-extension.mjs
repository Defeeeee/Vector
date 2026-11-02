#!/usr/bin/env node
/**
 * Empaqueta la extensión "Vector → CAD" (`extension/`) en `public/cad/vector-cad.zip`, el
 * archivo que se baja desde `/dashboard/history/cad` para cargarla en Chrome.
 *
 *   npm run build:extension      (lo corre `npm run build` solo)
 *
 * El ZIP lo arma `src/lib/zip.ts` (el mismo de las pegatinas), compilado al vuelo con esbuild,
 * para no depender de `zip` en el VPS. No se commitea: es un generado del build.
 *
 * `cad.js` (la pestaña del CAD) sale de `src/cad/extension-cad.ts`, que comparte con el
 * marcador lo que se le puede pedir al CAD (`src/cad/enlace-comun.ts`); el resto de
 * `extension/` va tal cual.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = path.join(RAIZ, "extension");
const SALIDA = path.join(RAIZ, "public", "cad", "vector-cad.zip");

const { outputFiles } = await esbuild.build({
  entryPoints: [path.join(RAIZ, "src", "lib", "zip.ts")],
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "warning",
});
const { armarZip } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

function archivos(dir, prefijo = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    const nombre = prefijo + e.name;
    if (e.name.startsWith(".")) return [];
    return e.isDirectory() ? archivos(ruta, `${nombre}/`) : [{ nombre: `vector-cad/${nombre}`, datos: new Uint8Array(fs.readFileSync(ruta)) }];
  });
}

const cad = await esbuild.build({
  entryPoints: [path.join(RAIZ, "src", "cad", "extension-cad.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  write: false,
  logLevel: "warning",
});
const lista = [...archivos(ORIGEN), { nombre: "vector-cad/cad.js", datos: cad.outputFiles[0].contents }];
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, armarZip(lista));
const version = JSON.parse(fs.readFileSync(path.join(ORIGEN, "manifest.json"), "utf8")).version;
console.log(`cad/vector-cad.zip  ${(fs.statSync(SALIDA).size / 1024).toFixed(1)} KB  (extensión ${version}, ${lista.length} archivos)`);
