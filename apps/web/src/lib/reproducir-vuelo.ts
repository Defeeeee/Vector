/**
 * Repasar el vuelo (3.40.0): la parte pura de la reproducción. Normaliza las dos fuentes que ya
 * existen —el recorrido ADS-B de un vuelo de la bitácora y el track del GPS que graba el Mapa— en
 * una misma serie de muestras, y contesta "¿dónde estaba el avión, a qué altura, con qué rumbo y
 * qué vario llevaba en el instante t?".
 *
 * Las horas se arman por cuenta (UTC−3 fijo, sin horario de verano), nunca con `toLocaleString`
 * (invariante 1). Puro: el reloj no entra.
 */

import { distanciaNmPrecisa } from "./distance";
import type { RecorridoCompacto } from "./recorrido";
import type { TrackVuelo } from "./track-vuelo";

export interface MuestraVuelo {
  /** Milisegundos desde la época. */
  t: number;
  lat: number;
  lon: number;
  altFt: number | null;
  gsKt: number | null;
}

export interface SerieVuelo {
  muestras: MuestraVuelo[];
  fuente: "adsb" | "gps";
  /** De dónde salió el ADS-B ("adsb.fi", "adsb.lol"), para la atribución. */
  proveedor?: string;
}

/** Un corte más largo que esto es "sin señal". El ADS-B manda una posición cada ~10 s. */
export const SIN_SENAL_ADSB_MS = 60_000;
/** El track del GPS ralea a una por minuto con el teléfono quieto: ahí no es un corte. */
export const SIN_SENAL_GPS_MS = 120_000;

const umbralSinSenal = (s: SerieVuelo) => (s.fuente === "gps" ? SIN_SENAL_GPS_MS : SIN_SENAL_ADSB_MS);

/** Debajo de esto el avión "está quieto" y el rumbo no se calcula: se conserva el último. */
const MIN_MOVIDO_M = 30;
const MIN_VELOCIDAD_KT = 15;
const VENTANA_VARIO_MS = 25_000;

function limpiar(crudas: { t: number; lat: number; lon: number; altFt: number | null; gsKt: number | null }[]): MuestraVuelo[] {
  const salida: MuestraVuelo[] = [];
  const orden = crudas
    .filter((m) => Number.isFinite(m.t) && Number.isFinite(m.lat) && Number.isFinite(m.lon) && Math.abs(m.lat) <= 90 && Math.abs(m.lon) <= 180)
    .sort((a, b) => a.t - b.t);
  for (const m of orden) {
    const ultima = salida[salida.length - 1];
    if (ultima && m.t <= ultima.t) continue;
    salida.push({
      t: m.t,
      lat: m.lat,
      lon: m.lon,
      altFt: m.altFt !== null && Number.isFinite(m.altFt) ? m.altFt : null,
      gsKt: m.gsKt !== null && Number.isFinite(m.gsKt) ? m.gsKt : null,
    });
  }
  return salida;
}

export function desdeRecorrido(r: RecorridoCompacto): SerieVuelo {
  const crudas = (r.p ?? []).map((p) => ({
    t: (r.t0 + p[0]) * 1000,
    lat: p[1],
    lon: p[2],
    altFt: p[3] ?? null,
    gsKt: p[4] ?? null,
  }));
  return { muestras: limpiar(crudas), fuente: "adsb", proveedor: r.fuente || undefined };
}

export function desdeTrack(track: TrackVuelo): SerieVuelo {
  const crudas = (track.puntos ?? []).map((p) => ({ t: p[0], lat: p[1], lon: p[2], altFt: p[3] ?? null, gsKt: p[4] ?? null }));
  return { muestras: limpiar(crudas), fuente: "gps" };
}

const metros = (a: MuestraVuelo, b: MuestraVuelo) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon) * 1852;

/**
 * ¿Hay un vuelo para repasar? Al menos dos muestras a 200 m o más de la primera: un track de un
 * avión que nunca se movió (o de una prueba en el escritorio) no se ofrece.
 */
