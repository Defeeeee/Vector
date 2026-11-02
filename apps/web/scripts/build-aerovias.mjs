#!/usr/bin/env node
/**
 * Genera src/data/aerovias.tsv: cada aerovía con **sus puntos en orden**.
 *
 *   npm run build:aerovias
 *   npm run build:aerovias -- /ruta/con/enr31.pdf/y/enr32.pdf
 *
 * ## Para qué
 *
 * Para poder escribir `DORVO A305 UGIMI` en vez de los ocho puntos del medio. Sin orden
 * no hay ruta: `fixes.tsv` ya sabía a qué aerovías pertenece cada punto —eso sale de
 * ENR 4.4— pero **no en qué secuencia**, y una aerovía es exactamente una secuencia.
 *
 * ## De dónde sale
 *
 * De **ENR 3.1** (rutas convencionales) y **ENR 3.2** (RNAV 5). Hacen falta las dos: en
 * ENR 3.1 sola faltaban 147 de las 258 aerovías que ENR 4.4 nombra, y 102 de esas
 * empiezan con `U` —espacio superior— porque viven en ENR 3.2.
 *
 * ## La validación cruzada, que es lo que hace publicable a esto
 *
 * Un parser de PDF que se saltea una fila no falla: **devuelve una aerovía con un punto
 * menos**. Expandida en una ruta, eso da una travesía más corta que la real y con pinta
 * de válida — la misma clase de error silencioso que tenían las frecuencias escritas a
 * mano.
 *
 * Por eso cada aerovía se contrasta contra **el otro documento**: ENR 4.4 dice, punto por
 * punto, a qué aerovías pertenece. Si un fix declara estar en `W18` y la secuencia de
 * `W18` no lo tiene, la secuencia está incompleta y **la aerovía se descarta entera**.
 * Son dos tablas del AIP escritas por separado; que coincidan no es una comprobación
 * contra uno mismo.
 *
 * Se descarta también la aerovía que tenga un punto que no resuelve —radioayudas
 * extranjeras como `FOZ VOR/DME FOZ`, o militares que no están en `navaids.tsv`—, porque
 * expandirla saltearía ese punto sin decirlo.
 *
 * **Lo que no pasa la validación no se publica y por lo tanto no resuelve.** Un `UP664`
 * que no existe se ve en la pantalla; uno que existe con cuatro puntos de menos, no.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const BASE = "https://ais.anac.gob.ar";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "aerovias.tsv");
const FUENTES = path.join(RAIZ, "src", "data", "aip-fuentes.tsv");

const DOCS = [
  { clave: "ENR3.1", buscar: "ENR-3.1", archivo: "enr31.pdf" },
  { clave: "ENR3.2", buscar: "ENR-3.2", archivo: "enr32.pdf" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function listadoEnr() {
  const res = await fetch(`${BASE}/aip/enr`, {
    headers: { "User-Agent": UA, Referer: `${BASE}/aip`, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`El listado ENR contestó ${res.status}`);
  return res.text();
}

function documentoDe(html, buscar) {
  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    if (!texto.includes(buscar)) continue;
    const href = /href="([^"]+)"/.exec(fila);
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (href && sello) return { url: BASE + href[1], edicion: sello[1], vigenteDesde: sello[2] };
  }
  return null;
}

const DESIGNADOR = /^((?:U?[A-Z])\s?\d{1,3}[A-Z]?)$/;
const COORDENADA = /^\d{6}[NS]-\d{7}[EW]$/;
const NOMBRE = /^[A-ZÁÉÍÓÚÑ0-9 /.()*x-]{3,60}$/;

/**
 * Las secuencias de un documento de rutas.
 *
 * La tabla del AIP pone el designador solo en un renglón y debajo los puntos, cada uno
 * con su coordenada. **El ancla es la coordenada**, no el nombre: es lo único con forma
 * fija en un PDF donde las columnas salen entremezcladas y los encabezados se repiten en
 * cada una de las 138 páginas.
 */
function secuencias(texto) {
  const lineas = texto.split("\n").map((l) => l.trim());
  const rutas = new Map();
  let actual = null;

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const d = DESIGNADOR.exec(l);
    if (d) {
      actual = d[1].replace(/\s/g, "");
      if (!rutas.has(actual)) rutas.set(actual, []);
      continue;
    }
    if (!actual || !l) continue;

    // Nombre en un renglón y coordenada en el siguiente.
    if (i + 1 < lineas.length && COORDENADA.test(lineas[i + 1]) && NOMBRE.test(l)) {
      rutas.get(actual).push(l);
      i++;
      continue;
    }
    // Nombre y coordenada en el mismo renglón.
    const m = /^(.{3,60}?)\s+\d{6}[NS]-\d{7}[EW]$/.exec(l);
    if (m) rutas.get(actual).push(m[1].trim());
  }
  return rutas;
}

