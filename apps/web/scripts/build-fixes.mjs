#!/usr/bin/env node
/**
 * Genera src/data/fixes.tsv con los **puntos significativos** del AIP argentino.
 *
 *   npm run build:fixes
 *   npm run build:fixes -- /ruta/a/enr44.pdf   (usa un PDF ya bajado)
 *
 * ## Qué son
 *
 * Los `AKNEL`, `DORVO`, `PIMBO` de cinco letras que arman las aerovías y los
 * procedimientos de llegada y salida. Son los puntos que canta el control y los que
 * aparecen escritos en un plan de vuelo — hasta ahora, en Vector no existían: una ruta
 * sólo podía apoyarse en aeródromos.
 *
 * ## De dónde salen, y por qué recién ahora
 *
 * De **ENR 4.4 del AIP**, "Designadores o nombres en clave para los puntos
 * significativos". La primera búsqueda fue por el lado de OurAirports, que publica
 * `navaids.csv` pero **no** tiene `fixes.csv`, `waypoints.csv` ni `airways.csv` —los tres
 * dan 404—. No hay fuente abierta: los puntos de aerovía argentinos viven en este PDF, y
 * se llegó a él con la misma infraestructura que corrigió las frecuencias.
 *
 * ## Ninguno se pisa con nada
 *
 * Los designadores son **exactamente cinco letras** y son 1018, todos distintos. Los
 * códigos de aeródromo tienen tres o cuatro caracteres y los idents de radioayuda, tres
 * como máximo. O sea que un token de cinco letras en una ruta **no puede ser otra cosa
 * que un fix**, y la resolución no tiene que elegir entre candidatos. Es la misma
 * propiedad que hizo aceptables a los VOR y que dejó afuera a los NDB de ident repetido.
 *
 * ## El ciclo AIRAC
 *
 * Igual que el resto del AIP, esto se enmienda cada 28 días. La edición y la fecha de
 * vigencia van a `aip-fuentes.tsv` con la clave `ENR4.4` y **se muestran en pantalla**.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const BASE = "https://ais.anac.gob.ar";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "fixes.tsv");
const FUENTES = path.join(RAIZ, "src", "data", "aip-fuentes.tsv");
const CLAVE = "ENR4.4";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * La fila de ENR 4.4 en el listado En-Route.
 *
 * Se pide con `X-Requested-With` porque el listado se carga por AJAX y sin esa cabecera
 * el servidor contesta su página de error 404. Mismo detalle que en `build-aip.mjs`.
 */
async function documento() {
  const res = await fetch(`${BASE}/aip/enr`, {
    headers: { "User-Agent": UA, Referer: `${BASE}/aip`, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`El listado ENR contestó ${res.status}`);
  const html = await res.text();

  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    if (!texto.includes("ENR-4.4")) continue;
    const href = /href="([^"]+)"/.exec(fila);
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (href && sello) return { url: BASE + href[1], edicion: sello[1], vigenteDesde: sello[2] };
  }
  return null;
}

/**
 * De grados-minutos-segundos a decimales.
 *
 * El AIP escribe `234756S` y `0605944W`: la latitud con dos dígitos de grado y la
 * longitud con tres, sin separadores. Se redondea a cinco decimales, que son unos 30 cm —
 * de sobra para un punto de aerovía y suficiente para que el archivo no engorde.
 */
function aDecimal(gms, hemisferio, digitosDeGrado) {
  const g = Number(gms.slice(0, digitosDeGrado));
  const m = Number(gms.slice(digitosDeGrado, digitosDeGrado + 2));
  const s = Number(gms.slice(digitosDeGrado + 2, digitosDeGrado + 4));
  const valor = g + m / 60 + s / 3600;
  return Math.round(valor * (hemisferio === "S" || hemisferio === "W" ? -1 : 1) * 1e5) / 1e5;
}

