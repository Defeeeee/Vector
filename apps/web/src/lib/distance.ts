/**
 * Distancia por gran círculo entre dos puntos, en millas náuticas.
 *
 * Pura y sin dependencias del servidor a propósito: el formulario la usa en el
 * cliente con las coordenadas que ya trae `AirportRef`, y el resumen la usa en el
 * servidor resolviendo los códigos contra el directorio. Una sola implementación
 * para los dos lados.
 *
 * Estaba escrita dentro de `api/weather/route.ts`, donde servía sólo para elegir
 * la estación METAR más cercana. Se sacó de ahí antes de que fuera la segunda
 * copia — es la misma historia que `splitRoute`, que llegó a cinco.
 */

/** Radio terrestre en millas náuticas. */
const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * La misma distancia, **sin redondear**.
 *
 * El redondeo de `distanceNm` es correcto para mostrar y malo para encadenar: un
 * plan de cuatro tramos acumula hasta 2 NM de error de redondeo antes de que
 * empiece la aritmética de tiempos. El planificador consume ésta; todo lo demás
 * sigue usando la entera de siempre.
 */
export function distanciaNmPrecisa(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(distanciaNmPrecisa(lat1, lon1, lat2, lon2));
}

/** Lo mínimo que hace falta para medir: cualquier cosa con coordenadas. */
interface Located {
  lat?: number;
  lon?: number;
}

/**
 * Distancia entre dos aeródromos, o `null` si a alguno le faltan coordenadas.
 *
 * **Null y no cero.** No todos los aeródromos de `madhel.tsv` tienen posición, y
 * un cero se confundiría con un circuito local — que es justamente la distinción
 * que esto viene a informar. Quien la consuma tiene que decidir qué mostrar
 * cuando no se puede medir, en vez de recibir un número inventado.
 */
export function legDistanceNm(origin: Located | null, destination: Located | null): number | null {
  if (
    origin?.lat === undefined || origin?.lon === undefined ||
    destination?.lat === undefined || destination?.lon === undefined
  ) {
    return null;
  }
  return distanceNm(origin.lat, origin.lon, destination.lat, destination.lon);
}

/**
 * Millas estimadas de un vuelo local, donde no hay distancia entre aeródromos
 * que medir.
 *
 * Un circuito sale y vuelve al mismo campo, así que su distancia por gran
 * círculo es cero — cierto como "distancia entre aeródromos" y falso como
 * "millas que voló el piloto". Esto llena ese hueco, y sólo ese.
 *
 * **El tiempo que se carga en el libro es motor encendido a motor apagado**, que
 * es lo que pide ANAC. Incluye rodaje y prueba de motor, así que hay que
 * descontarlos antes de multiplicar por una velocidad.
 *
 * Los 90 kt son deliberadamente una constante y no la velocidad de crucero de
 * cada avión: un Harmony crucea ~100 kt pero el circuito se vuela a 70-80, y los
 * vuelos locales son mayormente circuitos. Usar el crucero sobreestimaría justo
 * donde se aplica. Si algún día se hace por avión, el campo tiene que ser
 * velocidad de circuito, no de crucero.
 *
 * Distancia = velocidad × tiempo vale aunque el track sea todo virajes: lo que
 * se estima es distancia recorrida por el aire, no sobre el terreno.
 */
export const TAXI_ALLOWANCE_H = 0.3;
export const CIRCUIT_SPEED_KT = 90;

/**
 * Por debajo de este total no se estima nada. Un vuelo de 0.5 h quedaría con
 * 0.2 h de aire —60% rodaje— y el número no diría nada útil.
 */
export const MIN_ESTIMABLE_H = 0.4;

export function estimatedLocalNm(durationHours: number): number {
  if (!Number.isFinite(durationHours) || durationHours < MIN_ESTIMABLE_H) return 0;
  const airborne = Math.max(0, durationHours - TAXI_ALLOWANCE_H);
  return Math.round(airborne * CIRCUIT_SPEED_KT);
}
