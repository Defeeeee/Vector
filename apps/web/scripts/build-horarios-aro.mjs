/**
 * El horario de cada oficina ARO/AIS, de la AIP: AD 2.3, renglón 5, "Oficina de
 * notificación ATS (ARO) / ATS Reporting Office (ARO)".
 *
 * Escribe `src/data/aip-horarios-aro.tsv`: OACI, el horario tal como lo publica la AIP,
 * el renglón entero (verbatim, contra el que `oficinas-aro.test.ts` lo contrasta), la
 * edición y la URL. Sólo para las oficinas de la AIC A 19/2026 que tienen ficha en la
 * AIP: las URL salen de `src/data/aip-fuentes.tsv`, que regenera `npm run build:aip`.
 *
 * Es un script aparte y no una sección más de `build-aip.mjs` a propósito: sumar AD 2.3
 * allá obliga a regenerar las 51 fichas y con ellas las frecuencias y las pistas de otro
 * ciclo AIRAC, que es otro cambio con otra verificación.
 *
 *     npm run build:horarios-aro
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "src", "data");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const leerTsv = (archivo) =>
  fs
    .readFileSync(path.join(DATOS, archivo), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("\t"));

const oficinas = new Set(leerTsv("oficinas-aro.tsv").map(([oaci]) => oaci));
// aip-fuentes.tsv: icao, documento, edición, vigente desde, url. Las de aeródromo dicen "AD 2.0".
const fichas = leerTsv("aip-fuentes.tsv").filter(([icao, doc]) => oficinas.has(icao) && doc === "AD 2.0");

/** El renglón del ARO dentro de AD 2.3, y el horario: lo que sigue a "(ARO)". */
export function renglonAro(texto) {
  const i = texto.indexOf("AD 2.3");
  const j = texto.indexOf("AD 2.4", i + 1);
  if (i < 0) return null;
  const bloque = texto.slice(i, j > i ? j : undefined).replace(/\s+/g, " ");
  const m = /Oficina de notificaci[oó]n ATS \(ARO\)[^/]*\/ ATS Reporting Office \(ARO\) (.+?)(?= \d{1,2} [A-ZÁÉÍÓ][a-zé]+ |$)/.exec(bloque);
  if (!m) return null;
  return { renglon: m[0].trim(), horario: m[1].trim() };
}

async function main() {
  const filas = [];
  for (const [icao, , edicion, vigente, url] of fichas.sort()) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://ais.anac.gob.ar/aip" } });
    if (!res.ok) {
      console.error(`  ${icao}: la descarga contestó ${res.status}`);
      continue;
    }
    const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    const aro = renglonAro(text);
    if (!aro) {
      console.error(`  ${icao}: no encontré el renglón del ARO en AD 2.3`);
      continue;
    }
    filas.push([icao, aro.horario, aro.renglon, edicion, vigente, url].join("\t"));
    console.log(`  ${icao}: ${aro.horario}`);
  }
  const cabecera = [
    "# Horario de la oficina ARO/AIS de cada aeródromo: AIP AD 2.3, renglón 5. Generado por",
    "# scripts/build-horarios-aro.mjs; NO EDITAR A MANO. El renglón va verbatim para el test.",
    "# oaci\thorario\trenglon\tedicion\tvigente\turl",
  ];
  fs.writeFileSync(path.join(DATOS, "aip-horarios-aro.tsv"), [...cabecera, ...filas].join("\n") + "\n");
  console.log(`${filas.length} de ${fichas.length} oficinas con horario.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
