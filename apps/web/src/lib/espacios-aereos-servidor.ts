import fs from "node:fs";
import path from "node:path";
import { getAirport } from "./airports";
import { datosAip } from "./aip";
import { allRadioayudas } from "./radioayudas";
import { armarEspacios, filasTma, type EspacioAereo, type EspacioDescartado, type Frecuencias } from "./espacios-aereos";
import { armarFirs, frecuenciasDeFila, type Fir } from "./firs";
import type { Punto } from "./navegacion";

/**
 * Los espacios aéreos y las FIR armados desde el texto del AIP commiteado
 * (`lib/espacios-aereos.ts`, `lib/firs.ts`), con quién se habla en cada uno. Sólo servidor. Se
 * arman una vez por proceso: el texto cambia con un deploy, nunca en caliente.
 */
const DATOS = path.join(process.cwd(), "src", "data");
const CARPETA = path.join(DATOS, "aip");

interface Todo {
  espacios: EspacioAereo[];
  descartados: EspacioDescartado[];
  firs: Fir[];
  firsDescartadas: { nombre: string; motivo: string }[];
}
let memo: Todo | null = null;

/**
 * La torre de una CTR o ATZ, de AD 2.18 de su aeródromo: en una ATZ la TWR, en una CTR la APP
 * si la tiene (y si no, la TWR). `null` si el AIP no la da.
 */
export function torreDe(icao: string, tipo: EspacioAereo["tipo"]): Frecuencias | null {
  const frecuencias = datosAip(icao)?.frecuencias ?? [];
  const de = (re: RegExp) => frecuencias.filter((f) => re.test(f.servicio));
  const elegidas = (tipo === "CTR" && de(/\bAPP\b/).length ? de(/\bAPP\b/) : de(/\bTWR\b/)).filter((f) => Number(f.mhz) !== 121.5);
  if (!elegidas.length) return null;
  return {
    distintivo: (elegidas[0].distintivo.split("/")[0] || `${icao} ${tipo === "CTR" ? "APP" : "TWR"}`).trim(),
    sectores: [{ nombre: null, mhz: [...new Set(elegidas.map((f) => f.mhz))] }],
  };
}

function frontera(): Punto[][] {
  const archivo = path.join(DATOS, "frontera-chile.tsv");
  if (!fs.existsSync(archivo)) return [];
  return fs
    .readFileSync(archivo, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) =>
      l.split(" ").map((x) => {
        const [lat, lon] = x.split(",").map(Number);
        return { lat, lon };
      })
    );
}

export function espaciosAereos(): Todo {
  if (memo) return memo;
  const ad217 = fs
    .readdirSync(CARPETA)
    .filter((f) => /^SA[A-Z]{2}\.txt$/.test(f))
    .sort()
    .map((f) => {
      const icao = f.slice(0, 4);
      const texto = fs.readFileSync(path.join(CARPETA, f), "utf8");
      const i = texto.indexOf("AD 2.17 ESPACIO");
      const j = texto.indexOf("AD 2.18", i);
      const ad = getAirport(icao);
      return {
        icao,
        bloque: i < 0 ? "" : texto.slice(i, j > i ? j : undefined),
        arp: ad?.lat !== undefined && ad?.lon !== undefined ? { lat: ad.lat, lon: ad.lon } : null,
      };
    })
    .filter((x) => x.bloque);
  const archivoEnr = path.join(CARPETA, "ENR-2.1.txt");
  const enr21 = fs.existsSync(archivoEnr) ? fs.readFileSync(archivoEnr, "utf8") : "";
  const radioayudas = new Map(allRadioayudas().map((r) => [r.ident, { lat: r.lat, lon: r.lon }]));
  const { espacios, descartados } = armarEspacios({ ad217, enr21, radioayudas });

  // Con quién se habla en cada uno.
  const filas = new Map(filasTma(enr21).map((f) => [f.split("\n")[0].trim(), f]));
  for (const e of espacios) {
    if (e.tipo === "TMA") {
      const fila = filas.get(e.nombre.replace(/\s+\(I+\)$/, ""));
      e.dependencia = fila ? frecuenciasDeFila(fila) : null;
    } else {
      e.dependencia = torreDe(e.fuente.slice(0, 4), e.tipo);
    }
  }

  const { firs, descartadas } = armarFirs(enr21, radioayudas, frontera());
  memo = { espacios, descartados, firs, firsDescartadas: descartadas };
  return memo;
}
