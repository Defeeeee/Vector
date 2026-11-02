#!/usr/bin/env node
/**
 * Empaqueta `src/sw/sw.ts` en `public/sw.js`.
 *
 *   npm run build:sw          (lo corre `npm run build` solo)
 *
 * ## Por qué hay un bundler y no un `.js` escrito a mano
 *
 * Porque el service worker **importa código de `src/lib/`** —hoy la política de
 * caches, más adelante la resolución de puntos de ruta—, y esos imports no existen
 * en un archivo suelto de `public/`. Sin bundler, la única salida sería copiar esa
 * lógica adentro del service worker: dos implementaciones de lo mismo, que es
 * exactamente el error que este repo ya cometió cinco veces con `splitRoute`.
 *
 * ## Por qué esbuild propio y no `@serwist/next`
 *
 * `@serwist/next` depende del plugin de webpack y este repo compila con Turbopack.
 * `@serwist/turbopack` sí existe, pero sirve el service worker desde un **route
 * handler** que corre esbuild adentro del build de Next. Un script propio deja
 * `/sw.js` como lo que es —un archivo estático— y pone el bundling donde este repo
 * ya pone todo lo que se genera: en `scripts/`, junto a los otros nueve.
 *
 * ## Por qué `esbuild` es `dependencies` y no `devDependency`
 *
 * Porque **el deploy instala con `npm ci --omit=dev`**. Este script corre como parte
 * de `npm run build`, así que si esbuild quedara del lado de desarrollo el build de
 * producción fallaría en el servidor y andaría perfecto en la máquina de quien lo
 * escribió — la peor combinación posible.
 *
 * `sharp` sí es `devDependency`, y la diferencia es real: `build:iconos` se corre a
 * mano y su resultado se commitea, así que el servidor nunca lo necesita.
 *
 * ## Por qué `public/sw.js` no se commitea
 *
 * Es el único generado de este repo que **no** va al control de versiones, y la
 * razón es que va a depender del build: en cuanto haya precache, el archivo lleva
 * adentro los nombres con hash de `.next/static`, que cambian en cada compilación.
 * Un archivo commiteado sería viejo desde el primer deploy. Por eso `npm run build`
 * lo produce siempre y `.gitignore` lo excluye.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));

const ENTRADA = path.join(RAIZ, "src", "sw", "sw.ts");
const SALIDA = path.join(RAIZ, "public", "sw.js");

const resultado = await esbuild.build({
  entryPoints: [ENTRADA],
  outfile: SALIDA,
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  /*
    El service worker no corre en Next, así que `process.env.NEXT_PUBLIC_APP_VERSION`
    —que Next reemplaza en el bundle de la app— acá no existe. Se hornea la misma
    versión de `package.json`, que es de donde Next también la saca: una sola fuente.

    Esto además es lo que hace que el navegador note que hay versión nueva. El
    navegador compara el `sw.js` byte a byte; si el archivo saliera idéntico entre
    dos deploys, la actualización no se dispararía.
  */
  define: { "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(version) },
  alias: { "@": path.join(RAIZ, "src") },
  logLevel: "warning",
  metafile: true,
});

const bytes = fs.statSync(SALIDA).size;
console.log(`sw.js  ${(bytes / 1024).toFixed(1)} KB  (versión ${version})`);

if (resultado.errors.length) process.exit(1);
