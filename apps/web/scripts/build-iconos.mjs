#!/usr/bin/env node
/**
 * Genera los PNG de la PWA desde `src/app/icon.svg`.
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
 * iOS **no soporta transparencia** en el `apple-touch-icon`: la rellena de negro. Como
 * nuestro SVG ya trae su propio fondo azul, alcanza con rasterizarlo sin canal alfa.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = path.join(RAIZ, "src", "app", "icon.svg");
const SALIDA = path.join(RAIZ, "public");

/** El azul del propio SVG. Si cambia allá, cambia acá — y el test lo comprueba. */
const FONDO = "#2563eb";

/**
 * La marca sola, sin el fondo redondeado, para poder recomponerla centrada y chica
 * sobre un lienzo a sangre. Se lee del SVG en vez de repetirse acá.
 */
function marcaSola(svg) {
  const trazo = /<path\s+d="([^"]+)"\s+fill="#ffffff"\s*\/>/.exec(svg);
  if (!trazo) {
    throw new Error(
      "No se encontró el <path> blanco en icon.svg. Si se redibujó la marca, hay que " +
        "actualizar este script: el `maskable` necesita la marca sin el fondo."
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${trazo[1]}" fill="#ffffff"/></svg>`;
}

async function main() {
  const svg = fs.readFileSync(FUENTE, "utf8");
  fs.mkdirSync(SALIDA, { recursive: true });

  const escribir = async (nombre, buffer) => {
    const destino = path.join(SALIDA, nombre);
    fs.writeFileSync(destino, buffer);
    console.log(`  ${nombre.padEnd(28)} ${(buffer.length / 1024).toFixed(1)} KB`);
  };

  console.log(`Rasterizando ${path.relative(RAIZ, FUENTE)}:`);

  // Los dos tamaños que pide el manifest, tal cual el SVG.
  for (const lado of [192, 512]) {
    await escribir(`icono-${lado}.png`, await sharp(Buffer.from(svg)).resize(lado, lado).png().toBuffer());
  }

  // El maskable: fondo a sangre y la marca al 60%, dentro de la zona segura.
  const LADO = 512;
  const MARCA = Math.round(LADO * 0.6);
  const marca = await sharp(Buffer.from(marcaSola(svg))).resize(MARCA, MARCA).png().toBuffer();
  await escribir(
    "icono-512-maskable.png",
    await sharp({ create: { width: LADO, height: LADO, channels: 4, background: FONDO } })
      .composite([{ input: marca, gravity: "center" }])
      .png()
      .toBuffer()
  );

  // iOS rellena de negro lo transparente; el SVG ya trae fondo, así que basta con
  // aplanar contra el mismo azul para que no quede canal alfa.
  await escribir(
    "apple-touch-icon.png",
    await sharp(Buffer.from(svg)).resize(180, 180).flatten({ background: FONDO }).png().toBuffer()
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
