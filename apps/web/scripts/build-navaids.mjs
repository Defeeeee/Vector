#!/usr/bin/env node
/**
 * Genera src/data/navaids.tsv con las radioayudas argentinas.
 *
 *   npm run build:navaids
 *   npm run build:navaids -- /ruta/a/navaids.csv   (usa un CSV ya bajado)
 *
 * ## Para qué
 *
 * Para poder poner `BAR` o `CBA` como punto de una ruta, y para poder construir un punto
 * por radial y distancia desde una estación.
 *
 * ## Qué entra y qué no
 *
 * **Todos los VOR y VOR-DME.** Son 57 en Argentina y —esto es lo que decide— **ninguno
 * tiene el ident repetido**. Un `BAR` en una ruta no puede ser otra cosa.
 *
 * **De los NDB, sólo los que tengan ident único.** Son 101 y usan una sola letra, así que
 * se pisan entre ellos sin piedad: `L` aparece cinco veces, `N` cinco, `A` tres —Ezeiza,
 * Reconquista y Tartagal—. Aceptar un ident ambiguo en una ruta significaría que el
 * planificador elige por vos cuál de tres estaciones a mil kilómetros de distancia
 * quisiste decir. **Un punto de ruta equivocado y silencioso es peor que un punto que no
 * resuelve.**
 *
 * ## La variación de la estación, que es el punto delicado
 *
 * **Un radial de VOR es magnético, pero referido a la variación con la que la estación
 * está alineada** — no a la de hoy. Las estaciones se realinean cada muchos años, así que
 * la diferencia es real: OurAirports da Bariloche con 8,0° E, y el WMM de hoy da 5,4° E.
 * Casi tres grados, que en 25 NM son más de una milla de error lateral.
 *
 * Por eso se guarda `slaved_variation_deg` cuando está (50 de 57 VOR) y
 * `magnetic_variation_deg` como respaldo. **OurAirports las publica con el este positivo**;
 * acá se invierten para dejarlas en la convención del resto del proyecto —oeste
 * positiva— y que la conversión sea la misma resta de siempre.
 *
 * El dato es de alrededor de 2007, lo cual se puede comprobar: 8,03° E en Bariloche
 * coincide con extrapolar hacia atrás la deriva de 0,144°/año que da el WMM.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FUENTE = "https://davidmegginson.github.io/ourairports-data/navaids.csv";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "navaids.tsv");

/** Parser de CSV con comillas, igual que el de build-runways. */
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
  const local = process.argv[2];
  let csv;

  if (local) {
    console.log(`Leyendo ${local}`);
    csv = fs.readFileSync(local, "utf8");
  } else {
    const res = await fetch(FUENTE, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`OurAirports respondió ${res.status}.`);
      console.error(`Podés bajarlo a mano:  curl -o navaids.csv ${FUENTE}`);
      console.error(`y pasarlo:             npm run build:navaids -- navaids.csv`);
      process.exit(1);
    }
    csv = await res.text();
  }

  const datos = filas(csv);
  const cab = datos[0];
  const col = (n) => cab.indexOf(n);
  const idx = {
    ident: col("ident"),
    name: col("name"),
    type: col("type"),
    freq: col("frequency_khz"),
    lat: col("latitude_deg"),
    lon: col("longitude_deg"),
    pais: col("iso_country"),
    slaved: col("slaved_variation_deg"),
    mag: col("magnetic_variation_deg"),
  };

  const argentinas = datos
    .slice(1)
    .filter((f) => f[idx.pais] === "AR" && f[idx.ident]?.trim());

  // Cuántas veces aparece cada ident, para poder descartar los ambiguos.
  const veces = new Map();
  for (const f of argentinas) {
    const id = f[idx.ident].trim().toUpperCase();
    veces.set(id, (veces.get(id) ?? 0) + 1);
  }

  const salida = [];
  let ndbAmbiguos = 0;
  let sinPosicion = 0;

  for (const f of argentinas) {
    const ident = f[idx.ident].trim().toUpperCase();
    const tipo = f[idx.type].trim().toUpperCase();
    const esVor = tipo.includes("VOR");

    if (!esVor && veces.get(ident) > 1) {
      ndbAmbiguos++;
      continue;
    }

    const lat = Number.parseFloat(f[idx.lat]);
    const lon = Number.parseFloat(f[idx.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      sinPosicion++;
      continue;
    }

    /*
      De este positivo (como lo publica OurAirports) a oeste positivo (como lo usa todo
      el resto del proyecto). El `slaved` manda: es con el que la estación está alineada,
      y por lo tanto el que define a dónde apunta cada radial.
    */
    const slaved = Number.parseFloat(f[idx.slaved]);
    const mag = Number.parseFloat(f[idx.mag]);
    const variacionEste = Number.isFinite(slaved) ? slaved : Number.isFinite(mag) ? mag : NaN;

    salida.push(
      [
        ident,
        tipo,
        f[idx.name].trim(),
        lat.toFixed(4),
        lon.toFixed(4),
        f[idx.freq]?.trim() || "",
        Number.isFinite(variacionEste) ? String(Math.round(-variacionEste * 10) / 10) : "",
        Number.isFinite(slaved) ? "slaved" : Number.isFinite(mag) ? "modelo" : "",
      ].join("\t")
    );
  }

  salida.sort();
  fs.writeFileSync(SALIDA, salida.join("\n") + "\n");

  const porTipo = {};
  for (const l of salida) {
    const t = l.split("\t")[1];
    porTipo[t] = (porTipo[t] ?? 0) + 1;
  }

  console.log(`navaids.tsv: ${salida.length} radioayudas.`);
  console.log(`  por tipo: ${Object.entries(porTipo).map(([t, n]) => `${t} ${n}`).join(", ")}`);
  console.log(`  NDB descartados por ident ambiguo: ${ndbAmbiguos}`);
  if (sinPosicion) console.log(`  descartadas sin posición: ${sinPosicion}`);
  console.log(`  Columnas: ident tipo nombre lat lon khz variacionW origenVariacion`);
}

main();
