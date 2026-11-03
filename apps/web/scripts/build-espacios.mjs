#!/usr/bin/env node
/**
 * Guarda el texto de las TMA de **ENR 2.1** del AIP en `src/data/aip/ENR-2.1.txt`.
 *
 *   npm run build:espacios
 *   npm run build:espacios -- /ruta/a/ENR-2.1.pdf
 *
 * ## Para qué
 *
 * Para dibujar las TMA en En vuelo (3.0.0). Las CTR y ATZ no están acá: están en AD 2.17 de
 * cada aeródromo y las guarda `build-aip.mjs`.
 *
 * ## Por qué guarda texto y no polígonos
 *
 * Por lo mismo que `build-aip.mjs`: lo commiteado es **la copia verbatim** del documento, y
 * los polígonos los arma `src/lib/espacios-aereos.ts`, que es puro y está testeado contra este
 * texto en los dos sentidos (invariante 12). Un parser que se equivoca se ve en un test; un
 * polígono guardado mal no se ve nunca.
 *
 * Al final van los sectores por nivel de las TMA que los tienen (Baires: piso 2500 FT y FL 45),
 * que el AIP describe en las observaciones.
 *
 * De cada TMA se guarda la parte en castellano: el nombre, los límites laterales, los
 * verticales y la clase, hasta donde empieza la versión en inglés. La tabla del PDF tiene más
 * columnas (la dependencia, las frecuencias) y a veces se mezclan en el texto: el parser lo
 * detecta y esa TMA no se dibuja.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
import { UA_VECTOR } from "./ua-vector.mjs";

const BASE = "https://ais.anac.gob.ar";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "aip", "ENR-2.1.txt");
const FUENTES = path.join(RAIZ, "src", "data", "aip-fuentes.tsv");

async function listadoEnr() {
  const res = await fetch(`${BASE}/aip/enr`, { headers: { "User-Agent": UA_VECTOR, "X-Requested-With": "XMLHttpRequest" } });
  if (!res.ok) throw new Error(`El listado ENR contestó ${res.status}`);
  return res.text();
}

function documento(html) {
  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    if (!texto.includes("ENR-2.1")) continue;
    const href = /href="([^"]+)"/.exec(fila);
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (href && sello) return { url: BASE + href[1], edicion: sello[1], vigenteDesde: sello[2] };
  }
  throw new Error("ENR-2.1 no aparece en el listado ENR");
}

/** El renglón con el que arranca una TMA: "TMA BAIRES", seguido de sus límites. */
const ENCABEZADO = /^TMA [A-ZÁÉÍÓÚÑÜ ()]+$/;
const ARRANQUE_LIMITES = /^(Desde|C[ií]rculo|Arco)\b/;
/** Donde empieza la versión en inglés de la misma TMA. */
const INGLES = /^(From|Circle|Arc of|Area)\b/;

/**
 * Los sectores por nivel de una TMA, que el AIP no pone en los límites sino en las
 * observaciones: "EL LÍMITE VERTICAL INFERIOR DEL TMA BAIRES ESTA DIVIDIDO EN DOS SECTORES:
 * (I) … (II) … comprende el resto del espacio aéreo del TMA BAIRES". Se guarda desde el
 * anuncio hasta "el resto del espacio aéreo del TMA <nombre>", con el nombre de la TMA.
 */
export function bloquesSectores(texto) {
  const lineas = texto.split("\n");
  const bloques = [];
  for (let i = 0; i < lineas.length; i++) {
    if (!/^EL LÍMITE VERTICAL INFERIOR/.test(lineas[i].trim())) continue;
    const anuncio = lineas.slice(i, i + 4).join(" ");
    const tma = /DEL\s+(TMA\s+[A-ZÁÉÍÓÚÑÜ ]+?)\s+(?:ESTA|ESTÁ|SE ENCUENTRA)/.exec(anuncio);
    if (!tma) continue;
    let j = i;
    while (j < lineas.length && !/comprende el resto del/.test(lineas[j])) j++;
    if (j >= lineas.length || j - i > 120) continue;
    bloques.push(`SECTORES ${tma[1].replace(/\s+/g, " ")}\n${lineas.slice(i, j + 3).join("\n")}`);
  }
  return bloques;
}

export function bloquesTma(texto) {
  const lineas = texto.split("\n");
  const bloques = [];
  for (let i = 0; i < lineas.length - 1; i++) {
    if (!ENCABEZADO.test(lineas[i].trim()) || !ARRANQUE_LIMITES.test(lineas[i + 1].trim())) continue;
    let j = i + 1;
    while (j < lineas.length && !INGLES.test(lineas[j].trim()) && !(j > i + 1 && ENCABEZADO.test(lineas[j].trim()))) j++;
    bloques.push(lineas.slice(i, j).join("\n").trimEnd());
  }
  return bloques;
}

async function main() {
  const local = process.argv[2];
  let meta = { url: "", edicion: "", vigenteDesde: "" };
  let bytes;
  if (local) {
    bytes = fs.readFileSync(local);
    // El listado, si se guardó al lado del PDF: da la edición y la URL de la cabecera.
    const listado = path.join(path.dirname(local), "enr.html");
    if (fs.existsSync(listado)) meta = documento(fs.readFileSync(listado, "utf8"));
  } else {
    meta = documento(await listadoEnr());
    const res = await fetch(meta.url, { headers: { "User-Agent": UA_VECTOR } });
    if (!res.ok) throw new Error(`ENR-2.1 contestó ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const bloques = bloquesTma(text);
  if (bloques.length < 20) throw new Error(`Sólo ${bloques.length} TMA en ENR 2.1: el formato cambió, no se pisa lo que hay.`);

  const cabecera = [
    `# ENR 2.1 — TMA, extraído de ${meta.url || "(PDF local)"}`,
    `# AIP ARGENTINA · edición ${meta.edicion || "?"} · vigente desde ${meta.vigenteDesde || "?"}`,
    "# Generado por scripts/build-espacios.mjs. NO EDITAR A MANO: es la copia verbatim contra",
    "# la que espacios-aereos.test.ts contrasta los polígonos.",
    "",
  ].join("\n");
  const sectores = bloquesSectores(text);
  fs.writeFileSync(SALIDA, `${cabecera}${[...bloques, ...sectores].join("\n\n")}\n`);

  if (meta.url) {
    const previas = fs.existsSync(FUENTES)
      ? fs.readFileSync(FUENTES, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("ENR2.1\t"))
      : [];
    const fila = ["ENR2.1", "ENR 2.1", meta.edicion, meta.vigenteDesde, meta.url].join("\t");
    fs.writeFileSync(FUENTES, [...previas, fila].sort().join("\n") + "\n");
  }
  console.log(`${bloques.length} TMA y ${sectores.length} divididas en sectores → src/data/aip/ENR-2.1.txt`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
