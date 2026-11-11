/**
 * El METAR del destino para la página pública `/seguir/[token]`.
 *
 * Sale de aviationweather.gov (el mismo origen que `/api/weather`), **nunca de ANAC**. Es pública,
 * así que acá se cuida qué se puede pedir: sólo el destino de *ese* seguimiento (el último punto de
 * su ruta) y sólo si es un aeródromo del directorio (`getAirport`), nunca un código cualquiera.
 * Si el aeródromo no publica METAR, se usa la estación más cercana (de `METAR_STATIONS`) y se dice cuál
 * es y a cuánto está: no se hace pasar por el METAR del destino.
 */

import { getAirport } from "@/lib/airports";
import { distanceNm } from "@/lib/distance";
import { METAR_STATIONS } from "@/lib/estaciones-meteo";

const BASE = process.env.AVIATIONWEATHER_METAR_URL || "https://aviationweather.gov/api/data/metar";
const AGENTE = "Vector-Flight-Log-App";
/** Cuánto se reusa un METAR (los METAR salen cada 30–60 min). */
export const CACHE_CLIMA_S = 300;

export interface ClimaDestino {
  /** El aeródromo de destino (el pedido). */
  destino: string;
  nombreDestino: string | null;
  /** La estación del METAR: el mismo destino, o la más cercana si no publica. */
  estacion: string;
  /** Sólo si la estación no es el destino. */
  distanciaNm: number | null;
  crudo: string;
  /** ISO, de cuándo se observó. */
  observadoEn: string | null;
  /** VFR, MVFR, IFR o LIFR según el servicio, si lo informa. */
  categoria: string | null;
}

/** El último punto de la ruta como aeródromo del directorio, o `null` si no es uno. */
export function destinoDeLaRuta(puntos: unknown): { icao: string; nombre: string | null; lat: number; lon: number } | null {
  if (!Array.isArray(puntos) || puntos.length === 0) return null;
  const ultimo = puntos[puntos.length - 1];
  const codigo = Array.isArray(ultimo) && typeof ultimo[2] === "string" ? ultimo[2].trim().toUpperCase() : "";
  if (!/^[A-Z]{4}$/.test(codigo)) return null;
  const a = getAirport(codigo);
  if (!a || a.lat === undefined || a.lon === undefined) return null;
  return { icao: codigo, nombre: a.name ?? null, lat: a.lat, lon: a.lon };
}

interface FilaMetar {
  icaoId?: string;
  rawOb?: string;
  rawText?: string;
  reportTime?: string;
  obsTime?: number;
  fltCat?: string;
}

/** "METAR SAAV 112100Z …" -> "SAAV 112100Z …". */
export function limpiarCrudo(t: string): string {
  return t.replace(/^(METAR|SPECI)\s+/, "").trim();
}

function horaDe(f: FilaMetar): string | null {
  if (typeof f.reportTime === "string" && f.reportTime) return f.reportTime;
  if (typeof f.obsTime === "number" && f.obsTime > 0) return new Date(f.obsTime * 1000).toISOString();
  return null;
}

/** De las filas del servicio, la primera estación candidata (en orden de preferencia) que tenga METAR. */
export function elegirMetar(filas: unknown, candidatas: string[]): { icao: string; crudo: string; observadoEn: string | null; categoria: string | null } | null {
  if (!Array.isArray(filas)) return null;
  for (const c of candidatas) {
    const f = (filas as FilaMetar[]).find((x) => x && x.icaoId === c);
    const crudo = f ? limpiarCrudo(f.rawOb || f.rawText || "") : "";
    if (f && crudo) return { icao: c, crudo, observadoEn: horaDe(f), categoria: f.fltCat ?? null };
  }
  return null;
}

async function pedir(ids: string[]): Promise<unknown> {
  const res = await fetch(`${BASE}?ids=${ids.join(",")}&format=json`, {
    headers: { "User-Agent": AGENTE },
    next: { revalidate: CACHE_CLIMA_S },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const texto = await res.text();
  if (!texto.trim()) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** El clima del destino, o `null` si no hay (destino que no es un aeródromo, sin METAR cerca, o el servicio no contesta). */
export async function climaDelDestino(puntos: unknown): Promise<ClimaDestino | null> {
  const d = destinoDeLaRuta(puntos);
  if (!d) return null;
  try {
    let m = elegirMetar(await pedir([d.icao]), [d.icao]);
    let distanciaNm: number | null = null;
    if (!m) {
      const cercanas = METAR_STATIONS.map((s) => ({ ...s, dist: distanceNm(d.lat, d.lon, s.lat, s.lon) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4);
      m = elegirMetar(await pedir(cercanas.map((s) => s.icao)), cercanas.map((s) => s.icao));
      if (m) distanciaNm = cercanas.find((s) => s.icao === m!.icao)?.dist ?? null;
    }
    if (!m) return null;
    return { destino: d.icao, nombreDestino: d.nombre, estacion: m.icao, distanciaNm, crudo: m.crudo, observadoEn: m.observadoEn, categoria: m.categoria };
  } catch {
    return null;
  }
}