/** Recorta por el último separador que entre, y sin dejarlo colgando. */
function recortar(texto, maximo) {
  if (texto.length <= maximo) return texto.replace(/-+$/, "");
  const corte = texto.lastIndexOf("-", maximo);
  return (corte > 0 ? texto.slice(0, corte) : texto.slice(0, maximo)).replace(/-+$/, "").trim();
}

async function main() {
  const local = process.argv[2];
  let bytes;
  let meta = { edicion: "", vigenteDesde: "", url: "" };

  if (local) {
    console.log(`Leyendo ${local}`);
    bytes = fs.readFileSync(local);
    const sidecar = `${local}.meta`;
    if (fs.existsSync(sidecar)) {
      const [edicion, vigenteDesde, url] = fs.readFileSync(sidecar, "utf8").trim().split("\t");
      meta = { edicion, vigenteDesde, url };
    }
  } else {
    const doc = await documento();
    if (!doc) {
      console.error("ENR 4.4 no aparece en el listado del AIP.");
      process.exit(1);
    }
    meta = doc;
    const res = await fetch(doc.url, { headers: { "User-Agent": UA, Referer: `${BASE}/aip` } });
    if (!res.ok) {
      console.error(`La descarga contestó ${res.status}.`);
      process.exit(1);
    }
    bytes = Buffer.from(await res.arrayBuffer());
  }

  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });

  /*
    `AKNEL 234756S-0605944W UM799`. Se ancla al principio de renglón y se exige la forma
    completa —cinco letras, latitud, longitud— así que los renglones de continuación de
    las observaciones, que envuelven sin designador, se saltean solos. Y también se saltea
    el encabezado que se repite en cada una de las 34 páginas.
  */
  const fila = /^([A-Z]{5})\s+(\d{6})([NS])-(\d{7})([EW])\s*(.*)$/gm;

  const vistos = new Map();
  let repetidos = 0;
  let m;
  while ((m = fila.exec(text)) !== null) {
    const [, designador, lat, ns, lon, ew, observaciones] = m;
    if (vistos.has(designador)) {
      repetidos++;
      continue;
    }
    vistos.set(designador, [
      designador,
      aDecimal(lat, ns, 2).toFixed(5),
      aDecimal(lon, ew, 3).toFixed(5),
      /*
        Las aerovías y procedimientos del punto. Se corta —hay puntos con doce y ninguno de
        esos renglones entra en la pantalla— pero **por separador y no por caracteres**: un
        corte crudo dejaba `…UZ105-SID CBA-STAR CBA-`, con un guión colgando y la última
        aerovía partida al medio, que se lee como un dato incompleto en vez de como una
        lista recortada.
      */
      recortar(observaciones.trim().replace(/\s+/g, " "), 60),
    ].join("\t"));
  }

  const salida = [...vistos.values()].sort();
  fs.writeFileSync(SALIDA, salida.join("\n") + "\n");

  /*
    `aip-fuentes.tsv` es la tabla única de procedencia de todo lo que sale del AIP, y la
    escriben dos generadores: `build-aip.mjs` pone una fila por aeródromo y éste pone la
    de ENR 4.4. Por eso se **fusiona** en vez de sobrescribir; si cualquiera de los dos
    pisara el archivo entero, el otro perdería su fecha de vigencia sin hacer ruido.
  */
  const previas = fs.existsSync(FUENTES)
    ? fs.readFileSync(FUENTES, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith(`${CLAVE}\t`))
    : [];
  previas.push([CLAVE, "ENR 4.4", meta.edicion, meta.vigenteDesde, meta.url].join("\t"));
  previas.sort();
  fs.writeFileSync(FUENTES, previas.join("\n") + "\n");

  console.log(`fixes.tsv: ${salida.length} puntos significativos.`);
  if (repetidos) console.log(`  designadores repetidos descartados: ${repetidos}`);
  console.log(`  ENR 4.4 edición ${meta.edicion || "?"}, vigente desde ${meta.vigenteDesde || "?"}`);
  console.log(`  Columnas: designador lat lon rutas`);
}

main();