/** Un TSV del repo, como filas de columnas. */
function leerTsv(nombre) {
  const archivo = path.join(RAIZ, "src", "data", nombre);
  if (!fs.existsSync(archivo)) return [];
  return fs.readFileSync(archivo, "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split("\t"));
}

async function main() {
  const local = process.argv[2];
  let html = null;
  if (!local) html = await listadoEnr();

  const rutas = new Map();
  const fuentes = [];

  for (const doc of DOCS) {
    let bytes;
    let meta = { edicion: "", vigenteDesde: "", url: "" };

    if (local) {
      const archivo = path.join(local, doc.archivo);
      if (!fs.existsSync(archivo)) {
        console.error(`  falta ${archivo}`);
        continue;
      }
      bytes = fs.readFileSync(archivo);
      const sidecar = `${archivo}.meta`;
      if (fs.existsSync(sidecar)) {
        const [edicion, vigenteDesde, url] = fs.readFileSync(sidecar, "utf8").trim().split("\t");
        meta = { edicion, vigenteDesde, url };
      }
    } else {
      const d = documentoDe(html, doc.buscar);
      if (!d) {
        console.error(`  ${doc.buscar} no aparece en el listado ENR`);
        continue;
      }
      meta = d;
      const res = await fetch(d.url, { headers: { "User-Agent": UA, Referer: `${BASE}/aip` } });
      if (!res.ok) {
        console.error(`  ${doc.buscar}: la descarga contestó ${res.status}`);
        continue;
      }
      bytes = Buffer.from(await res.arrayBuffer());
    }

    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    let n = 0;
    for (const [designador, puntos] of secuencias(text)) {
      // Una aerovía puede aparecer en los dos documentos —tramo inferior y superior—:
      // se queda la secuencia más larga, que es la que cubre más ruta.
      if (puntos.length > (rutas.get(designador)?.length ?? 0)) {
        rutas.set(designador, puntos);
        n++;
      }
    }
    fuentes.push([doc.clave, doc.buscar.replace("-", " "), meta.edicion, meta.vigenteDesde, meta.url].join("\t"));
    console.log(`  ${doc.buscar}: ${n} secuencias · edición ${meta.edicion || "?"} ${meta.vigenteDesde || ""}`);
  }

  /* ------------------------------------------------- resolución y validación --- */

  const fixes = new Set(leerTsv("fixes.tsv").map((f) => f[0]));
  const navaids = new Set(leerTsv("navaids.tsv").map((f) => f[0]));

  /** El designador con el que el punto se escribe en una ruta, o `null`. */
  const resolver = (nombre) => {
    const n = nombre.trim().toUpperCase();
    if (/^[A-Z]{5}$/.test(n)) return fixes.has(n) ? n : null;
    // "EZEIZA VOR/DME EZE", "NDB GES": el ident es el último token.
    const ultimo = n.split(/\s+/).pop() ?? "";
    return navaids.has(ultimo) ? ultimo : null;
  };

  // Lo que ENR 4.4 declara: qué puntos dicen pertenecer a cada aerovía.
  const pertenencia = new Map();
  for (const [designador, , , listaRutas] of leerTsv("fixes.tsv")) {
    for (const tok of (listaRutas ?? "").split("-")) {
      const a = tok.trim();
      if (!/^U?[A-Z]\d{1,3}[A-Z]?$/.test(a)) continue;
      if (!pertenencia.has(a)) pertenencia.set(a, new Set());
      pertenencia.get(a).add(designador);
    }
  }

  const salida = [];
  let sinResolver = 0;
  let incompletas = 0;
  let cortas = 0;

  for (const [designador, nombres] of [...rutas].sort()) {
    if (nombres.length < 2) {
      cortas++;
      continue;
    }

    const puntos = nombres.map(resolver);
    if (puntos.some((p) => p === null)) {
      sinResolver++;
      continue;
    }

    // Consecutivos repetidos: el mismo punto puede quedar dos veces cuando la tabla se
    // corta entre páginas y el AIP lo repite para continuar.
    const limpios = puntos.filter((p, i) => p !== puntos[i - 1]);

    const declarados = pertenencia.get(designador);
    if (declarados) {
      const enSecuencia = new Set(limpios);
      const faltan = [...declarados].filter((f) => !enSecuencia.has(f));
      if (faltan.length) {
        incompletas++;
        continue;
      }
    }

    salida.push([designador, limpios.join(",")].join("\t"));
  }

  fs.writeFileSync(SALIDA, salida.join("\n") + "\n");

  // `aip-fuentes.tsv` la escriben varios generadores: se fusiona, nunca se pisa.
  const mias = new Set(DOCS.map((d) => d.clave));
  const previas = fs.existsSync(FUENTES)
    ? fs.readFileSync(FUENTES, "utf8").split("\n").filter((l) => l.trim() && !mias.has(l.split("\t")[0]))
    : [];
  fs.writeFileSync(FUENTES, [...previas, ...fuentes].sort().join("\n") + "\n");

  console.log(`\naerovias.tsv: ${salida.length} aerovías publicadas.`);
  console.log(`  descartadas por punto que no resuelve: ${sinResolver}`);
  console.log(`  descartadas por secuencia incompleta contra ENR 4.4: ${incompletas}`);
  if (cortas) console.log(`  descartadas por tener menos de dos puntos: ${cortas}`);
  console.log(`  Columnas: aerovia puntos(separados por coma, en orden)`);
}

main();
