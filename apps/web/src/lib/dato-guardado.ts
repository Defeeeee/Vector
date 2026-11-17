import { HEADER_ORIGEN, MAX_GUARDADO_MIN, ORIGEN_GUARDADO } from "./pwa";
import { horaArgentina } from "./sin-senal";

export { HEADER_ORIGEN, MAX_GUARDADO_MIN, ORIGEN_GUARDADO };

/**
 * Lo último que se supo, **con su edad** (3.46.0, Federico: «mostrar el METAR viejo sin señal,
 * con su antigüedad»).
 *
 * Hasta la 3.45.0 el service worker descartaba un METAR guardado pasadas 2 h (y NOTAM y viento a
 * las 12 h), con la idea de que "un METAR de seis horas es un dato falso con formato de dato". Lo
 * que lo hacía falso era el formato, no el dato: sin señal el piloto igual quiere saber qué había,
 * y lo que no puede pasar es verlo **sin que se note** que es viejo (invariante 2).
 *
 * Sin red, el service worker contesta desde lo guardado hasta {@link MAX_GUARDADO_MIN} y agrega la
 * cabecera {@link HEADER_ORIGEN} = `guardado`; cada pantalla la lee y pone la franja de arriba del
 * dato (`FranjaGuardado`). Con red, nada cambia: se muestra lo actual.
 *
 * Todo lo que se decide acá es puro y tiene sus tests. Las horas se escriben a mano, en hora
 * argentina (o UTC para el papel), nunca con `toLocaleString` (invariante 1).
 */

/** Qué dato es: cambia cómo se dice (observado o guardado) y qué se advierte. */
export type DatoViejo = "metar" | "taf" | "notam" | "viento" | "meteo";

/**
 * Por qué se muestra lo guardado: `sin-senal` (el pedido a nuestro servidor no salió) o `sin-anac`
 * (hay red, pero ANAC no contestó y se usa la última copia de lo suyo).
 */
export type CausaGuardado = "sin-senal" | "sin-anac";

export interface OrigenGuardado {
  /** Cuándo se trajo lo guardado (ISO), o `null` si no se sabe. */
  capturadoEn: string | null;
}

interface ConCabeceras {
  get(nombre: string): string | null;
}

/**
 * ¿La respuesta salió de lo guardado? `null` si es de la red (o de cualquier otro origen).
 * **Sin la cabecera no se asume nada**: una respuesta que no dice de dónde viene es la de la red.
 */
export function origenGuardado(cabeceras: ConCabeceras, nombreCaptura = "X-Vector-Capturado-En"): OrigenGuardado | null {
  if (cabeceras.get(HEADER_ORIGEN) !== ORIGEN_GUARDADO) return null;
  return { capturadoEn: cabeceras.get(nombreCaptura) };
}

/** "hace 3 h 40 min", "hace 25 min", "hace 2 h", "hace menos de 1 min". En minutos enteros. */
export function haceTexto(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 1) return "hace menos de 1 min";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `hace ${h} h` : `hace ${h} h ${resto} min`;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** "14:20 UTC", o "16/11 14:20 UTC" si es de otro día. `null` si la fecha no se entiende. */
export function horaUtcCorta(iso: string, ahoraMs: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const hoy = new Date(ahoraMs);
  const hora = `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())} UTC`;
  const mismoDia = d.getUTCFullYear() === hoy.getUTCFullYear() && d.getUTCMonth() === hoy.getUTCMonth() && d.getUTCDate() === hoy.getUTCDate();
  return mismoDia ? hora : `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${hora}`;
}

/** "a las 14:20" o "el 16/11 a las 14:20" (hora argentina) / "… 14:20 UTC" para el papel. */
function cuando(iso: string, ahoraMs: number, zona: "ar" | "utc"): string | null {
  const hora = zona === "utc" ? horaUtcCorta(iso, ahoraMs) : horaArgentina(iso, ahoraMs);
  if (!hora) return null;
  const partes = hora.split(" ");
  // "16/11 14:20" (o "16/11 14:20 UTC") → "el 16/11 a las 14:20".
  if (partes[0].includes("/")) return `el ${partes[0]} a las ${partes.slice(1).join(" ")}`;
  return `a las ${hora}`;
}

