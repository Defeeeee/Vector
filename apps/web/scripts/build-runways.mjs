#!/usr/bin/env node
/**
 * Genera src/data/runways.tsv con las pistas argentinas y su **rumbo verdadero**.
 *
 *   npm run build:runways
 *   npm run build:runways -- /ruta/a/runways.csv   (usa un CSV ya bajado)
 *
 * ## Para qué
 *
 * Para poder decir "en SAEZ hay 14 kt cruzado por pista 11" en vez de "en SAEZ hay
 * 14 kt". La pantalla vieja de Ruta METAR avisaba por viento total y en el mismo
 * mensaje pedía "verificá el viento cruzado máximo demostrado" — pedía comparar contra
 * un número que no calculaba.
 *
 * ## Por qué `le_heading_degT` y no el designador de la pista
 *
 * El designador es **magnético y viejo**: se pinta cuando se habilita la pista y no se
 * repinta cada año. La variación se mueve ~0,15°/año, así que arrastra la de la época.
 * Medido sobre 117 pistas argentinas contra nuestra columna WMM: la mayoría coincide al
 * décimo de grado, pero **SADF implica 6° W cuando hoy son 10,2°** — unos 27 años de
 * deriva. Un aeródromo que no repintó en décadas puede estar 4° corrido.
 *
 * `le_heading_degT` es rumbo **verdadero**, que además es el marco en el que Vector
 * hace toda su matemática y en el que el METAR escrito reporta el viento. O sea que el
 * cruzado sale **sin una sola conversión**: `windComponents(rumboPista, vientoDir, vel)`.
 *
 * ## Cobertura, dicha honestamente
 *
 * OurAirports sólo conoce aeródromos con indicador ICAO. De los 711 de MADHEL, 153
 * tienen ICAO, y de esos hay pista con rumbo publicado en **93**. Los 558 campos que se
 * identifican sólo con designador ANAC —GEZ, MOR— no tienen ninguna. Para esos el
 * cruzado no se estima: se dice que no se sabe.
 *
 * ## Orden respecto de los otros scripts
 *
 * Independiente. No toca `madhel.tsv` ni `airports.tsv`; escribe su propio archivo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FUENTE = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MADHEL = path.join(RAIZ, "src", "data", "madhel.tsv");
const SALIDA = path.join(RAIZ, "src", "data", "runways.tsv");

/** Parser de CSV con comillas. El de OurAirports las usa en todos los campos. */
function filas(texto) {
  const out = [];
  let campo = "";
  let fila = [];
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); out.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); out.push(fila); }
  return out;
}

async function main() {
  if (!fs.existsSync(MADHEL)) {
    console.error(`No existe ${MADHEL}. Corré primero build-madhel.mjs.`);
    process.exit(1);
  }

  // Sólo aeródromos que Vector conoce. Bajar las 40.000 pistas del mundo para usar 117
  // sería regalar medio megabyte al bundle.
  const icaosArgentinos = new Set();
  for (const linea of fs.readFileSync(MADHEL, "utf8").split("\n")) {
    const icao = linea.split("\t")[1];
    if (icao) icaosArgentinos.add(icao);
  }

  /*
    Se puede pasar un CSV ya bajado como argumento. No es sólo comodidad: hay entornos
    —el sandbox donde se escribió esto, sin ir más lejos— donde el `fetch` de Node no
    sale a internet aunque `curl` sí. Con el archivo local el script se puede correr
    igual, y de paso permite reconstruir sin red.
  */
  const local = process.argv[2];
  let csv;

  if (local) {
    console.log(`Leyendo ${local}`);
    csv = fs.readFileSync(local, "utf8");
  } else {
    const res = await fetch(FUENTE, {
      // Sin User-Agent de navegador algunos CDN contestan 403. Es el mismo encabezado
      // que usa `build-madhel.mjs`.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`OurAirports respondió ${res.status}.`);
      console.error(`Podés bajarlo a mano y pasarlo:  npm run build:runways -- runways.csv`);
      console.error(`  curl -o runways.csv ${FUENTE}`);
      process.exit(1);
    }
    csv = await res.text();
  }

  const datos = filas(csv);
  const cab = datos[0];
  const col = (nombre) => cab.indexOf(nombre);
  const iIcao = col("airport_ident");
  const iCerrada = col("closed");
  const iLe = col("le_ident");
  const iHe = col("he_ident");
  const iRumbo = col("le_heading_degT");
  const iLargo = col("length_ft");
  const iSup = col("surface");

  const salida = [];
  let sinRumbo = 0;

  for (const f of datos.slice(1)) {
    const icao = f[iIcao];
    if (!icaosArgentinos.has(icao)) continue;
    if (f[iCerrada] === "1") continue;

    const rumbo = Number.parseFloat(f[iRumbo]);
    if (!Number.isFinite(rumbo)) {
      // Sin rumbo la fila no sirve para lo único que queremos. No se escribe: una fila
      // con la columna vacía invitaría a alguien a tratarla como cero.
      sinRumbo++;
      continue;
    }

    salida.push(
      [
        icao,
        (f[iLe] || "").trim(),
        (f[iHe] || "").trim(),
        // Una décima: el modelo del que sale no da para más y una pista no se alinea
        // con esa precisión.
        String(Math.round(((rumbo % 360) + 360) % 360 * 10) / 10),
        f[iLargo] || "",
        (f[iSup] || "").trim(),
      ].join("\t")
    );
  }

  salida.sort();
  fs.writeFileSync(SALIDA, salida.join("\n") + "\n");

  const aerodromos = new Set(salida.map((l) => l.split("\t")[0]));
  console.log(`runways.tsv: ${salida.length} pistas en ${aerodromos.size} aeródromos.`);
  console.log(`Descartadas por no tener rumbo verdadero publicado: ${sinRumbo}.`);
  console.log(`Columnas: icao le he rumboT largo_ft superficie`);
}

main();
