/**
 * Seguir el vuelo en vivo (migración 041 del backend): la parte pura.
 *
 * El piloto, con el Mapa en modo vuelo, toca "Compartir mi vuelo" y manda un link
 * (`/seguir/<token>`). Quien lo abre, sin cuenta, ve el avión en un mapa.
 *
 * - **Del piloto al backend:** una posición cada ~15 s (`CADA_MS`), sólo la última lectura, sin
 *   acumular lo que se perdió sin señal. El backend ralea de nuevo (una cada 10 s).
 * - **Qué sale:** nombre de pila, ruta, estado, última posición y recorrido (`SeguimientoPublico`).
 *   Nunca la matrícula ni nada de la bitácora; lo impone el backend (`vista_publica`).
 * - **"Hace 40 s" se calcula con diferencias** de la hora del servidor (`ahora` del pedido) y la de
 *   la posición, sin `toLocaleString` (invariante 1): ni el reloj de quien mira ni el del piloto
 *   entran en la cuenta.
 */

/** Cada cuánto el teléfono manda la posición. */
export const CADA_MS = 15_000;
/** Cada cuánto la página pública vuelve a preguntar. */
export const CADA_MIRANDO_MS = 15_000;
/** Lecturas del GPS con más error que esto no se mandan (como el track, `lib/track-vuelo.ts`). */
export const PRECISION_MAXIMA_M = 150;
/** Dónde el teléfono recuerda el seguimiento en curso, para retomarlo si se recarga la app. */
export const CLAVE_SEGUIMIENTO = "vector-seguimiento-en-vivo";

export type EstadoSeguimiento = "en_vuelo" | "terminado" | "vencido";

export interface SeguimientoPublico {
  nombre: string;
  ruta: string;
  /** [lat, lon, código] de la ruta prevista. */
  puntos: [number, number, string][];
  estado: EstadoSeguimiento;
  ultima: { lat: number; lon: number; alt_ft: number | null; gs_kt: number | null; track: number | null; hora: string | null } | null;
  /** [lat, lon] de lo volado. */
  recorrido: [number, number][];
  /** La hora del servidor al contestar. */
  ahora: string;
}

/** Lo que el hook le pasa al backend en cada posición. */
export interface PosicionAEnviar {
  lat: number;
  lon: number;
  alt_ft: number | null;
  gs_kt: number | null;
  track: number | null;
}

/** La lectura del GPS de `lecturaGps` (`lib/mapa-ruta.ts`), con lo que acá se usa. */
export interface LecturaParaCompartir {
  lat: number;
  lon: number;
  altitudFt: number | null;
  gsKt: number | null;
  trackT: number | null;
  precisionM: number;
}

/** La posición a mandar, o `null` si la lectura no sirve (sin fix, o con mucho error). */
export function posicionDeLectura(l: LecturaParaCompartir | null): PosicionAEnviar | null {
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return null;
  if (Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180) return null;
  if (!(l.precisionM <= PRECISION_MAXIMA_M)) return null;
  const acotar = (v: number | null, min: number, max: number) => (v === null || !Number.isFinite(v) ? null : Math.min(max, Math.max(min, v)));
  const alt = acotar(l.altitudFt, -1500, 60000);
  const track = acotar(l.trackT, 0, 360);
  return {
    lat: Math.round(l.lat * 1e5) / 1e5,
    lon: Math.round(l.lon * 1e5) / 1e5,
    alt_ft: alt === null ? null : Math.round(alt),
    gs_kt: (() => {
      const g = acotar(l.gsKt, 0, 1000);
      return g === null ? null : Math.round(g);
    })(),
    track: track === null ? null : Math.round(track),
  };
}

/** El link que se comparte. `origen` es `window.location.origin` (o el sitio, en el server). */
export function urlDeSeguimiento(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, "")}/seguir/${encodeURIComponent(token)}`;
}

/** ¿Tiene la forma de un token? (32–64 caracteres url-safe): lo demás es un 404 sin pedir nada. */
export function tokenValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

/**
 * "hace 40 s", "hace 3 min", "hace 1 h 05 min". `hora` y `ahora` son ISO; `null` si no hay hora.
 * Menos de 5 segundos es "recién".
 */
export function haceCuanto(hora: string | null, ahora: string): string | null {
  if (!hora) return null;
  const t = Date.parse(hora);
  const a = Date.parse(ahora);
  if (Number.isNaN(t) || Number.isNaN(a)) return null;
  const s = Math.max(0, Math.round((a - t) / 1000));
  if (s < 5) return "recién";
  if (s < 60) return `hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${String(min % 60).padStart(2, "0")} min`;
}

/** Lo que se recuerda en el teléfono del seguimiento en curso. */
export interface SeguimientoGuardado {
  id: string;
  token: string;
  /** ISO, de la respuesta del backend. */
  venceAt: string;
}

/** Lo guardado en el teléfono, validado y no vencido: cualquier cosa rara es "no hay". */
export function leerSeguimientoGuardado(texto: string | null, ahoraMs: number): SeguimientoGuardado | null {
  if (!texto) return null;
  try {
    const d = JSON.parse(texto) as Partial<SeguimientoGuardado> | null;
    if (!d || typeof d.id !== "string" || typeof d.token !== "string" || typeof d.venceAt !== "string") return null;
    if (!tokenValido(d.token) || !/^[0-9a-f-]{36}$/i.test(d.id)) return null;
    const vence = Date.parse(d.venceAt);
    if (Number.isNaN(vence) || vence <= ahoraMs) return null;
    return { id: d.id, token: d.token, venceAt: d.venceAt };
  } catch {
    return null;
  }
}

/** ¿Toca mandar? Pasó `CADA_MS` desde el último intento, o nunca se mandó. */
export function tocaMandar(ultimoIntentoMs: number | null, ahoraMs: number): boolean {
  return ultimoIntentoMs === null || ahoraMs - ultimoIntentoMs >= CADA_MS - 500;
}

/** Los textos de cada estado de la página pública. */
export function tituloDelEstado(estado: EstadoSeguimiento): string {
  return estado === "en_vuelo" ? "En vuelo" : "El vuelo terminó";
}

/** 1523 -> "1.523": el punto de los miles a mano, sin `toLocaleString` (invariante 1). */
export function conMiles(n: number): string {
  const e = Math.round(n);
  const signo = e < 0 ? "-" : "";
  return signo + String(Math.abs(e)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
