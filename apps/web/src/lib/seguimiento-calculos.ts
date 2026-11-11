/**
 * Lo que la página pública `/seguir/[token]` calcula con lo que el backend le da (`SeguimientoPublico`):
 * distancias, avance sobre la ruta, llegada estimada, velocidad vertical y estado a mostrar.
 *
 * Todo puro y testeado. Reglas de la casa:
 * - **Horas en el server o a mano** (invariante 1): la hora argentina se arma con aritmética
 *   (UTC−3, sin horario de verano) y `getUTC*`, nunca con `toLocaleString`.
 * - **"No sé" no es "no hay"** (invariante 2): sin ruta, con poca velocidad o con datos viejos no se
 *   estima la llegada; sin altura suficiente no se dice si sube o baja.
 * - La altura es la del GPS del teléfono (no la barométrica): se dice "Altura GPS" y es una guía.
 */

import { distanciaNmPrecisa } from "@/lib/distance";
import type { PuntoPublico, PuntoRecorrido, SeguimientoPublico } from "@/lib/seguimiento";

/** Debajo de esta velocidad sobre el suelo se considera que el avión está en tierra. */
export const GS_EN_TIERRA_KT = 30;
/** Más de esto sin posición nueva, el dato está viejo. */
export const DATOS_VIEJOS_S = 120;
/** Debajo de esto no se estima la llegada: la cuenta se vuelve absurda. */
export const GS_MINIMA_ETA_KT = 40;
/** Entre ±150 ft/min se dice "nivelado". */
export const NIVELADO_FPM = 150;

const KM_POR_NM = 1.852;
export const nmAKm = (nm: number) => nm * KM_POR_NM;
export const ktAKmh = (kt: number) => kt * KM_POR_NM;
export const ftAM = (ft: number) => ft * 0.3048;

const SEG_ENTRE = (a: string, b: string): number | null => {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isNaN(x) || Number.isNaN(y) ? null : (y - x) / 1000;
};

/* ------------------------------------------------------------------ hora argentina --- */

const DOS = (n: number) => String(n).padStart(2, "0");

/** "14:35" en hora argentina (UTC−3), o `null` si no se lee la hora. */
export function horaArgentina(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t - 3 * 3600_000);
  return `${DOS(d.getUTCHours())}:${DOS(d.getUTCMinutes())}`;
}

/** El día calendario argentino de un instante, como número comparable (días desde 1970). */
function diaArgentino(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((t - 3 * 3600_000) / 86_400_000);
}

/**
 * "14:35 hs", con "mañana" o "ayer" si el día argentino no es el de `referencia`.
 * `referencia` es la hora del servidor (no el reloj de quien mira).
 */
export function horaArgentinaConDia(iso: string | null, referencia: string): string | null {
  const h = horaArgentina(iso);
  if (!h || !iso) return null;
  const d = diaArgentino(iso);
  const r = diaArgentino(referencia);
  if (d === null || r === null || d === r) return `${h} hs`;
  if (d === r + 1) return `${h} hs de mañana`;
  if (d === r - 1) return `${h} hs de ayer`;
  return `${h} hs`;
}

