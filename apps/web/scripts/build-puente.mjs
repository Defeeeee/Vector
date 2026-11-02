#!/usr/bin/env node
/**
 * Empaqueta `src/cad/enlace.ts` en `public/cad/puente.js`: el script que el marcador
 * "Vector → CAD" carga en la pestaña del CAD de ANAC (ver `lib/cad.ts`).
 *
 *   npm run build:puente      (lo corre `npm run build` solo)
 *
 * Como el service worker (`build-sw.mjs`): importa lógica pura de `src/lib/`, así que va
 * con esbuild, y no se commitea porque es un generado del build.
 *
 * El origen del CAD se hornea (`NEXT_PUBLIC_CAD_ORIGEN`, por defecto el de ANAC): el
 * script se niega a correr en cualquier otra página. Para probar contra un CAD falso
 * local se compila con esa variable apuntando ahí.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Desde la 2.36.0 el marcador es un puente (`enlace.ts`): el panel está en Vector. Sale con el
// mismo nombre para que los marcadores ya guardados lo carguen. `puente.ts` (el panel adentro, borrado en la 2.36.2
// del CAD) queda sin compilar hasta que el puente se pruebe contra el CAD real.
const ENTRADA = path.join(RAIZ, "src", "cad", "enlace.ts");
const SALIDA = path.join(RAIZ, "public", "cad", "puente.js");
const CAD_ORIGEN = process.env.NEXT_PUBLIC_CAD_ORIGEN || "https://cad.anac.gob.ar";

const resultado = await esbuild.build({
  entryPoints: [ENTRADA],
  outfile: SALIDA,
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: true,
  define: { __CAD_ORIGEN__: JSON.stringify(CAD_ORIGEN) },
  alias: { "@": path.join(RAIZ, "src") },
  logLevel: "warning",
});

console.log(`cad/puente.js  ${(fs.statSync(SALIDA).size / 1024).toFixed(1)} KB  (CAD: ${CAD_ORIGEN})`);
if (resultado.errors.length) process.exit(1);
