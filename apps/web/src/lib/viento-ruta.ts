/**
 * El viento pronosticado para la ruta de la planilla de navegación.
 *
 * Open-Meteo da el viento por nivel de presión (1000 a 500 hPa) y, junto a cada uno, la
 * altura geopotencial real de ese nivel en ese lugar y esa hora. Acá se lee esa respuesta
 * para varios puntos a la vez (la mitad de cada tramo), se elige la hora del modelo más
 * cercana a la del paso por el punto y se interpola entre los dos niveles que encierran la
 * altitud de crucero.
 *
 * ## Dos decisiones que no son obvias
 *
 * - **Se interpolan las componentes u/v, no los ángulos.** Entre 350° y 010° el promedio
 *   de los ángulos da 180°, que es el viento contrario. Con componentes el giro sale solo.
 * - **Fuera de los niveles, o con un dato faltante, es `null`.** "No sé" no es "no hay"
 *   (invariante 2): Open-Meteo contesta 200 con `null` en lo que no publica, y un
 *   `Number(null)` sería viento calmo, que es el dato faltante disfrazado del más
 *   tranquilizador. Tampoco se extrapola: por debajo del nivel más bajo o por encima del
 *   más alto no hay dato, y se dice. Y si uno de los dos niveles que encierran la altitud
 *   no tiene dato, no se interpola con el de más allá: eso sería estirar el modelo sobre
 *   un hueco.
 *
 * ## El marco
 *
 * Open-Meteo informa **desde dónde sopla, en grados verdaderos**: el mismo marco de
 * `Viento` en `navegacion.ts` y de `windTriangle`, así que entra sin conversión. La
 * planilla trabaja toda en verdadero y aplica la variación sólo para mostrar.
 */

import type { Viento } from "./navegacion";

/** Los niveles que se piden, de abajo hacia arriba. */
export const NIVELES_HPA_RUTA = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500] as const;

/** Cuántos puntos acepta la ruta del server (una planilla tiene `MAX_PUNTOS` menos uno). */
export const MAX_PUNTOS_VIENTO = 30;

/** Hasta qué altitud se acepta un pedido. 500 hPa está a unos 18.000 ft. */
export const ALTITUD_MAX_FT = 40000;

/** Si la hora del modelo más cercana queda más lejos que esto, no se usa. */
export const TOLERANCIA_HORA_MS = 3 * 3600_000;

const M_POR_PIE = 0.3048;

/** Los campos `hourly` para la URL de Open-Meteo. */
export function camposHourlyViento(): string {
  return NIVELES_HPA_RUTA.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]).join(",");
}

/** Un punto del pedido: dónde y cuándo se pasa por ahí. */
export interface PuntoViento {
  lat: number;
  lon: number;
  /** Instante del paso, en ms desde epoch (UTC). */
  horaMs: number;
}

/** Lo que Open-Meteo devuelve para un lugar, ya reducido a lo que se usa. */
export interface PronosticoLugar {
  /**
   * Elevación del terreno que usa el modelo, en metros. Un nivel de presión cuya altura
   * está por debajo es aire que no existe (el modelo lo extrapola bajo tierra, y en
   * Córdoba 1000 hPa queda ~320 m bajo el suelo): no se usa. `null` si no vino.
   */
  elevacionM: number | null;
  /** ms desde epoch (UTC) de cada hora del modelo. */
  horas: number[];
  /** Por cada nivel de `NIVELES_HPA_RUTA`, los tres arreglos paralelos a `horas`. */
  niveles: { hPa: number; velocidad: unknown[]; direccion: unknown[]; alturaM: unknown[] }[];
}

/**
 * Open-Meteo manda "2026-11-11T14:00", sin zona, y con `timezone=UTC` es UTC. `Date.parse`
 * sin zona lo tomaría como hora local del que corre el código: de ahí la `Z` a mano.
 */
export function horaDeOpenMeteo(texto: unknown): number {
  if (typeof texto !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(texto)) return NaN;
  return Date.parse(`${texto}:00Z`);
}

function lugarDesdeObjeto(o: unknown): PronosticoLugar | null {
  const hourly = (o as { hourly?: Record<string, unknown> } | null)?.hourly;
  if (!hourly || !Array.isArray(hourly.time)) return null;
  const horas = hourly.time.map(horaDeOpenMeteo);
  const elev = (o as { elevation?: unknown }).elevation;
  const arr = (clave: string): unknown[] => (Array.isArray(hourly[clave]) ? (hourly[clave] as unknown[]) : []);
  return {
    elevacionM: typeof elev === "number" && Number.isFinite(elev) ? elev : null,
    horas,
    niveles: NIVELES_HPA_RUTA.map((hPa) => ({
      hPa,
      velocidad: arr(`wind_speed_${hPa}hPa`),
      direccion: arr(`wind_direction_${hPa}hPa`),
      alturaM: arr(`geopotential_height_${hPa}hPa`),
    })),
  };
}