/** 4500 s -> "1 h 15 min"; menos de una hora -> "42 min"; menos de un minuto -> "menos de 1 min". */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return "menos de 1 min";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${DOS(min % 60)} min`;
}

/* ------------------------------------------------------------------ geometría --- */

type LL = { lat: number; lon: number };

const dist = (a: LL, b: LL) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
const deP = (p: PuntoPublico): LL => ({ lat: p[0], lon: p[1] });

/** Largo de una polilínea, en NM. */
export function largoNm(puntos: LL[]): number {
  let t = 0;
  for (let i = 1; i < puntos.length; i++) t += dist(puntos[i - 1], puntos[i]);
  return t;
}

/** Distancia de un punto a un segmento, en NM, en un plano local (sirve para tramos de decenas de NM). */
function distanciaASegmento(p: LL, a: LL, b: LL): { nm: number; t: number } {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * k * 60;
  const ay = (a.lat - p.lat) * 60;
  const bx = (b.lon - p.lon) * k * 60;
  const by = (b.lat - p.lat) * 60;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
  return { nm: Math.hypot(ax + t * dx, ay + t * dy), t };
}

export interface AvanceRuta {
  /** Largo de toda la ruta prevista. */
  totalNm: number;
  /** Lo que falta desde la posición, por los puntos que quedan. */
  faltaNm: number;
  /** 0–100, sobre la ruta prevista. */
  porcentaje: number;
  /** Índice del próximo punto de la ruta, o `null` si ya pasó el último. */
  proximo: number | null;
  /** Cuánto se aparta de la ruta prevista (NM): si es mucho, la ruta ya no vale. */
  desvioNm: number;
}

/**
 * Dónde va sobre la ruta prevista. Se proyecta la posición en el tramo más cercano; lo que falta es
 * lo que queda de ese tramo más los tramos siguientes. `null` con menos de dos puntos (sin ruta no hay avance).
 */
export function avanceSobreRuta(puntos: PuntoPublico[], pos: LL | null): AvanceRuta | null {
  if (!pos || puntos.length < 2) return null;
  const ps = puntos.map(deP);
  const totalNm = largoNm(ps);
  if (totalNm <= 0) return null;
  let mejor = { i: 0, nm: Infinity, t: 0 };
  for (let i = 0; i < ps.length - 1; i++) {
    const d = distanciaASegmento(pos, ps[i], ps[i + 1]);
    if (d.nm < mejor.nm) mejor = { i, nm: d.nm, t: d.t };
  }
  const tramo = dist(ps[mejor.i], ps[mejor.i + 1]);
  let faltaNm = tramo * (1 - mejor.t);
  for (let i = mejor.i + 1; i < ps.length - 1; i++) faltaNm += dist(ps[i], ps[i + 1]);
  // Lo recorrido, medido sobre la ruta, es lo que no falta: así el porcentaje nunca pasa de 100.
  const porcentaje = Math.max(0, Math.min(100, Math.round(((totalNm - faltaNm) / totalNm) * 100)));
  const llegoAlFinal = mejor.i === ps.length - 2 && mejor.t >= 0.999;
  return { totalNm, faltaNm, porcentaje, proximo: llegoAlFinal ? null : mejor.i + 1, desvioNm: mejor.nm };
}

/** Lo volado de verdad: el largo del recorrido guardado más el último tramo hasta la posición actual. */
export function recorridoNm(recorrido: PuntoRecorrido[], ultima: LL | null): number {
  const ps: LL[] = recorrido.map((p) => ({ lat: p[0], lon: p[1] }));
  if (ultima) ps.push(ultima);
  return largoNm(ps);
}

/* ------------------------------------------------------------------ llegada --- */

/**
 * La llegada estimada, en ISO: la hora de la última posición más lo que falta a la GS de entonces.
 * `null` (no sé) si no hay ruta, si la GS falta o es baja, o si los datos están viejos.
 */
export function llegadaEstimada(opts: {
  faltaNm: number | null;
  gsKt: number | null;
  horaUltima: string | null;
  ahora: string;
}): string | null {
  const { faltaNm, gsKt, horaUltima, ahora } = opts;
  if (faltaNm === null || gsKt === null || !(gsKt >= GS_MINIMA_ETA_KT) || !horaUltima) return null;
  const viejo = SEG_ENTRE(horaUltima, ahora);
  if (viejo === null || viejo > DATOS_VIEJOS_S) return null;
  const t = Date.parse(horaUltima);
  if (Number.isNaN(t)) return null;
  return new Date(t + (faltaNm / gsKt) * 3600_000).toISOString();
}

/* ------------------------------------------------------------------ vertical --- */

export type Tendencia = "subiendo" | "bajando" | "nivelado";

export interface VelocidadVertical {
  tendencia: Tendencia;
  /** Pies por minuto, redondeado a 50 (siempre positivo para "bajando": la dirección va en `tendencia`). */
  fpm: number;
}

/**
 * Sube, baja o está nivelado, con los últimos puntos del recorrido y la última posición. Se compara
 * la última altura con la de un punto de entre 30 s y 5 min atrás (el más cercano a 2 min): menos
 * que eso es ruido del GPS; más es otra fase del vuelo. `null` si no alcanza.
 */
export function velocidadVertical(
  recorrido: PuntoRecorrido[],
  ultima: { alt_ft: number | null; hora: string | null } | null
): VelocidadVertical | null {
  if (!ultima || ultima.alt_ft === null || !ultima.hora) return null;
  const tFin = Date.parse(ultima.hora) / 1000;
  if (Number.isNaN(tFin)) return null;
  let elegido: { alt: number; t: number } | null = null;
  for (const p of recorrido) {
    if (p[2] === null || p[3] === null) continue;
    const dt = tFin - p[3];
    if (dt < 30 || dt > 300) continue;
    if (!elegido || Math.abs(dt - 120) < Math.abs(tFin - elegido.t - 120)) elegido = { alt: p[2], t: p[3] };
  }
  if (!elegido) return null;
  const fpm = ((ultima.alt_ft - elegido.alt) / (tFin - elegido.t)) * 60;
  const redondeado = Math.round(Math.abs(fpm) / 50) * 50;
  if (Math.abs(fpm) < NIVELADO_FPM) return { tendencia: "nivelado", fpm: 0 };
  return { tendencia: fpm > 0 ? "subiendo" : "bajando", fpm: redondeado };
}

export function textoVertical(v: VelocidadVertical | null): string | null {
  if (!v) return null;
  if (v.tendencia === "nivelado") return "Nivelado";
  return `${v.tendencia === "subiendo" ? "Subiendo" : "Bajando"} a ~${v.fpm} ft/min`;
}

/* ------------------------------------------------------------------ estado --- */

export type EstadoMostrado =
  | { clave: "esperando"; titulo: string }
  | { clave: "volando" | "en_tierra" | "en_seguimiento"; titulo: string }
  | { clave: "sin_datos"; titulo: string; aviso: string }
  | { clave: "terminado"; titulo: string };

/** Los segundos desde la última posición, o `null` si no hay. */
export function segundosSinDatos(hora: string | null, ahora: string): number | null {
  return hora ? SEG_ENTRE(hora, ahora) : null;
}

/** Lo que dice el encabezado: Volando, En tierra, Sin datos, El vuelo terminó… */
export function estadoMostrado(d: Pick<SeguimientoPublico, "estado" | "ultima">, ahora: string): EstadoMostrado {
  if (d.estado !== "en_vuelo") return { clave: "terminado", titulo: "El vuelo terminó" };
  if (!d.ultima) return { clave: "esperando", titulo: "Esperando la primera posición" };
  const s = segundosSinDatos(d.ultima.hora, ahora);
  if (s !== null && s > DATOS_VIEJOS_S) {
    return {
      clave: "sin_datos",
      titulo: "Sin datos recientes",
      aviso: `Sin datos hace ${duracion(s)}: puede ser falta de señal en el avión. Se muestra la última posición que llegó.`,
    };
  }
  const gs = d.ultima.gs_kt;
  if (gs === null) return { clave: "en_seguimiento", titulo: "En seguimiento" };
  return gs < GS_EN_TIERRA_KT ? { clave: "en_tierra", titulo: "En tierra" } : { clave: "volando", titulo: "Volando" };
}

/* ------------------------------------------------------------------ perfil --- */

export interface PuntoPerfil {
  /** Segundos desde el primer punto. */
  t: number;
  alt: number;
}

/** Los puntos con altura y hora (más la última posición), en orden de tiempo, para el perfil de altura. */
export function puntosDePerfil(recorrido: PuntoRecorrido[], ultima: { alt_ft: number | null; hora: string | null } | null): PuntoPerfil[] {
  const crudos: { t: number; alt: number }[] = [];
  for (const p of recorrido) if (p[2] !== null && p[3] !== null) crudos.push({ t: p[3], alt: p[2] });
  if (ultima && ultima.alt_ft !== null && ultima.hora) {
    const t = Date.parse(ultima.hora) / 1000;
    if (!Number.isNaN(t) && (crudos.length === 0 || t > crudos[crudos.length - 1].t)) crudos.push({ t, alt: ultima.alt_ft });
  }
  crudos.sort((a, b) => a.t - b.t);
  if (crudos.length === 0) return [];
  const t0 = crudos[0].t;
  return crudos.map((p) => ({ t: p.t - t0, alt: p.alt }));
}

/* ------------------------------------------------------------------ normalización --- */

/** Lo que llega por la red puede venir del backend viejo (puntos de 3 elementos, recorrido de 2): se completa. */
export function normalizar(d: SeguimientoPublico): SeguimientoPublico {
  return {
    ...d,
    avion: d.avion ?? null,
    inicio: d.inicio ?? null,
    puntos: (d.puntos ?? []).map((p) => [p[0], p[1], p[2] ?? "", p[3] ?? ""] as PuntoPublico),
    recorrido: (d.recorrido ?? []).map((p) => [p[0], p[1], p[2] ?? null, p[3] ?? null] as PuntoRecorrido),
  };
}

/** "SADF · San Fernando", o sólo el código si no hay nombre. */
export function nombreDePunto(p: PuntoPublico): string {
  return p[3] ? `${p[2] || "—"} · ${p[3]}` : p[2] || "Punto de la ruta";
}

/** "Cessna 152 (C152)" o lo que haya; con la matrícula delante si el piloto la mostró. */
export function textoDelAvion(a: SeguimientoPublico["avion"]): string | null {
  if (!a) return null;
  const modelo = [a.tipo, a.icao && a.tipo !== a.icao ? `(${a.icao})` : ""].filter(Boolean).join(" ");
  const partes = [a.matricula, modelo].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}
