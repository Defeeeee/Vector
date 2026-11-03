import fs from "node:fs";
import path from "node:path";
import { fetchAnac } from "./anac";
import { carpetaDeDatos } from "./madhel-descargado";

/**
 * **Los NOTAM de todo el país, descargados**: la fuente principal mientras estén al día
 * (Federico, 2026-11-03). Sólo servidor.
 *
 * ANAC da los NOTAM vigentes de todo el país —aeroclubes incluidos— en un solo pedido
 * (`POST /notam/json` con el indicador vacío; lo encontró la sonda del 2026-11-03). Cada
 * 15 minutos, `.github/workflows/notam.yml` mira la "Última actualización" de la página de
 * NOTAM y, si cambió, trae todo y lo deja en el VPS:
 *
 * - `notams-anac.json`: `{ actualizacion, descargado, notams: [...] }`, la respuesta de ANAC
 *   tal cual (`ad`, `indicador`, `notam`, `desde`, `hasta`, `novedad`);
 * - `notams-anac.verificado`: cuándo se miró por última vez (ISO), cambie o no.
 *
 * **Al día** es que se verificó hace menos de `VIGENCIA_MIN`. Mientras lo esté, un aeródromo
 * que no aparece **no tiene NOTAM**: la lista es la del país entero, así que acá `[]` sí es
 * "no hay" (invariante 2). Si se atrasó, se vuelve a preguntarle a ANAC como antes.
 */
export const VIGENCIA_MIN = 45;

/** Cómo se presenta Vector ante ANAC desde el servidor: como lo que es, sin imitar un navegador. */
export const USER_AGENT_VECTOR = "Vector/1.0 (bitacora de vuelo; https://vector.fdiaznem.com.ar)";

export interface NotamsDelPais {
  /** La "Última actualización" de ANAC, tal cual la escribe ("02 Nov 2026 21:33", hora argentina). */
  actualizacion: string;
  /** Cuándo se verificó por última vez (ISO). */
  verificado: string;
  items: Record<string, unknown>[];
}

const carpeta = carpetaDeDatos;

let memo: { mtimeMs: number; actualizacion: string; items: Record<string, unknown>[] } | null = null;

/** ¿Se verificó hace menos de `VIGENCIA_MIN`? */
export function alDia(verificado: string | null, ahora: Date): boolean {
  const t = verificado ? Date.parse(verificado) : NaN;
  return !Number.isNaN(t) && ahora.getTime() - t <= VIGENCIA_MIN * 60000 && t <= ahora.getTime() + 60000;
}

/** Los NOTAM del país si están al día, o `null`. Nunca tira. */
export function notamsDelPais(ahora = new Date()): NotamsDelPais | null {
  try {
    const dir = carpeta();
    const verificado = fs.readFileSync(path.join(dir, "notams-anac.verificado"), "utf8").trim();
    if (!alDia(verificado, ahora)) return null;
    const archivo = path.join(dir, "notams-anac.json");
    const { mtimeMs } = fs.statSync(archivo);
    if (!memo || memo.mtimeMs !== mtimeMs) {
      const datos = JSON.parse(fs.readFileSync(archivo, "utf8"));
      if (!Array.isArray(datos?.notams)) return null;
      memo = { mtimeMs, actualizacion: String(datos.actualizacion ?? ""), items: datos.notams };
    }
    return { actualizacion: memo.actualizacion, verificado, items: memo.items };
  } catch {
    return null;
  }
}

/** Los de un aeródromo (designador ANAC: "FDO", "ELD"), de la lista del país. */
export function deIndicador(items: Record<string, unknown>[], indicador: string): Record<string, unknown>[] {
  const buscado = indicador.trim().toUpperCase();
  return items.filter((n) => String(n.indicador ?? "").trim().toUpperCase() === buscado);
}

export interface NotamsCrudos {
  /** La respuesta de ANAC para ese aeródromo, tal cual, o `null` si no se pudo preguntar. */
  items: Record<string, unknown>[] | null;
  fuente: "descarga" | "anac" | null;
  /** La "Última actualización" de ANAC, si vino de la descarga. */
  actualizacion: string | null;
  /** Cuándo se obtuvo (ISO). */
  capturadoEn: string | null;
}

/**
 * Los NOTAM de un aeródromo para lo que corre en el servidor (el copiloto, WhatsApp, el mail
 * del briefing, la meteo del plan): **de la descarga si está al día**, y si no, preguntándole a
 * ANAC (`fetchAnac`, que casi siempre falla porque ANAC bloquea al VPS).
 */
export async function notamsCrudos(indicador: string, revalidate = 300): Promise<NotamsCrudos> {
  const pais = notamsDelPais();
  if (pais) {
    return { items: deIndicador(pais.items, indicador), fuente: "descarga", actualizacion: pais.actualizacion, capturadoEn: pais.verificado };
  }
  try {
    const res = await fetchAnac("https://ais.anac.gob.ar/notam/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": USER_AGENT_VECTOR,
      },
      body: `indicador=${encodeURIComponent(indicador)}`,
      next: { revalidate },
    });
    const json = res.ok ? await res.json() : null;
    return Array.isArray(json)
      ? { items: json, fuente: "anac", actualizacion: null, capturadoEn: new Date().toISOString() }
      : { items: null, fuente: null, actualizacion: null, capturadoEn: null };
  } catch {
    return { items: null, fuente: null, actualizacion: null, capturadoEn: null };
  }
}
