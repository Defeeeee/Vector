import fs from "node:fs";
import path from "node:path";

/**
 * Las aerovías, con sus puntos **en orden**.
 *
 * Sólo servidor: lee del disco. La lógica de expansión no está acá sino en
 * `ruta-planificada.ts`, que es pura y recibe el catálogo — así se testea con tres
 * aerovías inventadas en vez de con las 220 reales, y puede correr en el cliente.
 *
 * ## Qué habilitan
 *
 * Escribir `ALBAL UM424 EZE` en vez de los catorce puntos del medio. Es la convención del
 * plan de vuelo OACI: la aerovía se escribe entre el punto por donde se entra y el punto
 * por donde se sale.
 *
 * ## De dónde salen y qué se descarta
 *
 * De ENR 3.1 (rutas convencionales) y ENR 3.2 (RNAV 5), por `scripts/build-aerovias.mjs`.
 * De las **258 aerovías** que el AIP nombra en ENR 4.4 se publican **220**: las otras 38
 * no pasaron la validación cruzada y **es a propósito que no resuelvan**.
 *
 * La validación es lo único que hace publicable a esto. Un parser de PDF que se saltea una
 * fila no falla: devuelve una aerovía con un punto menos, y expandida da una travesía más
 * corta que la real con pinta de válida. Por eso cada secuencia se contrasta contra el
 * **otro** documento —ENR 4.4 dice, punto por punto, a qué aerovías pertenece— y la que no
 * cierra se descarta entera. Son dos tablas escritas por separado: que coincidan no es
 * comprobar el código contra sí mismo.
 *
 * ## Lo que esto **no** es
 *
 * No es un plan de vuelo. Una aerovía tiene límites verticales, clasificación de espacio
 * aéreo y dirección de niveles de crucero, todo publicado en ENR 3 y **nada de eso está
 * acá**: de la aerovía se usa la geometría, o sea la lista de puntos por los que pasa. La
 * pantalla lo dice, porque un piloto que ve "A305" en una planilla podría suponer que
 * alguien verificó que puede volarla a la altura que cargó.
 */

export interface Aerovia {
  /** `A305`, `W67`, `UM424`. */
  designador: string;
  /** Los puntos en el orden en que los publica el AIP. Fixes e idents de radioayuda. */
  puntos: string[];
}

let indice: Map<string, Aerovia> | null = null;

function cargar(): Map<string, Aerovia> {
  if (indice) return indice;

  const mapa = new Map<string, Aerovia>();
  const archivo = path.join(process.cwd(), "src", "data", "aerovias.tsv");
  if (!fs.existsSync(archivo)) {
    indice = mapa;
    return mapa;
  }

  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    const [designador, puntos] = linea.split("\t");
    const lista = (puntos ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    if (!designador || lista.length < 2) continue;
    mapa.set(designador.toUpperCase(), { designador: designador.toUpperCase(), puntos: lista });
  }

  indice = mapa;
  return mapa;
}

/** Los puntos de esa aerovía en orden, o `null`. Es lo que espera `expandirAerovias`. */
export function puntosDeAerovia(designador: string): string[] | null {
  return cargar().get((designador ?? "").trim().toUpperCase())?.puntos ?? null;
}

/** Todas. Es el mapa vivo del índice: **no lo mutes.** */
export function allAerovias(): Aerovia[] {
  return [...cargar().values()];
}

/**
 * Las aerovías que pasan por un punto.
 *
 * **Es lo que convierte esto en algo elegible en vez de algo que hay que saberse.** La
 * primera versión obligaba a tipear `BCA W67 OSA` sin ninguna forma de averiguar que `W67`
 * pasa por BCA ni que del otro lado está OSA: había que tener la carta al lado, que es
 * justo lo que la pantalla viene a evitar.
 *
 * Ordenadas por designador. Un punto está en pocas —la mediana es dos— así que no hace
 * falta ni paginar ni recortar.
 */
export function aeroviasPorPunto(punto: string): Aerovia[] {
  const p = (punto ?? "").trim().toUpperCase();
  if (!p) return [];
  return allAerovias()
    .filter((a) => a.puntos.includes(p))
    .sort((x, y) => x.designador.localeCompare(y.designador));
}