const DICE: Record<DatoViejo, { nombre: string; verbo: "observado" | "guardado"; plural: boolean; consejo: string }> = {
  metar: { nombre: "METAR", verbo: "observado", plural: false, consejo: "no sirve para decidir el vuelo" },
  taf: { nombre: "TAF", verbo: "guardado", plural: false, consejo: "puede haber cambiado: no sirve para decidir el vuelo" },
  notam: { nombre: "NOTAM", verbo: "guardado", plural: true, consejo: "pueden haber cambiado: revisalos antes de volar" },
  viento: { nombre: "Viento en altura", verbo: "guardado", plural: false, consejo: "no sirve para decidir el vuelo" },
  meteo: { nombre: "Meteo y NOTAM", verbo: "guardado", plural: true, consejo: "no sirven para decidir el vuelo: revisalos antes de volar" },
};

export interface OpcionesFranja {
  dato: DatoViejo;
  /**
   * Cuándo se **observó** (sólo el METAR, de su grupo `DDHHMMZ`): es la hora que cuenta. Sin ella se
   * usa la de la descarga y la franja lo dice.
   */
  observadoEn?: Date | string | null;
  /** Cuándo se trajo lo guardado (ISO). */
  capturadoEn?: string | null;
  ahoraMs: number;
  causa?: CausaGuardado;
  /** `utc` para el papel (el briefing en PDF habla en UTC); `ar` para la pantalla. */
  zona?: "ar" | "utc";
}

/**
 * La franja de arriba de un dato guardado: "SIN SEÑAL · METAR observado a las 14:20 (hace 3 h 40
 * min): no sirve para decidir el vuelo".
 *
 * - Con la hora de observación, la dice y cuenta la edad desde ahí.
 * - Sin ella (o para lo que no se observa: TAF, NOTAM, viento), usa la de la descarga y **dice que es
 *   la de lo guardado**; el METAR sin hora de observación avisa que no se sabe cuándo se observó.
 * - Sin ninguna de las dos **no inventa una hora**: dice que es lo guardado y de cuándo no se sabe.
 */
export function franjaDeGuardado(o: OpcionesFranja): string {
  const dice = DICE[o.dato];
  const zona = o.zona ?? "ar";
  const prefijo = o.causa === "sin-anac" ? "ANAC NO CONTESTÓ" : "SIN SEÑAL";

  const obs = o.observadoEn ? (o.observadoEn instanceof Date ? o.observadoEn.toISOString() : o.observadoEn) : null;
  const obsMs = obs ? Date.parse(obs) : NaN;
  const capMs = o.capturadoEn ? Date.parse(o.capturadoEn) : NaN;

  let cuerpo: string;
  if (Number.isFinite(obsMs) && dice.verbo === "observado") {
    const c = cuando(obs as string, o.ahoraMs, zona);
    cuerpo = `${dice.nombre} observado ${c} (${haceTexto((o.ahoraMs - obsMs) / 60000)})`;
  } else if (Number.isFinite(capMs)) {
    const c = cuando(o.capturadoEn as string, o.ahoraMs, zona);
    const base = `${dice.nombre} ${dice.plural ? "guardados" : "guardado"} ${c} (${haceTexto((o.ahoraMs - capMs) / 60000)})`;
    cuerpo = dice.verbo === "observado" ? `${base}, sin saber cuándo se observó` : base;
  } else {
    cuerpo = `${dice.nombre} ${dice.plural ? "guardados" : "guardado"}, sin saber de cuándo ${dice.plural ? "son" : "es"}`;
  }
  return `${prefijo} · ${cuerpo}: ${dice.consejo}`;
}

/** ¿Lo guardado todavía se puede mostrar? (sin fecha, no: no saber cuándo es, es no saber si sirve). */
export function guardadoMostrable(capturadoEn: string | null | undefined, ahoraMs: number): boolean {
  const t = capturadoEn ? Date.parse(capturadoEn) : NaN;
  return Number.isFinite(t) && ahoraMs - t <= MAX_GUARDADO_MIN * 60000;
}
