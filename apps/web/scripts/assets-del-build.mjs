/**
 * La lista de archivos estáticos del build, para guardarlos todos en el teléfono (3.44.0).
 *
 * `scripts/build-sw.mjs` la hornea en `public/sw.js` y el service worker la baja al instalarse una
 * versión: así la app abre entera sin señal, aunque el piloto no haya visitado cada pantalla (antes
 * los chunks se guardaban recién al pedirlos, o sea nunca los de una pantalla sin visitar).
 *
 * **Sale del artefacto real** (`.next/static`), no de una lista a mano: cambia el build, cambia la
 * lista. Está en un `.mjs` suelto, y no adentro de `build-sw.mjs`, para poder testearla.
 */

import fs from "node:fs";
import path from "node:path";

/** Lo que no hace falta en el teléfono: mapas de fuentes y basura del sistema. */
const SE_SALTA = /(\.map$|^\.|\.DS_Store$)/;

/** Primero lo que bloquea el dibujo (CSS, tipografías) y después el JS: si se corta, queda lo importante. */
const PRIORIDAD = (url) => (url.endsWith(".css") ? 0 : /\.(woff2?|ttf|otf)$/.test(url) ? 1 : url.endsWith(".js") ? 2 : 3);

function recorrer(dir, rel = "") {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SE_SALTA.test(entrada.name)) continue;
    const ruta = rel ? `${rel}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) salida.push(...recorrer(path.join(dir, entrada.name), ruta));
    else salida.push(ruta);
  }
  return salida;
}

/**
 * Las URLs (`/_next/static/...`) de todo lo que hay en `.next/static`, ordenadas por prioridad y
 * después alfabéticamente (determinista). `[]` si la carpeta no existe (un `build:sw` suelto, sin
 * `next build`): el service worker igual guarda los archivos a medida que se piden.
 */
export function listarAssets(carpetaStatic) {
  if (!fs.existsSync(carpetaStatic)) return [];
  const urls = recorrer(carpetaStatic).map((rel) => `/_next/static/${rel.split("/").map(encodeURIComponent).join("/")}`);
  return [...new Set(urls)].sort((a, b) => PRIORIDAD(a) - PRIORIDAD(b) || a.localeCompare(b));
}
