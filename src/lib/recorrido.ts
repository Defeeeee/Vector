/**
 * El recorrido real de un vuelo, de ADS-B (2.30.0; migraciones 034 y 035 del backend), la
 * parte pura: los tipos de lo que manda `/adsb/...`, las horas, el aeródromo de cada punta y
 * el color por altura del mapa.
 *
 * Las horas del recorrido son las de **la primera y la última posición en el aire**: en tierra
 * no llega la señal a ningún receptor. Por eso, al sugerirlas para el formulario, el despegue
 * se redondea para abajo y el aterrizaje para arriba.
 */

import type { RecorridoPublicado } from "@/types";

/** Lo que guarda el backend: segundos desde `t0`, lat, lon, pies, nudos. */
export interface RecorridoCompacto {
  t0: number;
  fuente: "adsb.fi" | "adsb.lol" | string;
  p: [number, number, number, number | null, number | null][];
}

export interface ResumenRecorrido {
  despegue: string;
  aterrizaje: string;
  minutos: number;
  aterrizajes: number;
  altitud_max: number | null;
  velocidad_max: number | null;
  millas: number;
  /** Los cortes de señal de más de 2 minutos, sumados (lejos de las antenas no hay recepción). */
  minutos_sin_senal?: number;
  posiciones: number;
  inicio: [number, number];
  fin: [number, number];
}

/** Lo mismo que el backend (`RECORRIDO_PUNTOS_MAX`): para una tarjeta alcanzan. */
export const RECORRIDO_PUNTOS_MAX = 400;

/**
 * La forma del recorrido que se publica, igual que `recorrido_publicable` del backend: sin
 * horas ni velocidad, lat y lon a 4 decimales, la altura de a 100 ft y los cortes de señal
 * marcados. La usa la vista previa del composer, para mostrar lo que va a salir.
 */
export function formaDelRecorrido(r: RecorridoCompacto | null | undefined, maximo = RECORRIDO_PUNTOS_MAX): RecorridoPublicado | null {
  const p = r?.p ?? [];
  if (p.length < 2) return null;
  const paso = Math.max(1, Math.ceil(p.length / maximo));
  const indices: number[] = [];
  for (let i = 0; i < p.length; i += paso) indices.push(i);
  if (indices[indices.length - 1] !== p.length - 1) indices.push(p.length - 1);
  const puntos: [number, number, number][] = [];
  const cortes: number[] = [];
  indices.forEach((i, k) => {
    const [, lat, lon, alt] = p[i];
    puntos.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, Math.round((alt ?? 0) / 100) * 100]);
    if (k > 0) {
      for (let m = indices[k - 1] + 1; m <= i; m++) {
        if (p[m][0] - p[m - 1][0] > 60) {
          cortes.push(k);
          break;
        }
      }
    }
  });
  return { p: puntos, cortes, fuente: r?.fuente || "adsb.fi" };
}

/** El desde ya dicho, para que no lo recalcule cada componente. */
export const DESDE_RECORRIDOS = "2026-10-23";

const dos = (n: number) => String(n).padStart(2, "0");

/** "19:27" en UTC, redondeado al minuto hacia donde se pida. */
export function hhmmUtc(iso: string, redondeo: "abajo" | "arriba" = "abajo"): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = redondeo === "arriba" ? Math.ceil(t / 60000) : Math.floor(t / 60000);
  const d = new Date(min * 60000);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** "16:27" en hora argentina (UTC−3, sin horario de verano). Para el server (invariante 1). */
export function hhmmArgentina(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 3 * 3600_000);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * El aeródromo de una punta del recorrido: el más cercano a menos de 4 km. La primera posición
 * se ve recién despegado, a uno o dos kilómetros de la pista; más lejos ya no se adivina.
 */
export function aerodromoCercano(
  punto: [number, number],
  aerodromos: { icao: string; lat?: number | null; lon?: number | null }[],
  maxKm = 4
): string | null {
  let mejor: string | null = null;
  let mejorKm = maxKm;
  for (const a of aerodromos) {
    if (a.lat == null || a.lon == null) continue;
    const d = km(punto, [a.lat, a.lon]);
    if (d < mejorKm) {
      mejor = a.icao;
      mejorKm = d;
    }
  }
  return mejor;
}

const PALETAS: Record<"oscuro" | "claro", [number, [number, number, number]][]> = {
  // La de la imagen del vuelo, sobre el mapa oscuro: ámbar, celeste, casi blanco.
  oscuro: [
    [0, [245, 158, 11]],
    [0.45, [56, 189, 248]],
    [1, [224, 242, 254]],
  ],
  // Sobre los tiles claros de OSM el casi blanco no se ve: ámbar, azul, índigo.
  claro: [
    [0, [217, 119, 6]],
    [0.45, [2, 132, 199]],
    [1, [67, 56, 202]],
  ],
};

/** El color de un tramo según su altura, de abajo (ámbar) hacia arriba. */
export function colorPorAltura(pies: number | null, techo: number, fondo: "oscuro" | "claro" = "oscuro"): string {
  const t = Math.max(0, Math.min(1, (pies ?? 0) / Math.max(techo, 500)));
  const paradas = PALETAS[fondo];
  let i = 0;
  while (i < paradas.length - 2 && t > paradas[i + 1][0]) i++;
  const [t0, c0] = paradas[i];
  const [t1, c1] = paradas[i + 1];
  const k = (t - t0) / (t1 - t0);
  return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(",")})`;
}

/** ¿Vale la pena preguntar? Sólo vuelos desde que empezó a grabar y de los últimos 30 días. */
export function puedeHaberDetectados(fecha: string, hoyIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < DESDE_RECORRIDOS || fecha > hoyIso) return false;
  return (Date.parse(hoyIso) - Date.parse(fecha)) / 86400_000 <= 30;
}
