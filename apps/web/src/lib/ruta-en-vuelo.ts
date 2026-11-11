import { distanciaNmPrecisa } from "./distance";
import { aMagnetico, rumboVerdadero } from "./navegacion";
import { MAX_TOKENS } from "./mapa-ruta";

/**
 * **Cambiar la ruta en vuelo** (3.23.0): "Directo a…", el toque a un aeródromo del mapa, la ruta
 * escrita a mano y "Deshacer". Puro: la pantalla le pasa la ruta como tokens (`tokensDeRuta`), la
 * posición del GPS y las capas del mapa.
 *
 * - **La ruta nueva empieza en donde estás.** Un directo no es "sacar los puntos de en medio" sino
 *   volar de acá al punto: la posición entra como primer punto, en el mismo formato de coordenada
 *   que entiende `/api/puntos` ("S34.4091/W58.6847", ~10 m), así que la distancia total, los
 *   tramos y el aviso de espacios salen de donde está el avión y no del punto que ya se pasó.
 * - **Si el punto ya estaba más adelante, se conservan los que siguen** (directo a un punto
 *   intermedio = saltear los de en medio). Si no estaba, o sólo estaba atrás (ya lo pasaste), la
 *   ruta es "acá → el punto" y nada más: no se adivina qué se quería hacer después.
 */

/** "S34.4091/W58.6847": lo mismo que suma "Agregar puntos" en el Mapa (`agregarCoordenada`). */
export function tokenDePosicion(lat: number, lon: number): string {
  return `${lat < 0 ? "S" : "N"}${Math.abs(lat).toFixed(4)}/${lon < 0 ? "W" : "E"}${Math.abs(lon).toFixed(4)}`;
}

const ES_COORDENADA = /^[NS]\d{1,2}(\.\d+)?\/[EW]\d{1,3}(\.\d+)?$/;
export const esTokenDeCoordenada = (t: string) => ES_COORDENADA.test(t);

/**
 * El índice, dentro de `tokens`, del token del punto al que vas (`proximo`): se recorren los puntos
 * hasta ése y se avanza por los tokens que coinciden con su código. Las aerovías abren puntos que
 * no son tokens: si el próximo es uno de ésos, es el del último punto anterior que sí lo es.
 * `-1` si ninguno coincide.
 */
export function tokenDelProximo(tokens: string[], codigosDePuntos: string[], proximo: number): number {
  let desde = 0;
  let ultimo = -1;
  for (let i = 0; i <= Math.min(proximo, codigosDePuntos.length - 1); i++) {
    const j = tokens.findIndex((t, k) => k >= desde && t === codigosDePuntos[i]);
    if (j >= 0) {
      ultimo = j;
      desde = j + 1;
    }
  }
  return ultimo;
}

/**
 * La ruta de "Directo a `destino`" desde `posicion`. `desdeToken` es el índice del primer token que
 * todavía no se voló (el de `tokenDelProximo`, o 0 sin dato): sólo se busca el destino de ahí en
 * adelante, así que con una ida y vuelta (SADF SADM SADF) "directo a SADF" estando de ida es
 * volver a la salida y no saltar a la llegada, y "directo a SADM" conserva el regreso.
 */
export function rutaDirectoA(tokens: string[], posicion: { lat: number; lon: number }, destino: string, desdeToken = 0): string[] {
  const d = destino.trim().toUpperCase();
  const aqui = tokenDePosicion(posicion.lat, posicion.lon);
  const i = tokens.findIndex((t, k) => k >= Math.max(0, desdeToken) && t === d);
  // Una coordenada de posición vieja al principio (otro directo anterior) ya no cuenta: salió de ahí.
  const resto = i >= 0 ? tokens.slice(i) : [d];
  return [aqui, ...resto].slice(0, MAX_TOKENS);
}

/** "Agregar al final de la ruta" (lo que hacía el toque en el mapa): no repite el último. */
export function rutaConAlFinal(tokens: string[], codigo: string): string[] {
  const c = codigo.trim().toUpperCase();
  if (!c || tokens[tokens.length - 1] === c) return tokens;
  return [...tokens, c].slice(0, MAX_TOKENS);
}

/**
 * A qué punto ir con una ruta que acaba de cambiar (o de deshacerse): el final del tramo más cercano
 * a la posición. `proximoPunto` sólo avanza, así que con un índice viejo en una ruta nueva se
 * quedaba en cualquier lado; y volver a 0 y dejar que avance se traba en un punto de quiebre que
 * ya quedó atrás. En un directo la ruta empieza en la posición: el tramo 0→1 es el más cercano
 * (distancia 0) y da 1. Con un solo punto, 0.
 */