/**
 * Lee la respuesta de Open-Meteo: **un objeto** si se pidió un solo lugar y **una lista de
 * objetos, en el mismo orden**, si se pidieron varios (verificado con un pedido real el
 * 2026-11-11). Devuelve un elemento por lugar pedido; `null` donde no se pudo leer.
 */
export function leerRespuestaOpenMeteo(datos: unknown, cantidad: number): (PronosticoLugar | null)[] {
  const lista = Array.isArray(datos) ? datos : [datos];
  return Array.from({ length: cantidad }, (_, i) => lugarDesdeObjeto(lista[i]));
}

/** El índice de la hora del modelo más cercana a `horaMs`, o `null` si ninguna está a tiro. */
export function horaMasCercana(horas: number[], horaMs: number): number | null {
  let mejor: number | null = null;
  let distancia = Infinity;
  horas.forEach((h, i) => {
    if (!Number.isFinite(h)) return;
    const d = Math.abs(h - horaMs);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  });
  return mejor !== null && distancia <= TOLERANCIA_HORA_MS ? mejor : null;
}

/** De (desde dónde, cuánto) a las componentes hacia donde va el aire. */
export function aComponentes(v: Viento): { u: number; v: number } {
  const r = (v.direccion * Math.PI) / 180;
  return { u: -v.velocidad * Math.sin(r), v: -v.velocidad * Math.cos(r) };
}

/** De las componentes (hacia donde va el aire) a (desde dónde, cuánto). */
export function deComponentes(u: number, v: number): Viento {
  const velocidad = Math.hypot(u, v);
  if (velocidad < 1e-9) return { direccion: 0, velocidad: 0 };
  const direccion = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { direccion, velocidad };
}

export interface VientoEnPunto {
  viento: Viento;
  /** La hora del modelo que se usó, en ms (UTC). */
  horaModeloMs: number;
  /** Los dos niveles entre los que se interpoló, de abajo hacia arriba. */
  nivelesHPa: [number, number];
}

interface NivelLeido {
  hPa: number;
  alturaM: number;
  viento: Viento;
}

function nivelEnHora(n: PronosticoLugar["niveles"][number], i: number, elevacionM: number | null): NivelLeido | null {
  const vel = n.velocidad[i];
  const dir = n.direccion[i];
  const alt = n.alturaM[i];
  if (typeof vel !== "number" || typeof dir !== "number" || typeof alt !== "number") return null;
  if (!Number.isFinite(vel) || !Number.isFinite(dir) || !Number.isFinite(alt) || vel < 0) return null;
  if (elevacionM !== null && alt < elevacionM) return null; // bajo tierra
  return { hPa: n.hPa, alturaM: alt, viento: { direccion: dir, velocidad: vel } };
}

/**
 * El viento a `altitudFt` en un lugar, a la hora más cercana a `horaMs`.
 *
 * `null` si: la hora del modelo queda a más de 3 h, la altitud está por debajo del nivel
 * más bajo o por encima del más alto, o falta algún dato de los dos niveles que la
 * encierran. La altitud es AMSL, igual que la altura geopotencial.
 */
export function vientoEnPunto(lugar: PronosticoLugar | null, horaMs: number, altitudFt: number): VientoEnPunto | null {
  if (!lugar || !Number.isFinite(altitudFt) || !Number.isFinite(horaMs)) return null;
  const i = horaMasCercana(lugar.horas, horaMs);
  if (i === null) return null;

  const alturaM = altitudFt * M_POR_PIE;
  // En el orden de presión (1000 → 500) las alturas crecen; el hueco queda como `null` en
  // su lugar para no unir dos niveles que en el modelo no son vecinos.
  const niveles = lugar.niveles.map((n) => nivelEnHora(n, i, lugar.elevacionM));

  for (let k = 0; k + 1 < niveles.length; k++) {
    const a = niveles[k];
    const b = niveles[k + 1];
    // Los dos tienen que estar y estar en orden; si no, el par no vale. Un hueco a un lado
    // de la altitud se nota recién cuando se llega a él, y ahí no hay par: `null` abajo.
    if (!a || !b || b.alturaM <= a.alturaM) continue;
    if (alturaM < a.alturaM || alturaM > b.alturaM) continue;

    const t = (alturaM - a.alturaM) / (b.alturaM - a.alturaM);
    const ua = aComponentes(a.viento);
    const ub = aComponentes(b.viento);
    return {
      viento: deComponentes(ua.u + (ub.u - ua.u) * t, ua.v + (ub.v - ua.v) * t),
      horaModeloMs: lugar.horas[i],
      nivelesHPa: [a.hPa, b.hPa],
    };
  }
  return null;
}

/** Un tramo de la planilla con su viento (o `null` si no se supo). */
export interface VientoDeTramo {
  distanciaNm: number;
  viento: Viento | null;
  horaModeloMs: number | null;
}

/**
 * Promedio vectorial de los vientos de los tramos, ponderado por distancia: es el único
 * viento constante que da, en total, el mismo desplazamiento del aire a lo largo de la
 * ruta. **`null` si falta el viento de algún tramo**: promediar sólo los que se saben
 * sería sugerir un viento de toda la ruta que no se sabe (invariante 2).
 */
