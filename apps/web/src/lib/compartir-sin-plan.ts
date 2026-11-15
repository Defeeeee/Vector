import { distanciaNmPrecisa } from "@/lib/distance";

/**
 * "Compartir tu vuelo" sin plan (migración 055 del backend): un link para la familia con origen,
 * destino y horario, sin ruta. Lo puro: la hora argentina que escribe el piloto pasada a UTC, la
 * duración, la sugerencia y la validación del formulario. El backend vuelve a validar todo
 * (`SeguimientoSinPlan`, `salida_aceptable`): esto es para decirlo antes de pedir.
 *
 * **Hora argentina = UTC−3 fijo**, sin horario de verano desde 2009. Todo se hace con aritmética
 * sobre la hora del servidor, nunca con el reloj ni la zona del navegador (invariante 1): el
 * `Date` se usa sólo con `Date.UTC` y `getUTC*`, que no dependen de la zona de nadie.
 */

const DESFASE_MS = 3 * 3600_000;
/** Los mismos topes que el backend: `SALIDA_MAXIMA_ADELANTO` y `SALIDA_MAXIMA_ATRASO`. */
const MAXIMO_ADELANTO_MS = 24 * 3600_000;
const MAXIMO_ATRASO_MS = 12 * 3600_000;
export const DURACION_MINIMA_MIN = 10;
export const DURACION_MAXIMA_MIN = 720;
/** Cuántos vuelos puede compartir una cuenta a la vez (`TOPE_ACTIVOS` del backend). */
export const TOPE_ACTIVOS = 5;

const DOS = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" del día argentino de un instante (la hora del servidor), o `null` si no se lee. */
export function fechaArgentina(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t - DESFASE_MS);
  return `${d.getUTCFullYear()}-${DOS(d.getUTCMonth() + 1)}-${DOS(d.getUTCDate())}`;
}

/** "HH:MM" argentino de un instante, o `null`. */
export function horaDeArgentina(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t - DESFASE_MS);
  return `${DOS(d.getUTCHours())}:${DOS(d.getUTCMinutes())}`;
}

/**
 * Lo que escribió el piloto -fecha "AAAA-MM-DD" y hora en 24 h ("9:30", "0930", "09:30")- como
 * instante UTC en ISO, o `null` si alguna no es válida (un 31 de febrero, las 25:00).
 */
export function salidaArgentinaAUtc(fecha: string, hora: string): string | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  const h = leerHora(hora);
  if (!f || !h) return null;
  const [a, m, d] = [Number(f[1]), Number(f[2]), Number(f[3])];
  const t = Date.UTC(a, m - 1, d, h.horas, h.minutos);
  const u = new Date(t);
  // `Date.UTC` corre el 31 de febrero al 3 de marzo: se exige que el día vuelva igual.
  if (u.getUTCFullYear() !== a || u.getUTCMonth() !== m - 1 || u.getUTCDate() !== d) return null;
  return new Date(t + DESFASE_MS).toISOString();
}

function leerHora(texto: string): { horas: number; minutos: number } | null {
  const t = texto.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  return horas <= 23 && minutos <= 59 ? { horas, minutos } : null;
}

/** "1:30", "01:30" o "0130" -> 90. `null` si no es una duración (minutos 60 o más, vacío). */
export function minutosDeDuracion(texto: string): number | null {
  const t = texto.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  const minutos = Number(m[2]);
  return minutos < 60 ? Number(m[1]) * 60 + minutos : null;
}