export function proximoTrasCambio(puntos: { lat: number; lon: number }[], posicion: { lat: number; lon: number }): number {
  if (puntos.length < 2) return 0;
  const k = Math.cos((posicion.lat * Math.PI) / 180);
  // Plano local en NM (1° = 60 NM): sobra para elegir entre tramos.
  const xy = (q: { lat: number; lon: number }) => ({ x: (q.lon - posicion.lon) * k * 60, y: (q.lat - posicion.lat) * 60 });
  let mejor = 1;
  let mejorD = Infinity;
  for (let i = 1; i < puntos.length; i++) {
    const a = xy(puntos[i - 1]);
    const b = xy(puntos[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l2));
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (d < mejorD - 1e-9) {
      mejorD = d;
      mejor = i;
    }
  }
  return mejor;
}

/* ------------------------------------------------------------ los más cercanos --- */

/** Una fila de `capas.aerodromos`: [icao, local, nombre, lat, lon, …]. */
export type FilaAerodromo = readonly [string, string, string, number, number, ...unknown[]];

export interface AerodromoCercano {
  /** Lo que se escribe en la ruta: el OACI y, si no tiene, el designador local. */
  codigo: string;
  icao: string;
  local: string;
  nombre: string;
  lat: number;
  lon: number;
  distanciaNm: number;
  rumboT: number;
  /** Con la variación de la zona (la de la ruta); si no se sabe, el verdadero. */
  rumbo: number;
  /** `true` si `rumbo` es magnético. */
  magnetico: boolean;
}

/** Los `n` aeródromos más cercanos a `posicion`, del más cerca al más lejos. */
export function aerodromosMasCercanos(
  posicion: { lat: number; lon: number },
  aerodromos: readonly FilaAerodromo[],
  n = 6,
  variacionW: number | null = null
): AerodromoCercano[] {
  const todos: AerodromoCercano[] = [];
  for (const [icao, local, nombre, lat, lon] of aerodromos) {
    const codigo = icao || local;
    if (!codigo || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const rumboT = rumboVerdadero(posicion, { lat, lon });
    todos.push({
      codigo,
      icao,
      local,
      nombre,
      lat,
      lon,
      distanciaNm: distanciaNmPrecisa(posicion.lat, posicion.lon, lat, lon),
      rumboT,
      rumbo: variacionW !== null ? aMagnetico(rumboT, variacionW) : rumboT,
      magnetico: variacionW !== null,
    });
  }
  return todos.sort((a, b) => a.distanciaNm - b.distanciaNm || a.codigo.localeCompare(b.codigo)).slice(0, Math.max(0, n));
}

/* ------------------------------------------------------------- deshacer --- */

/** Cuántos cambios hechos en vuelo se recuerdan. */
export const TOPE_HISTORIA = 10;

/** La historia de rutas anteriores (texto, la más reciente al final) con la que había antes de un cambio. */
export function historiaCon(historia: string[], rutaAntes: string, rutaNueva: string): string[] {
  const antes = rutaAntes.trim();
  if (antes === rutaNueva.trim() || historia[historia.length - 1] === antes) return historia;
  return [...historia, antes].slice(-TOPE_HISTORIA);
}

/** Vuelve un paso: la ruta de antes y la historia sin ella; `null` si no hay nada para deshacer. */
export function deshacerCambio(historia: string[]): { ruta: string; historia: string[] } | null {
  if (!historia.length) return null;
  return { ruta: historia[historia.length - 1], historia: historia.slice(0, -1) };
}

/* ------------------------------------------------------------ el track --- */

/**
 * La ruta que lleva el track grabado (nombre del GPX y "Registrar el vuelo", que usa el primer y el
 * último token) después de un cambio en vuelo: **la salida original y el destino de ahora**. El
 * primer punto de la ruta nueva es la posición del directo (una coordenada), que no es un
 * aeródromo y no puede ser el origen de un vuelo en el libro.
 */
export function rutaDelTrack(rutaDelTrackAntes: string, rutaNueva: string[]): string {
  const salida = rutaDelTrackAntes.trim().split(/\s+/).filter(Boolean)[0];
  const sinPosicion = rutaNueva.length && esTokenDeCoordenada(rutaNueva[0]) ? rutaNueva.slice(1) : rutaNueva;
  if (!salida) return sinPosicion.join(" ");
  return [salida, ...(sinPosicion[0] === salida ? sinPosicion.slice(1) : sinPosicion)].join(" ");
}
