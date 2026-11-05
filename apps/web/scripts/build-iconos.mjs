#!/usr/bin/env node
/**
 * Genera los PNG de la PWA desde las piezas de la marca (`public/marca/`, 3.10.0).
 *
 *   npm run build:iconos
 *
 * **Una fuente, cinco salidas.** La marca se dibuja una sola vez en el SVG; esto la
 * rasteriza a los tamaños que piden el manifest y iOS. Dibujar cada tamaño a mano
 * sería garantizar que se separen — la misma lección de `build-changelog.mjs`, que
 * existe porque el changelog llegó a estar escrito en dos lados.
 *
 * Es un script de build de los que se corren **una vez y se commitea el resultado**,
 * como los otros nueve de esta carpeta. `sharp` es `devDependency`: cero dependencia
 * en runtime, cero costo por request.
 *
 * ## Por qué hay un `maskable` aparte y no alcanza con el normal
 *
 * Android recorta el ícono con la forma que tenga el launcher —círculo, cuadrado
 * redondeado, "squircle"— y el recorte puede comerse hasta el 20% de cada borde. Un
 * ícono común metido ahí pierde las esquinas del fondo y, peor, puede perder un
 * pedazo de la marca.
 *
 * La versión `maskable` resuelve las dos cosas: **fondo a sangre** (sin las esquinas
 * redondeadas, que las pone el sistema) y **la marca al 60% del lienzo**, bien dentro
 * de la "zona segura" circular del 80% que define la especificación. Se ve más chica
 * de lo que uno querría; es a propósito.
 *
 * ## Y por qué el de Apple lleva fondo opaco
 *
 * iOS **no soporta transparencia** en el `apple-touch-icon`: la rellena de negro. Va el ícono
 * cuadrado (a sangre, iOS le pone sus esquinas) aplanado contra la noche.
 *
 * ## Desde la 3.10.0
 *
 * La marca es la flecha de rumbo plegada en dos tonos sobre la noche (manual de marca en
 * `marketing/marca/`). Cada salida tiene su pieza dibujada: el maskable ya trae la flecha dentro
 * de la zona segura, así que no hace falta recomponerla acá.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = path.join(RAIZ, "public", "marca");
const SALIDA = path.join(RAIZ, "public");
/** La noche de la marca. */
export const FONDO = "#0B0D10";

const pieza = (nombre) => fs.readFileSync(path.join(MARCA, `${nombre}.svg`));

async function main() {
  const escribir = async (nombre, buffer) => {
    fs.writeFileSync(path.join(SALIDA, nombre), buffer);
    console.log(`  ${nombre.padEnd(28)} ${(buffer.length / 1024).toFixed(1)} KB`);
  };
  console.log(`Rasterizando ${path.relative(RAIZ, MARCA)}:`);
  for (const lado of [192, 512]) {
    await escribir(`icono-${lado}.png`, await sharp(pieza("icono-app"), { density: 300 }).resize(lado, lado).png().toBuffer());
  }
  await escribir("icono-512-maskable.png", await sharp(pieza("icono-app-maskable"), { density: 300 }).resize(512, 512).png().toBuffer());
  await escribir("apple-touch-icon.png", await sharp(pieza("icono-app-cuadrado"), { density: 300 }).resize(180, 180).flatten({ background: FONDO }).png().toBuffer());
  // El favicon de Next (`src/app/icon.svg`) es la pieza para tamaños chicos.
  fs.copyFileSync(path.join(MARCA, "favicon.svg"), path.join(RAIZ, "src", "app", "icon.svg"));
  console.log("  src/app/icon.svg             (favicon)");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