export function vientoPromedioPonderado(tramos: VientoDeTramo[]): Viento | null {
  if (tramos.length === 0 || tramos.some((t) => !t.viento)) return null;
  const total = tramos.reduce((s, t) => s + t.distanciaNm, 0);
  if (!(total > 0)) return null;
  let u = 0;
  let v = 0;
  for (const t of tramos) {
    const c = aComponentes(t.viento!);
    u += (c.u * t.distanciaNm) / total;
    v += (c.v * t.distanciaNm) / total;
  }
  return deComponentes(u, v);
}

/**
 * La hora de paso por la mitad de cada tramo: la salida más lo que se tarda en llegar ahí
 * a la TAS (sin viento; el pronóstico se mueve despacio y una hora de error no cambia
 * el nivel que se lee). Sin TAS se usa la salida para todos.
 */
export function horasDeMitadDeTramo(salidaMs: number, distanciasNm: number[], tasKt: number): number[] {
  let acumulado = 0;
  return distanciasNm.map((d) => {
    const mitad = acumulado + d / 2;
    acumulado += d;
    return tasKt > 0 ? salidaMs + (mitad / tasKt) * 3600_000 : salidaMs;
  });
}

/** "2026-11-11 14:00 UTC", armado a mano: nada de `toLocaleString` (invariante 1). */
export function textoHoraUtc(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())} UTC`;
}

/** Parte "AAAA-MM-DD" y "HH:MM" (UTC) a ms; `NaN` si alguno no es válido. */
export function horaUtcDeTextos(fecha: string, hora: string): number {
  if (!/^\d{4}-\d\d-\d\d$/.test(fecha.trim()) || !/^\d{1,2}:\d\d$/.test(hora.trim())) return NaN;
  const [h, m] = hora.trim().split(":").map(Number);
  if (h > 23 || m > 59) return NaN;
  return Date.parse(`${fecha.trim()}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
}

/** Cuántas altitudes acepta un pedido de varias (la tabla del plan de vuelo usa ~10). */
export const MAX_ALTITUDES_VIENTO = 12;

function altitudValida(a: unknown): a is number {
  return typeof a === "number" && Number.isFinite(a) && a >= 0 && a <= ALTITUD_MAX_FT;
}

/**
 * Validación del pedido a `/api/viento`: devuelve los puntos o el motivo del rechazo.
 *
 * El pedido trae **una** `altitudFt` (la planilla) o **varias** `altitudesFt` (la tabla de
 * vientos en altura del plan de vuelo), nunca las dos: en el primer caso `altitudesFt` es
 * `null`, en el segundo `altitudFt` lo es. Cada altitud se valida igual que la sola.
 */
export function validarPedidoViento(
  cuerpo: unknown
): { puntos: PuntoViento[]; altitudFt: number | null; altitudesFt: number[] | null } | { error: string } {
  const c = cuerpo as { puntos?: unknown; altitudFt?: unknown; altitudesFt?: unknown } | null;
  if (!c || !Array.isArray(c.puntos) || c.puntos.length === 0) return { error: "Faltan los puntos" };
  if (c.puntos.length > MAX_PUNTOS_VIENTO) return { error: `Hasta ${MAX_PUNTOS_VIENTO} puntos` };

  let altitudFt: number | null = null;
  let altitudesFt: number[] | null = null;
  if (c.altitudesFt !== undefined) {
    if (c.altitudFt !== undefined) return { error: "Una altitud o varias, no las dos" };
    const lista = c.altitudesFt;
    if (!Array.isArray(lista) || lista.length === 0) return { error: "Faltan las altitudes" };
    if (lista.length > MAX_ALTITUDES_VIENTO) return { error: `Hasta ${MAX_ALTITUDES_VIENTO} altitudes` };
    if (!lista.every(altitudValida)) return { error: "Altitud fuera de rango" };
    altitudesFt = lista as number[];
  } else {
    if (!altitudValida(c.altitudFt)) return { error: "Altitud fuera de rango" };
    altitudFt = c.altitudFt;
  }
  const ahora = Date.now();
  const puntos: PuntoViento[] = [];
  for (const p of c.puntos as { lat?: unknown; lon?: unknown; hora?: unknown }[]) {
    const lat = p?.lat;
    const lon = p?.lon;
    const horaMs = typeof p?.hora === "string" ? Date.parse(p.hora) : NaN;
    if (typeof lat !== "number" || !(lat >= -90 && lat <= 90)) return { error: "Latitud fuera de rango" };
    if (typeof lon !== "number" || !(lon >= -180 && lon <= 180)) return { error: "Longitud fuera de rango" };
    // El modelo da unos 16 días; atrás, lo que se guarda no vale como pronóstico.
    if (!Number.isFinite(horaMs) || horaMs < ahora - 24 * 3600_000 || horaMs > ahora + 15 * 24 * 3600_000) {
      return { error: "Hora fuera del alcance del pronóstico" };
    }
    puntos.push({ lat, lon, horaMs });
  }
  return { puntos, altitudFt, altitudesFt };
}