/** 90 -> "1:30". */
export function textoDeDuracion(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${DOS(m % 60)}`;
}

export interface SugerenciaDuracion {
  minutos: number;
  /** "52 NM en línea recta a 90 kt". */
  motivo: string;
}

/**
 * **Sugerir, no llenar**: la distancia directa entre los dos aeródromos a la velocidad de crucero
 * del avión, redondeada hacia arriba a 5 min. Sin velocidad cargada, sin sugerencia (no se inventa
 * un 110). Es una cuenta sin viento ni ascenso: el piloto la ajusta.
 */
export function sugerirDuracion(
  origen: { lat?: number; lon?: number } | null,
  destino: { lat?: number; lon?: number } | null,
  tasKt: number | null | undefined
): SugerenciaDuracion | null {
  if (!origen || !destino || !tasKt || !(tasKt > 0)) return null;
  if (origen.lat === undefined || origen.lon === undefined || destino.lat === undefined || destino.lon === undefined) return null;
  const nm = distanciaNmPrecisa(origen.lat, origen.lon, destino.lat, destino.lon);
  if (!(nm > 0)) return null;
  const crudo = (nm / tasKt) * 60;
  const minutos = Math.min(DURACION_MAXIMA_MIN, Math.max(DURACION_MINIMA_MIN, Math.ceil(crudo / 5) * 5));
  return { minutos, motivo: `${Math.round(nm)} NM en línea recta a ${Math.round(tasKt)} kt` };
}

export interface PuntoCompartir {
  codigo: string;
  nombre: string;
  lat?: number;
  lon?: number;
}

export interface BorradorSinPlan {
  avionId: string;
  origen: PuntoCompartir | null;
  destino: PuntoCompartir | null;
  fecha: string;
  hora: string;
  duracion: string;
}

export interface DatosSinPlan {
  aircraft_id: string;
  origen: { lat: number; lon: number; codigo: string; nombre: string };
  destino: { lat: number; lon: number; codigo: string; nombre: string };
  /** ISO en UTC. */
  salida: string;
  duracion_min: number;
}

/** El motivo para no compartir todavía (en castellano, para mostrar), o los datos listos para mandar. */
export function validarSinPlan(b: BorradorSinPlan, ahoraIso: string): { error: string } | { datos: DatosSinPlan } {
  if (!b.avionId) return { error: "Elegí el avión." };
  if (!b.origen) return { error: "Falta el aeródromo de salida." };
  if (!b.destino) return { error: "Falta el aeródromo de destino." };
  const sinLugar = [b.origen, b.destino].find((p) => p.lat === undefined || p.lon === undefined);
  if (sinLugar) return { error: `No sé dónde queda ${sinLugar.codigo}: elegí otro aeródromo o cargá sus coordenadas.` };
  if (b.origen.codigo.trim().toUpperCase() === b.destino.codigo.trim().toUpperCase()) return { error: "La salida y el destino son el mismo aeródromo." };
  const salida = salidaArgentinaAUtc(b.fecha, b.hora);
  if (!salida) return { error: "Escribí la fecha y la hora de salida (hora argentina, 24 h: 09:30)." };
  const dif = Date.parse(salida) - Date.parse(ahoraIso);
  if (dif > MAXIMO_ADELANTO_MS) return { error: "Se puede compartir hasta 24 horas antes de la salida: volvé más cerca." };
  if (-dif > MAXIMO_ATRASO_MS) return { error: "Esa salida fue hace más de 12 horas." };
  const min = minutosDeDuracion(b.duracion);
  if (min === null) return { error: "Escribí la duración en horas y minutos (1:30)." };
  if (min < DURACION_MINIMA_MIN || min > DURACION_MAXIMA_MIN) return { error: "La duración tiene que estar entre 10 minutos y 12 horas." };
  const punto = (p: PuntoCompartir) => ({ lat: p.lat as number, lon: p.lon as number, codigo: p.codigo.trim().toUpperCase().slice(0, 20), nombre: p.nombre.slice(0, 60) });
  return { datos: { aircraft_id: b.avionId, origen: punto(b.origen), destino: punto(b.destino), salida, duracion_min: min } };
}

const PARECE_AERODROMO = /^[A-Z0-9]{3,4}$/;

/**
 * El link a la pantalla desde la ruta del Mapa: con el primer y el último punto de la ruta como
 * origen y destino, si parecen aeródromos (los códigos de aerovías o de fixes de 5 letras no entran).
 * La pantalla los busca y, si no los encuentra, queda el campo vacío.
 */
export function enlaceCompartirSinPlan(tokens: string[]): string {
  const base = "/dashboard/mapa/compartir";
  const t = tokens.map((x) => x.trim().toUpperCase()).filter(Boolean);
  if (t.length < 2) return base;
  const [o, d] = [t[0], t[t.length - 1]];
  if (!PARECE_AERODROMO.test(o) || !PARECE_AERODROMO.test(d) || o === d) return base;
  return `${base}?origen=${encodeURIComponent(o)}&destino=${encodeURIComponent(d)}`;
}
