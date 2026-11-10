import { distanciaNmPrecisa } from "./distance";

/**
 * El track del vuelo (3.16.0): lo que el GPS del teléfono va marcando mientras el Mapa está en
 * modo vuelo, dibujado como una estela y guardado en el teléfono.
 *
 * - **Se guarda en el teléfono** (`localStorage`), no en el servidor: es del piloto, y un vuelo
 *   pasa sin señal. Sobrevive a que iOS cierre la app: si se vuelve a "Volar" dentro de los 30
 *   minutos del último punto, sigue el mismo track (`sigueElTrack`).
 * - **Sólo graba con la pantalla prendida**: un navegador no le da el GPS a una página en segundo
 *   plano. Por eso el modo vuelo pide Wake Lock, y la pantalla lo dice.
 * - **Se raleó**: un punto cada 4 s como mucho y sólo si se movió (15 m); quieto, uno por minuto.
 *   Las lecturas con más de 150 m de error no entran.
 * - Al terminar, se baja como GPX (las horas en UTC, ISO 8601: no es un formato localizado).
 *
 * Puro: la hora entra como parámetro.
 */

/** [hora en ms, lat, lon, altura GPS en ft, GS en kt] */
export type PuntoTrack = [number, number, number, number | null, number | null];

export interface TrackVuelo {
  inicio: number;
  puntos: PuntoTrack[];
  /** La ruta del Mapa cuando se empezó ("SADF SADM"), para el nombre y para Registrar vuelo. */
  ruta: string;
  terminado: number | null;
}

export const CLAVE_TRACK = "vector-track-vuelo";
export const PRECISION_MAXIMA_M = 150;
const CADA_MS = 4_000;
const QUIETO_CADA_MS = 60_000;
const MOVIDO_M = 15;
/** Hasta cuánto después del último punto "Volar" sigue el mismo track. */
export const SEGUIR_TRACK_MS = 30 * 60_000;

const metros = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon) * 1852;

/** Suma una lectura del GPS si corresponde; si no, devuelve el mismo arreglo. */
export function sumarPunto(
  puntos: PuntoTrack[],
  l: { lat: number; lon: number; altitudFt: number | null; gsKt: number | null; precisionM: number },
  t: number
): PuntoTrack[] {
  if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon) || l.precisionM > PRECISION_MAXIMA_M) return puntos;
  const nuevo: PuntoTrack = [t, l.lat, l.lon, l.altitudFt, l.gsKt === null ? null : Math.round(l.gsKt)];
  const ultimo = puntos[puntos.length - 1];
  if (!ultimo) return [nuevo];
  const dt = t - ultimo[0];
  // Si el reloj volvió para atrás (lo corrigió la red, o un track viejo con otra hora), se sigue
  // grabando: si no, el track quedaba trabado hasta que la hora alcanzara al último punto.
  if (dt < 0) return [...puntos, nuevo];
  if (dt < CADA_MS) return puntos;
  const movido = metros({ lat: ultimo[1], lon: ultimo[2] }, l) >= MOVIDO_M;
  if (!movido && dt < QUIETO_CADA_MS) return puntos;
  return [...puntos, nuevo];
}

export function resumenTrack(puntos: PuntoTrack[]): { distanciaNm: number; minutos: number; altitudMaxFt: number | null } {
  let distanciaNm = 0;
  let altitudMaxFt: number | null = null;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    if (i > 0) distanciaNm += distanciaNmPrecisa(puntos[i - 1][1], puntos[i - 1][2], p[1], p[2]);
    if (p[3] !== null && (altitudMaxFt === null || p[3] > altitudMaxFt)) altitudMaxFt = p[3];
  }
  const minutos = puntos.length > 1 ? (puntos[puntos.length - 1][0] - puntos[0][0]) / 60_000 : 0;
  return { distanciaNm, minutos, altitudMaxFt };
}

/** ¿"Volar" sigue este track? Si no terminó del todo hace rato: el último punto, hace menos de 30 min. */
export function sigueElTrack(track: TrackVuelo | null, ahora: number): boolean {
  const ultimo = track?.puntos[track.puntos.length - 1];
  return !!ultimo && ahora - ultimo[0] < SEGUIR_TRACK_MS;
}

/** Lo guardado en el teléfono, validado: cualquier cosa rara es "no hay". */
export function leerTrack(texto: string | null): TrackVuelo | null {
  if (!texto) return null;
  try {
    const t = JSON.parse(texto) as TrackVuelo;
    if (!t || typeof t.inicio !== "number" || !Array.isArray(t.puntos)) return null;
    const puntos = t.puntos.filter(
      (p): p is PuntoTrack => Array.isArray(p) && p.length === 5 && typeof p[0] === "number" && Number.isFinite(p[1]) && Number.isFinite(p[2])
    );
    return { inicio: t.inicio, puntos, ruta: typeof t.ruta === "string" ? t.ruta : "", terminado: typeof t.terminado === "number" ? t.terminado : null };
  } catch {
    return null;
  }
}

const escaparXml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** El track en GPX 1.1, con la altura en metros como pide el formato. */
export function gpxDelTrack(track: TrackVuelo): string {
  const nombre = escaparXml(track.ruta || "Vuelo");
  const puntos = track.puntos
    .map(
      ([t, lat, lon, alt]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${alt !== null ? `<ele>${(alt / 3.28084).toFixed(1)}</ele>` : ""}<time>${new Date(t).toISOString()}</time></trkpt>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vector" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${nombre}</name><time>${new Date(track.inicio).toISOString()}</time></metadata>
  <trk>
    <name>${nombre}</name>
    <trkseg>
${puntos}
    </trkseg>
  </trk>
</gpx>
`;
}

/** `vuelo-2026-11-10-SADF-SADM.gpx`, con la fecha argentina (UTC−3, sin horario de verano). */
export function nombreDelGpx(track: TrackVuelo): string {
  const fecha = fechaArgentina(track.inicio);
  const ruta = track.ruta.trim().split(/\s+/).filter(Boolean);
  const extremos = ruta.length > 1 ? `-${ruta[0]}-${ruta[ruta.length - 1]}` : ruta.length ? `-${ruta[0]}` : "";
  return `vuelo-${fecha}${extremos.replace(/[^A-Z0-9-]/gi, "")}.gpx`;
}

/** AAAA-MM-DD en la Argentina: cuenta, no `toLocaleString` (invariante 1). */
export function fechaArgentina(t: number): string {
  return new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);
}
