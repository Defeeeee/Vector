/**
 * Genera `src/data/lad.tsv`: los LAD (Lugares Aptos Denunciados) de ANAC, con su número y su
 * nombre, para buscarlos en el plan de vuelo (`lib/lad.ts`, `CampoAerodromo`).
 *
 *   npm run build:lad                 (baja la lista del CAD)
 *   npm run build:lad -- lista.json   (usa una lista ya bajada)
 *
 * ## De dónde
 *
 * La lista pública del CAD de ANAC, la misma que usa para declarar un vuelo desde un LAD:
 * `GetLugarAterrizajeListItem?tipoLugar=LAD` (sin sesión). Cada uno viene como
 * `{ key: "2013", value: " 2013 (VILLA JOSEFINA)" }`: **número y nombre, sin coordenadas**, y
 * MADHEL no los tiene. Por eso el plan pide las coordenadas aparte.
 *
 * Desde la red de Federico no se llega a los servidores de ANAC (se corta la conexión); desde
 * GitHub sí: lo corre el workflow semanal del AIP (`.github/workflows/aip.yml`).
 *
 * Columnas: número, nombre.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "lad.tsv");
const FUENTE = "https://cad.anac.gob.ar/foliadoweb/api/VueloTripulante/GetLugarAterrizajeListItem?tipoLugar=LAD&tipoVuelo=2";

const [local] = process.argv.slice(2);
const lista = local
  ? JSON.parse(fs.readFileSync(local, "utf8"))
  : await (async () => {
      const r = await fetch(FUENTE, { headers: { "User-Agent": "Mozilla/5.0 (Vector)", Accept: "application/json" } });
      if (!r.ok) throw new Error(`El CAD contestó ${r.status}`);
      return r.json();
    })();

if (!Array.isArray(lista) || lista.length < 1000) {
  // Una lista vacía o recortada no pisa la buena: el CAD a veces contesta una página de error.
  throw new Error(`La lista de LAD vino con ${Array.isArray(lista) ? lista.length : "nada"}: no se escribe.`);
}

/** " 2013 (VILLA JOSEFINA)" → "VILLA JOSEFINA". Hay nombres con paréntesis adentro y uno sin cerrar. */
function nombreDe(valor, numero) {
  const sinNumero = String(valor ?? "").trim().replace(new RegExp(`^${numero}\\s*`), "");
  const adentro = sinNumero.startsWith("(") ? sinNumero.slice(1) : sinNumero;
  return (adentro.endsWith(")") ? adentro.slice(0, -1) : adentro).replace(/[\t\n]+/g, " ").replace(/\s+/g, " ").trim();
}

const filas = lista
  .filter((x) => /^\d{1,6}$/.test(String(x?.key ?? "")))
  .map((x) => [String(Number(x.key)), nombreDe(x.value, x.key)])
  .filter(([, nombre]) => nombre)
  .sort((a, b) => Number(a[0]) - Number(b[0]));

fs.writeFileSync(SALIDA, filas.map((f) => f.join("\t")).join("\n") + "\n");
console.log(`lad.tsv: ${filas.length} LAD.`);
