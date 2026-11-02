/**
 * La imagen para compartir el recorrido real de un vuelo (2.37.0, `/api/recorrido/[id]`): la
 * parte pura. Qué tiles de OSM hacen falta para que el recorrido entre en la imagen, dónde va
 * cada uno y dónde cae cada punto.
 *
 * Satori no tiene Leaflet: el mapa se arma a mano, con tiles de 256 px en Web Mercator
 * dibujados al doble (`ESCALA`). Al doble los nombres del mapa se leen en un teléfono, y son
 * la cuarta parte de los tiles que al tamaño real (la política de OSM pide no abusar).
 */
import { colorPorAltura, type RecorridoCompacto } from "@/lib/recorrido";

export const TILE = 256;
export const ESCALA = 2;
/** Un circuito de tránsito entero se ve; un zoom más y la pista ocupa media imagen. */
export const ZOOM_MAX = 13;
const ZOOM_MIN = 4;

export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Píxel del mundo en Web Mercator, al zoom `z`. */
export function mercator(lat: number, lon: number, z: number): [number, number] {
  const n = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export interface Encuadre {
  z: number;
  /** El píxel del mundo (al zoom `z`) que cae en la esquina de arriba a la izquierda. */
  origen: [number, number];
  tiles: { x: number; y: number; izq: number; arriba: number }[];
}

/**
 * El zoom más cercano en el que el recorrido entra en `caja`, centrado en ella, y los tiles
 * que cubren la imagen entera (`ancho` × `alto`): el mapa va de fondo, no sólo en la caja.
 */
export function encuadrar(puntos: [number, number][], ancho: number, alto: number, caja: Caja): Encuadre {
  let z = ZOOM_MAX;
  let caja0: [number, number, number, number] = [0, 0, 0, 0];
  for (; z >= ZOOM_MIN; z--) {
    const xy = puntos.map(([la, lo]) => mercator(la, lo, z));
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    caja0 = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if ((caja0[2] - caja0[0]) * ESCALA <= caja.ancho && (caja0[3] - caja0[1]) * ESCALA <= caja.alto) break;
  }
  z = Math.max(z, ZOOM_MIN);
  const centro: [number, number] = [(caja0[0] + caja0[2]) / 2, (caja0[1] + caja0[3]) / 2];
  const origen: [number, number] = [
    centro[0] - (caja.x + caja.ancho / 2) / ESCALA,
    centro[1] - (caja.y + caja.alto / 2) / ESCALA,
  ];
  const n = 2 ** z;
  const tiles: Encuadre["tiles"] = [];
  for (let ty = Math.floor(origen[1] / TILE); ty * TILE < origen[1] + alto / ESCALA; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(origen[0] / TILE); tx * TILE < origen[0] + ancho / ESCALA; tx++) {
      tiles.push({
        x: ((tx % n) + n) % n,
        y: ty,
        izq: Math.round((tx * TILE - origen[0]) * ESCALA),
        arriba: Math.round((ty * TILE - origen[1]) * ESCALA),
      });
    }
  }
  return { z, origen, tiles };
}

/** Dónde cae un punto en la imagen. */
export function proyectar(e: Encuadre, lat: number, lon: number): [number, number] {
  const [x, y] = mercator(lat, lon, e.z);
  return [(x - e.origen[0]) * ESCALA, (y - e.origen[1]) * ESCALA];
}

export interface Tramo {
  d: string;
  color: string;
  /** Más de un minuto sin señal: se dibuja punteado, como en la tarjeta del vuelo. */
  corte: boolean;
}

/**
 * El recorrido en tramos para el SVG: los puntos seguidos del mismo color (de a 200 ft) van en
 * un solo `path`, así una navegación de tres horas no son mil elementos.
 */
export function tramos(e: Encuadre, r: RecorridoCompacto, altitudMax: number | null): Tramo[] {
  const techo = Math.max(altitudMax ?? 0, 1000);
  const xy = r.p.map(([, la, lo]) => proyectar(e, la, lo).map((v) => Math.round(v * 10) / 10));
  const salida: Tramo[] = [];
  for (let i = 1; i < r.p.length; i++) {
    const [t0, , , a0] = r.p[i - 1];
    const [t1, , , a1] = r.p[i];
    const media = ((a0 ?? 0) + (a1 ?? 0)) / 2;
    const color = colorPorAltura(Math.round(media / 200) * 200, techo, "oscuro");
    const corte = t1 - t0 > 60;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.color === color && ultimo.corte === corte) ultimo.d += ` L${xy[i][0]} ${xy[i][1]}`;
    else salida.push({ d: `M${xy[i - 1][0]} ${xy[i - 1][1]} L${xy[i][0]} ${xy[i][1]}`, color, corte });
  }
  return salida;
}
