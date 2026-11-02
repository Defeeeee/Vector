#!/usr/bin/env node
/**
 * Agrega (o actualiza) la columna de **variación magnética** en src/data/madhel.tsv.
 *
 *   node scripts/build-magvar.mjs
 *
 * ## Por qué existe
 *
 * Vector no tenía variación magnética en ningún lado: ni columna, ni librería, ni
 * algoritmo. Sin ella, un plan de navegación que derive el curso de coordenadas da
 * grados **verdaderos**, y el piloto vuela con un DG que marca **magnéticos**. La
 * diferencia no se nota leyendo la pantalla: todos los rumbos salen corridos
 * exactamente lo mismo, que es la firma de ese bug y la razón por la que es peligroso.
 *
 * ## Por qué es una columna y no una cuenta en runtime
 *
 * El modelo WMM son cientos de coeficientes y una suma de armónicos esféricos por
 * punto. Precalcularlo deja **cero dependencias en producción y cero costo por
 * request**: `geomagnetism` es `devDependency` y no entra al bundle. La variación se
 * mueve ~0,1–0,2°/año en Argentina, así que la columna sirve varios años.
 *
 * ## Lo que la medición desmintió
 *
 * El plan de esta feature decía "Argentina va de ~5° a 15° W". **Es falso, y de una
 * forma que importa: el signo se da vuelta adentro del país.** Morón tiene 10,0° W,
 * Salta 9,3° W — pero Bariloche tiene 5,4° **E** y Ushuaia 11,7° **E**. La línea
 * agónica cruza la Patagonia.
 *
 * O sea que una constante nacional no sería "aproximada": en el sur estaría equivocada
 * por el doble de la variación, más de 20°. Es exactamente el argumento a favor de una
 * columna por aeródromo.
 *
 * ## Signo
 *
 * El WMM publica **declinación positiva al este**. La carta argentina y el piloto usan
 * **variación oeste positiva**. La columna guarda la segunda —`variacionW`, con la `W`
 * en el nombre— porque es la que se suma al rumbo verdadero, y porque mezclar los dos
 * criterios no cancela el error: lo duplica.
 *
 * ## Orden respecto de build-madhel
 *
 * `build-madhel.mjs` regenera el TSV desde la API de ANAC y **se lleva puesta esta
 * columna**. Después de correrlo hay que correr éste. Es idempotente: si la columna ya
 * está, la reemplaza.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const geomagnetism = require("geomagnetism");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSV = path.join(ROOT, "src", "data", "madhel.tsv");

/**
 * Fecha de referencia del cálculo. Fija y no `new Date()` para que dos corridas del
 * mismo commit den el mismo archivo — si no, cada `npm run build:magvar` ensuciaría el
 * diff con centésimas de grado. Subila y volvé a correr cada par de años.
 *
 * El modelo que trae `geomagnetism` es WMM-2025 y **vence el 13/11/2029**. Pasada esa
 * fecha hay que actualizar el paquete, no sólo esta constante.
 */
const EPOCA = new Date("2026-08-01T00:00:00Z");

/** Las 13 columnas que ya tenía el archivo. La 14ª es la que agregamos. */
const COLUMNAS_ORIGINALES = 13;

function main() {
  if (!fs.existsSync(TSV)) {
    console.error(`No existe ${TSV}. Corré primero build-madhel.mjs.`);
    process.exit(1);
  }

  const modelo = geomagnetism.model(EPOCA);
  const original = fs.readFileSync(TSV, "utf8");
  const lineas = original.split("\n");

  let conVariacion = 0;
  let sinCoordenadas = 0;
  let minimo = Infinity;
  let maximo = -Infinity;

  const salida = lineas.map((linea) => {
    if (!linea.trim()) return linea;

    // Recortar a las columnas originales hace que correr esto dos veces no agregue dos
    // columnas. Sin esto el archivo crecería una columna por corrida, en silencio.
    const campos = linea.split("\t").slice(0, COLUMNAS_ORIGINALES);
    while (campos.length < COLUMNAS_ORIGINALES) campos.push("");

    const lat = Number.parseFloat(campos[11]);
    const lon = Number.parseFloat(campos[12]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      // Hay aeródromos de MADHEL sin posición publicada. Columna vacía, **no cero**:
      // cero es una variación válida (la línea agónica) y confundirlos haría que un
      // aeródromo sin dato se viera como uno sobre la agónica.
      sinCoordenadas++;
      campos.push("");
      return campos.join("\t");
    }

    const declinacionEste = modelo.point([lat, lon]).decl;
    // Una décima de grado. El modelo declara ~0,36° de incertidumbre y un DG se lee a
    // cinco: más decimales serían precisión inventada.
    const variacionW = Math.round(-declinacionEste * 10) / 10;

    conVariacion++;
    minimo = Math.min(minimo, variacionW);
    maximo = Math.max(maximo, variacionW);
    campos.push(String(variacionW));
    return campos.join("\t");
  });

  fs.writeFileSync(TSV, salida.join("\n"));

  console.log(`Modelo: ${modelo.name} (válido hasta ${modelo.end_date.toISOString().slice(0, 10)})`);
  console.log(`Época de cálculo: ${EPOCA.toISOString().slice(0, 10)}`);
  console.log(`Aeródromos con variación: ${conVariacion}`);
  console.log(`Sin coordenadas, columna vacía: ${sinCoordenadas}`);
  console.log(`Rango: ${minimo}° a ${maximo}° (positivo = oeste)`);
  if (minimo < 0 && maximo > 0) {
    console.log("La línea agónica cruza el país: hay aeródromos con variación este y otros con oeste.");
  }
}

main();
