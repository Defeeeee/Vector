/**
 * Genera `src/data/madhel-fichas.tsv`: de la ficha de MADHEL de cada aeródromo, lo que los
 * filtros de Aeropuertos necesitan y el resto del directorio no trae: **las pistas** (largo
 * y superficie, como texto: "17/35 1400x21 M – Tierra.") y **el combustible**.
 *
 *   npm run build:madhel                (baja las fichas de ANAC)
 *   npm run build:madhel -- carpeta/    (usa fichas ya bajadas: carpeta/<DESIGNADOR>.json)
 *
 * ## Despacio, y sin disfrazarse
 *
 * ANAC bloquea las IPs que le hacen muchos pedidos (el VPS, DefeServer y oraclex64 están
 * bloqueadas). Esto lo corre GitHub Actions una vez por mes (`.github/workflows/madhel.yml`),
 * como el AIP, y:
 *
 * - pide **de a uno, con 2 s entre pedidos** (~550 aeródromos, unos 20 minutos);
 * - se presenta como lo que es (`User-Agent: Vector …`), sin imitar un navegador;
 * - **se detiene** después de 5 fallas seguidas, y no escribe nada si contestó menos del
 *   80 %: una corrida mala no pisa los datos buenos, y si ANAC no quiere, no se insiste.
 *
 * Columnas: designador ANAC, combustible, pistas (separadas por " | "), actualizada (de MADHEL).
 * Sólo aeródromos (no helipuertos) que MADHEL no da por cerrados.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "madhel-fichas.tsv");
const MADHEL_TSV = path.join(RAIZ, "src", "data", "madhel.tsv");
const URL_FICHA = (d) => `https://datos.anac.gob.ar/madhel/api/v2/airports/${encodeURIComponent(d)}/`;
const USER_AGENT = "Vector/1.0 (bitacora de vuelo; https://vector.fdiaznem.com.ar; actualizacion mensual)";

const PAUSA_MS = 2000;
const ESPERA_MS = 15000;
const MAX_FALLAS_SEGUIDAS = 5;
const MINIMO_RESPONDIDO = 0.8;

const designadores = fs
  .readFileSync(MADHEL_TSV, "utf8")
  .split("\n")
  .map((l) => l.split("\t"))
  .filter((c) => c[0] && c[6] === "AD" && c[9] !== "CERRADO")
  .map((c) => c[0]);

const [carpeta] = process.argv.slice(2);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpio = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();

async function ficha(designador) {
  if (carpeta) {
    const archivo = path.join(carpeta, `${designador}.json`);
    return fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, "utf8")) : null;
  }
  const res = await fetch(URL_FICHA(designador), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (res.status === 404) return { ausente: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const filas = [];
let respondidos = 0;
let fallasSeguidas = 0;

for (const [i, designador] of designadores.entries()) {
  try {
    const j = await ficha(designador);
    fallasSeguidas = 0;
    if (j) respondidos++;
    if (j?.data) {
      const pistas = (Array.isArray(j.data.rwy) ? j.data.rwy : []).map(limpio).filter(Boolean);
      filas.push([designador, limpio(j.data.fuel), pistas.join(" | "), limpio(j.updated_at).slice(0, 10)]);
    }
  } catch (err) {
    fallasSeguidas++;
    console.warn(`${designador}: ${err.message}`);
    if (fallasSeguidas >= MAX_FALLAS_SEGUIDAS) {
      console.error(`ANAC no contesta (${MAX_FALLAS_SEGUIDAS} fallas seguidas): se corta sin escribir.`);
      process.exit(1);
    }
  }
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${designadores.length}`);
  if (!carpeta) await dormir(PAUSA_MS);
}

if (respondidos < designadores.length * MINIMO_RESPONDIDO) {
  console.error(`Contestó ${respondidos} de ${designadores.length}: menos del ${MINIMO_RESPONDIDO * 100} %, no se escribe.`);
  process.exit(1);
}

filas.sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(
  SALIDA,
  "# Las pistas y el combustible de cada aeródromo, de MADHEL (ANAC). Generado por\n" +
    "# scripts/build-madhel-fichas.mjs; NO EDITAR A MANO.\n" +
    "# designador\tcombustible\tpistas\tactualizada\n" +
    filas.map((f) => f.join("\t")).join("\n") +
    "\n",
);
console.log(`${filas.length} fichas (${respondidos} de ${designadores.length} contestaron) → ${path.relative(RAIZ, SALIDA)}`);