export function hayMovimiento(serie: SerieVuelo): boolean {
  const m = serie.muestras;
  if (m.length < 2) return false;
  let lejos = 0;
  for (let i = 1; i < m.length; i++) if (metros(m[0], m[i]) >= 200) lejos++;
  return lejos >= 2;
}

/** Rumbo verdadero (0–360) de a hacia b. */
export function rumboEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dl = (b.lon - a.lon) * r;
  const y = Math.sin(dl) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dl);
  return (((Math.atan2(y, x) / r) % 360) + 360) % 360;
}

const cacheRumbos = new WeakMap<SerieVuelo, number[]>();

/**
 * El rumbo de cada tramo i → i+1. Si el avión casi no se movió en el tramo (menos de 30 m, o menos
 * de 15 kt contando la distancia sobre el tiempo), hereda el del último tramo que sí: así es
 * determinístico y el avión no gira al azar en la plataforma. Los primeros tramos quietos toman el
 * del primero que se movió.
 */
function rumbosPorTramo(serie: SerieVuelo): number[] {
  const hecho = cacheRumbos.get(serie);
  if (hecho) return hecho;
  const m = serie.muestras;
  const crudos: (number | null)[] = [];
  for (let i = 0; i < m.length - 1; i++) {
    const d = metros(m[i], m[i + 1]);
    const horas = (m[i + 1].t - m[i].t) / 3_600_000;
    const kt = horas > 0 ? d / 1852 / horas : 0;
    crudos.push(d >= MIN_MOVIDO_M && kt >= MIN_VELOCIDAD_KT ? rumboEntre(m[i], m[i + 1]) : null);
  }
  const primero = crudos.find((r) => r !== null) ?? 0;
  let ultimo = primero;
  const rumbos = crudos.map((r) => {
    if (r !== null) ultimo = r;
    return ultimo;
  });
  cacheRumbos.set(serie, rumbos);
  return rumbos;
}

export interface EstadoVuelo {
  /** El instante, ya acotado a [inicio, fin]. */
  t: number;
  lat: number;
  lon: number;
  altFt: number | null;
  gsKt: number | null;
  /** Verdadero, 0–360. */
  rumbo: number;
  /** Pies por minuto, suavizado en ±25 s. */
  varioFtMin: number | null;
  sinSenal: boolean;
  /** La muestra anterior (o igual) a t: lo ya volado va hasta ahí. */
  indice: number;
}

export const inicioDe = (s: SerieVuelo) => s.muestras[0]?.t ?? 0;
export const finDe = (s: SerieVuelo) => s.muestras[s.muestras.length - 1]?.t ?? 0;

