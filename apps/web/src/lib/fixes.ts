import fs from "node:fs";
import path from "node:path";

/**
 * Los puntos significativos del AIP — los `AKNEL`, `DORVO`, `PIMBO` de cinco letras.
 *
 * Sólo servidor: lee del disco, igual que `airports.ts` y `radioayudas.ts`.
 *
 * ## Qué agregan
 *
 * Son los puntos que arman las aerovías y los procedimientos de llegada y salida: los que
 * canta el control y los que se escriben en un plan de vuelo. Hasta ahora una ruta en
 * Vector sólo podía apoyarse en aeródromos, después en radioayudas, y ahora en esto.
 *
 * ## Por qué se pueden aceptar sin desambiguar
 *
 * **Los 1018 designadores son de cinco letras y son todos distintos**, y ningún otro
 * catálogo del proyecto usa cinco: los códigos de aeródromo tienen tres o cuatro y los
 * idents de radioayuda, tres como máximo. Un token de cinco letras en una ruta no puede
 * ser otra cosa. Es la misma propiedad que hizo aceptables a los VOR y que dejó afuera a
 * los 62 NDB de ident repetido — ver `scripts/build-navaids.mjs`.
 *
 * ## De dónde salen
 *
 * De ENR 4.4 del AIP, extraído por `scripts/build-fixes.mjs`. **No hay fuente abierta**:
 * OurAirports publica radioayudas pero no `fixes.csv` ni `airways.csv` —los dos dan 404—.
 * Y como todo lo que sale del AIP, esto se enmienda cada 28 días: la edición y la fecha de
 * vigencia están en `aip-fuentes.tsv` y se muestran en pantalla.
 */

export interface Fix {
  /** Cinco letras, como se canta: `DORVO`. */
  designador: string;
  lat: number;
  lon: number;
  /**
   * Las aerovías y procedimientos a los que pertenece: `W67-SID BCA-STAR BCA`. Cortado a
   * 60 caracteres por el generador — hay puntos con doce, y ninguno de esos renglones
   * entra en la pantalla.
   */
  rutas: string;
}

let indice: Map<string, Fix> | null = null;

function cargar(): Map<string, Fix> {
  if (indice) return indice;

  const mapa = new Map<string, Fix>();
  const archivo = path.join(process.cwd(), "src", "data", "fixes.tsv");
  if (!fs.existsSync(archivo)) {
    indice = mapa;
    return mapa;
  }

  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    const [designador, lat, lon, rutas] = linea.split("\t");
    const la = Number.parseFloat(lat);
    const lo = Number.parseFloat(lon);
    if (!designador || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    mapa.set(designador.toUpperCase(), { designador: designador.toUpperCase(), lat: la, lon: lo, rutas: rutas ?? "" });
  }

  indice = mapa;
  return mapa;
}

/** El punto significativo de ese designador, o `null`. */
export function getFix(designador: string): Fix | null {
  return cargar().get((designador ?? "").trim().toUpperCase()) ?? null;
}

/** Todos. Es el mapa vivo del índice: **no lo mutes.** */
export function allFixes(): Fix[] {
  return [...cargar().values()];
}

/**
 * Los que empiezan con ese prefijo, para sugerir mientras se tipea.
 *
 * Desde tres letras y no desde dos: con dos, `DO` devuelve decenas de puntos que no
 * ayudan a elegir, y encima compite con los códigos ANAC de tres letras en la misma
 * lista. Ordenados alfabéticamente porque no hay ninguna otra jerarquía honesta entre
 * ellos — a diferencia de los aeródromos, un fix no es más importante que otro.
 */
export function buscarFixes(prefijo: string, limite = 8): Fix[] {
  const q = (prefijo ?? "").trim().toUpperCase();
  if (q.length < 3 || !/^[A-Z]+$/.test(q)) return [];
  return allFixes()
    .filter((f) => f.designador.startsWith(q))
    .sort((a, b) => a.designador.localeCompare(b.designador))
    .slice(0, limite);
}
