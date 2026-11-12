/**
 * Los procedimientos visuales de Morón (SADM) en el Mapa: llegada y salida de las pistas 02 y 20,
 * dibujados como flechas (no la carta), con las referencias visuales y las vías del FFCC que
 * nombra el AIP. Los datos están en `src/data/procedimientos-visuales.json`, trazados de la carta
 * del AIP: son **indicativos** (del orden de 200 m) y valen la carta.
 */
import datos from "@/data/procedimientos-visuales.json";
import type { IdCapa } from "./capas-mapa";

export type Punto = [number, number];

export interface Procedimiento {
  id: string;
  pista: "02" | "20";
  tipo: "llegada" | "salida";
  titulo: string;
  /** El texto del AIP, tal cual. */
  texto: string;
  /** [lat, lon] en el orden de vuelo. Las llegadas terminan en el umbral; las salidas empiezan en él. */
  puntos: Punto[];
}

export interface ReferenciaVisual {
  nombre: string;
  detalle: string;
  tipo: "referencia" | "notificacion";
  lat: number;
  lon: number;
}

export interface ViaFerrea {
  nombre: string;
  tramos: Punto[][];
}

export interface DatosAerodromoVisual {
  fuente: string;
  sha256: string;
  precision: string;
  procedimientos: Procedimiento[];
  referencias: ReferenciaVisual[];
  vias: ViaFerrea[];
  fuenteVias: string;
}

/** Desde qué zoom se dibuja (más lejos ensuciaría el país entero). */
export const ZOOM_MINIMO_VISUALES = 10;

export const COLOR_LLEGADA = "#22d3ee";
export const COLOR_SALIDA = "#e879f9";
export const COLOR_REFERENCIA = "#f59e0b";

export const VISUALES = (datos as unknown as Record<string, DatosAerodromoVisual>).SADM;

/** Un procedimiento se ve si está prendido su tipo **y** su pista. */
export function procedimientosVisibles(capas: readonly IdCapa[], todos: Procedimiento[] = VISUALES.procedimientos): Procedimiento[] {
  return todos.filter(
    (p) => capas.includes(p.tipo === "llegada" ? "vis-llegadas" : "vis-salidas") && capas.includes(p.pista === "02" ? "vis-02" : "vis-20")
  );
}

const R = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: Punto, b: Punto): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo verdadero de `a` a `b`, de 0 a 360. */
export function rumboEntre(a: Punto, b: Punto): number {
  const dLon = rad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface PuntoConRumbo {
  lat: number;
  lon: number;
  rumbo: number;
}

/** El punto a `metros` del principio de la línea, con el rumbo del tramo en que cae (null si no llega). */
export function puntoAlLargo(puntos: Punto[], metros: number): PuntoConRumbo | null {
  let acumulado = 0;
  for (let i = 1; i < puntos.length; i++) {
    const largo = distanciaM(puntos[i - 1], puntos[i]);
    if (largo > 0 && acumulado + largo >= metros) {
      const t = (metros - acumulado) / largo;
      return {
        lat: puntos[i - 1][0] + (puntos[i][0] - puntos[i - 1][0]) * t,
        lon: puntos[i - 1][1] + (puntos[i][1] - puntos[i - 1][1]) * t,
        rumbo: rumboEntre(puntos[i - 1], puntos[i]),
      };
    }
    acumulado += largo;
  }
  return null;
}

/** Cuánto mide la línea, en metros. */
export function largoM(puntos: Punto[]): number {
  let t = 0;
  for (let i = 1; i < puntos.length; i++) t += distanciaM(puntos[i - 1], puntos[i]);
  return t;
}

/** La punta de flecha del final: el último punto, con el rumbo del último tramo. */
export function puntaFinal(puntos: Punto[]): PuntoConRumbo | null {
  for (let i = puntos.length - 1; i > 0; i--) {
    if (distanciaM(puntos[i - 1], puntos[i]) > 1) {
      return { lat: puntos[i][0], lon: puntos[i][1], rumbo: rumboEntre(puntos[i - 1], puntos[i]) };
    }
  }
  return null;
}

/**
 * Las flechitas de dirección por la línea: una cada `cadaM` metros, sin pisar la punta del final
 * (a menos de `margenM` de ella) ni el principio.
 */
export function flechasDeLinea(puntos: Punto[], cadaM = 1000, margenM = 400): PuntoConRumbo[] {
  const total = largoM(puntos);
  const salida: PuntoConRumbo[] = [];
  for (let d = cadaM; d < total - margenM; d += cadaM) {
    const p = puntoAlLargo(puntos, d);
    if (p) salida.push(p);
  }
  return salida;
}