/** Índice de la última muestra con t <= pedido (búsqueda binaria). */
function indiceEn(m: MuestraVuelo[], t: number): number {
  let lo = 0;
  let hi = m.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function entre(a: number | null, b: number | null, k: number): number | null {
  if (a !== null && b !== null) return a + (b - a) * k;
  return a ?? b;
}

/** Altura interpolada, sin armar el estado entero. */
function alturaEn(serie: SerieVuelo, t: number): number | null {
  const m = serie.muestras;
  const i = indiceEn(m, t);
  const a = m[i];
  const b = m[i + 1];
  if (!b) return a.altFt;
  return entre(a.altFt, b.altFt, (t - a.t) / (b.t - a.t));
}

/**
 * Todo lo que se lee del avión en el instante `t`. La serie tiene que tener al menos una muestra.
 */
export function estadoEn(serie: SerieVuelo, tPedido: number): EstadoVuelo {
  const m = serie.muestras;
  const t0 = inicioDe(serie);
  const t1 = finDe(serie);
  const t = Math.max(t0, Math.min(t1, Number.isFinite(tPedido) ? tPedido : t0));
  const i = indiceEn(m, t);
  const a = m[i];
  const b = m[i + 1];
  const rumbos = rumbosPorTramo(serie);
  if (!b) {
    return { t, lat: a.lat, lon: a.lon, altFt: a.altFt, gsKt: a.gsKt, rumbo: rumbos[Math.max(0, i - 1)] ?? 0, varioFtMin: null, sinSenal: false, indice: i };
  }
  const k = (t - a.t) / (b.t - a.t);
  const sinSenal = b.t - a.t > umbralSinSenal(serie);
  let vario: number | null = null;
  if (!sinSenal) {
    const ta = Math.max(t0, t - VENTANA_VARIO_MS);
    const tb = Math.min(t1, t + VENTANA_VARIO_MS);
    const alta = alturaEn(serie, ta);
    const altb = alturaEn(serie, tb);
    // Si la ventana cruza un corte, la diferencia de altura no es un vario.
    const ia = indiceEn(m, ta);
    const ib = indiceEn(m, tb);
    let cruza = false;
    for (let j = ia; j <= Math.min(ib, m.length - 2); j++) if (m[j + 1].t - m[j].t > umbralSinSenal(serie)) cruza = true;
    if (alta !== null && altb !== null && tb - ta >= 10_000 && !cruza) vario = ((altb - alta) / (tb - ta)) * 60_000;
  }
  return {
    t,
    lat: a.lat + (b.lat - a.lat) * k,
    lon: a.lon + (b.lon - a.lon) * k,
    altFt: entre(a.altFt, b.altFt, k),
    gsKt: entre(a.gsKt, b.gsKt, k),
    rumbo: rumbos[i] ?? 0,
    varioFtMin: vario,
    sinSenal,
    indice: i,
  };
}

/** Los cortes de señal de la serie, como intervalos [desde, hasta] en ms. */
export function huecosSinSenal(serie: SerieVuelo): [number, number][] {
  const m = serie.muestras;
  const umbral = umbralSinSenal(serie);
  const huecos: [number, number][] = [];
  for (let i = 0; i < m.length - 1; i++) if (m[i + 1].t - m[i].t > umbral) huecos.push([m[i].t, m[i + 1].t]);
  return huecos;
}

export interface PerfilDeAltura {
  t0: number;
  t1: number;
  /** [t, altura, GS], con null donde no hay dato o el instante cae en un corte. */
  puntos: [number, number | null, number | null][];
  altMax: number | null;
  gsMax: number | null;
  huecos: [number, number][];
}

/**
 * La serie raleada para el gráfico. Los máximos salen de las muestras, no de la versión raleada:
 * un pico corto no se pierde.
 */
export function perfilDeAltura(serie: SerieVuelo, n = 300): PerfilDeAltura {
  const m = serie.muestras;
  const t0 = inicioDe(serie);
  const t1 = finDe(serie);
  const huecos = huecosSinSenal(serie);
  let altMax: number | null = null;
  let gsMax: number | null = null;
  for (const x of m) {
    if (x.altFt !== null && (altMax === null || x.altFt > altMax)) altMax = x.altFt;
    if (x.gsKt !== null && (gsMax === null || x.gsKt > gsMax)) gsMax = x.gsKt;
  }
  const puntos: [number, number | null, number | null][] = [];
  if (m.length === 0) return { t0, t1, puntos, altMax, gsMax, huecos };
  const cuantos = Math.max(2, Math.min(n, 2000));
  for (let k = 0; k < cuantos; k++) {
    const t = t0 + ((t1 - t0) * k) / (cuantos - 1);
    const e = estadoEn(serie, t);
    const enHueco = huecos.some(([a, b]) => t > a && t < b);
    puntos.push([t, enHueco ? null : e.altFt, enHueco ? null : e.gsKt]);
  }
  return { t0, t1, puntos, altMax, gsMax, huecos };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** "16:27" en hora argentina (UTC−3 fijo), por cuenta. */
export function hhmmArgentina(ms: number): string {
  const d = new Date(ms - 3 * 3_600_000);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** "16:27:05" en hora argentina. */
export function hhmmssArgentina(ms: number): string {
  const d = new Date(ms - 3 * 3_600_000);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
}

/** "0:42:10": lo que pasó desde el principio. */
export function transcurrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "12 de marzo", con el día argentino del instante. */
export function diaMesArgentina(ms: number): string {
  const d = new Date(ms - 3 * 3_600_000);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
