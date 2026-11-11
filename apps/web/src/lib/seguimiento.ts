/**
 * Seguir el vuelo en vivo (migración 041 del backend): la parte pura.
 *
 * El piloto, con el Mapa en modo vuelo, toca "Compartir mi vuelo" y manda un link
 * (`/seguir/<token>`). Quien lo abre, sin cuenta, ve el avión en un mapa.
 *
 * - **Del piloto al backend:** una posición cada ~15 s (`CADA_MS`), sólo la última lectura, sin
 *   acumular lo que se perdió sin señal. El backend ralea de nuevo (una cada 10 s).
 * - **Qué sale:** nombre de pila, ruta con nombres, tipo de avión, estado, última posición y recorrido
 *   con altura y hora (`SeguimientoPublico`). **La matrícula sólo si el piloto la prendió** (migración
 *   042) y nada de la bitácora; lo impone el backend (`vista_publica`). Los cálculos que arma la
 *   página con eso están en `seguimiento-calculos.ts`.
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

/** [lat, lon, código, nombre] de la ruta prevista (los viejos no traen el nombre). */
export type PuntoPublico = [number, number, string, string];
/** [lat, lon, alt_ft, epoch_s]: la altura y la hora (del servidor) pueden faltar en los viejos. */
export type PuntoRecorrido = [number, number, number | null, number | null];

export interface AvionPublico {
  tipo?: string;
  icao?: string;
  /** Sólo está si el piloto prendió "Mostrar la matrícula". */
  matricula?: string;
}

export interface SeguimientoPublico {
  nombre: string;
  ruta: string;
  puntos: PuntoPublico[];
  avion: AvionPublico | null;
  /** ISO: cuándo empezó a compartir. */
  inicio: string | null;
  estado: EstadoSeguimiento;
  ultima: { lat: number; lon: number; alt_ft: number | null; gs_kt: number | null; track: number | null; hora: string | null } | null;
  recorrido: PuntoRecorrido[];
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
  /** Si la matrícula se está mostrando (migración 042). Lo viejo no lo trae: apagado. */
  mostrarMatricula: boolean;
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
    return { id: d.id, token: d.token, venceAt: d.venceAt, mostrarMatricula: d.mostrarMatricula === true };
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

// --- Quién mira el link (migración 044 del backend) --------------------------------------------
//
// La página pública genera un id al azar de su navegador y lo manda en cada consulta
// (`X-Visitante`). El backend anota sólo ese id y la hora: ni IP ni user agent. El piloto recibe los
// conteos en la respuesta de cada posición. Quien mira no ve a los otros.

/** Dónde el navegador de quien mira recuerda su id al azar. */
export const CLAVE_VISITANTE = "vector-visitante-seguimiento";
/** Largo del id que genera la página (el backend acepta de 16 a 32). */
export const LARGO_ID_VISITANTE = 16;

/** ¿Tiene la forma que acepta el backend? (16–32 caracteres url-safe). */
export function idDeVisitanteValido(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{16,32}$/.test(id);
}

/** Un id a partir de bytes al azar (`crypto.getRandomValues`): 16 caracteres de 62 símbolos. */
export function idDesdeBytes(bytes: ArrayLike<number>): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < LARGO_ID_VISITANTE; i++) id += alfabeto[(bytes[i] ?? 0) % alfabeto.length];
  return id;
}

/** Lo que el backend le cuenta al piloto en la respuesta de cada posición. */
export interface VistasDelLink {
  mirandoAhora: number;
  vistosTotal: number;
  /** ISO de la última vez que alguien abrió el link, o `null`. */
  ultimaVistaAt: string | null;
  /** ISO, la hora del servidor al contestar: "hace 3 min" se cuenta contra esta. */
  ahora: string;
}

/** Lee la respuesta de `/posicion`; `null` si no trae los campos (un backend anterior a la 044). */
export function vistasDeRespuesta(j: unknown): VistasDelLink | null {
  if (!j || typeof j !== "object") return null;
  const r = j as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const mirando = n(r.mirando_ahora);
  const total = n(r.vistos_total);
  if (mirando === null || total === null || typeof r.ahora !== "string") return null;
  return { mirandoAhora: mirando, vistosTotal: total, ultimaVistaAt: typeof r.ultima_vista_at === "string" ? r.ultima_vista_at : null, ahora: r.ahora };
}

/** El texto corto de la pantalla de vuelo: "2 te están mirando", "te vieron hace 3 min" o "nadie abrió el link todavía". */
export function textoDeVistas(v: VistasDelLink | null): string | null {
  if (!v) return null;
  if (v.mirandoAhora > 0) return v.mirandoAhora === 1 ? "1 te está mirando" : `${v.mirandoAhora} te están mirando`;
  const hace = haceCuanto(v.ultimaVistaAt, v.ahora);
  return hace ? `te vieron ${hace}` : "nadie abrió el link todavía";
}

/** El detalle de "Compartiendo": cuántos miran ahora, cuántas personas abrieron el link y cuándo fue la última vez. */
export function detalleDeVistas(v: VistasDelLink | null): string | null {
  if (!v) return null;
  if (v.vistosTotal === 0 && v.mirandoAhora === 0) return "Nadie abrió el link todavía.";
  const total = Math.max(v.vistosTotal, v.mirandoAhora);
  const personas = total === 1 ? "1 persona abrió el link" : `${total} personas abrieron el link`;
  if (v.mirandoAhora > 0) {
    const ahora = v.mirandoAhora === 1 ? "1 te está mirando ahora" : `${v.mirandoAhora} te están mirando ahora`;
    return `${ahora} · ${personas}.`;
  }
  const hace = haceCuanto(v.ultimaVistaAt, v.ahora);
  return `${personas}${hace ? `; la última vez, ${hace}` : ""}.`;
}
