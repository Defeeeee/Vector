import fs from "node:fs";
import path from "node:path";
import type { Radioayuda } from "./puntos";

/**
 * El directorio de radioayudas, leído una vez de `src/data/navaids.tsv`.
 *
 * **Sólo servidor**: toca el disco, igual que `airports.ts`. No lo importes de un
 * componente de cliente.
 *
 * ## Para qué existe, que no es lo que parece
 *
 * La razón obvia sería "poder poner un VOR como punto de la ruta", y esa razón casi no
 * sirve: **77 de los 96 idents ya son código de aeródromo**, porque un VOR se llama como
 * el campo al que sirve. Y no está lejos: la mediana de distancia entre la estación y su
 * aeródromo homónimo es de **0,34 NM**, y el peor caso —Comodoro Rivadavia— son 4 NM.
 * Escribir `BAR` en una ruta ya resolvía Bariloche antes de que este archivo existiera, y
 * seguirá resolviendo el aeródromo: tiene pistas, elevación y METAR, que la estación no.
 *
 * Los idents que **no** son aeródromo son diecinueve, y dieciocho son NDB de una o dos
 * letras que ni siquiera se pueden tipear en un campo de ruta.
 *
 * Lo que este archivo sí habilita, y no había forma de hacer sin él:
 *
 * 1. **El punto por radial y distancia** — `BAR/045/25`. Necesita la posición exacta de
 *    la estación (no la del aeródromo a 1,5 NM) y sobre todo **su variación**, que es
 *    otra cosa que la del aeródromo.
 * 2. **Decir qué sintonizar.** El plan puede mostrar la frecuencia y el tipo de la
 *    estación que define cada punto.
 *
 * ## Los NDB ambiguos no están
 *
 * El generador descarta los 62 NDB con ident repetido: `L` aparece cinco veces, `A` son
 * Ezeiza, Reconquista y Tartagal. Elegir uno por el usuario sería poner un punto a mil
 * kilómetros del que quiso. **Un punto de ruta equivocado y silencioso es peor que uno
 * que no resuelve.**
 */

let indice: Map<string, Radioayuda> | null = null;

function cargar(): Map<string, Radioayuda> {
  if (indice) return indice;

  const mapa = new Map<string, Radioayuda>();
  const archivo = path.join(process.cwd(), "src", "data", "navaids.tsv");
  if (!fs.existsSync(archivo)) {
    indice = mapa;
    return mapa;
  }

  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    const [ident, tipo, nombre, lat, lon, khz, variacionW, origen] = linea.split("\t");
    const la = Number.parseFloat(lat);
    const lo = Number.parseFloat(lon);
    if (!ident || !Number.isFinite(la) || !Number.isFinite(lo)) continue;

    const f = Number.parseFloat(khz);
    const v = Number.parseFloat(variacionW);
    mapa.set(ident.toUpperCase(), {
      ident: ident.toUpperCase(),
      tipo: tipo || "",
      nombre: nombre || "",
      lat: la,
      lon: lo,
      khz: Number.isFinite(f) ? f : undefined,
      // `undefined` y no cero: cero es una variación perfectamente válida —Bahía Blanca
      // la tiene— y confundirlos haría que un dato faltante se viera como una estación
      // sobre la línea agónica. `puntoPorRadial` se apoya en esta distinción.
      variacionW: Number.isFinite(v) ? v : undefined,
      origenVariacion: origen || undefined,
    });
  }

  indice = mapa;
  return mapa;
}

/** La radioayuda de ese ident, o `null`. El ident se normaliza a mayúsculas. */
export function getRadioayuda(ident: string): Radioayuda | null {
  return cargar().get((ident ?? "").trim().toUpperCase()) ?? null;
}

/** Todas, para búsquedas. Es el mapa vivo del índice: **no lo mutes.** */
export function allRadioayudas(): Radioayuda[] {
  return [...cargar().values()];
}
