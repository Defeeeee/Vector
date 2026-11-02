/**
 * Viento en altura: elegir el nivel que corresponde y decir de dónde salió.
 *
 * ## Por qué hace falta
 *
 * El planificador usa el viento del METAR de salida, que es **viento de superficie**, y
 * lo dice en pantalla. Es una aproximación consciente y bastante mala: a 3.000 ft el
 * viento suele rolar 20-30° a la derecha y soplar 10-15 kt más que en la pista, porque
 * abajo el rozamiento con el suelo lo frena y lo desvía.
 *
 * En un tramo de 100 NM eso son varios minutos de error de tiempo y, peor, un rumbo mal
 * corregido.
 *
 * ## De dónde salen los datos
 *
 * Open-Meteo, modelo GFS. **Sin API key y sin registro** — verificado con un request
 * real a Morón antes de escribir esto. Devuelve viento por **nivel de presión**, y junto
 * a él el `geopotential_height`, que es la altura real de ese nivel en ese momento y
 * lugar.
 *
 * Eso último importa más de lo que parece: la correspondencia hPa ↔ pies **no es fija**.
 * 850 hPa está a ~5.000 ft un día y a ~4.700 otro, según la presión y la temperatura de
 * la columna. Usar una tabla de conversión sería inventar precisión; el modelo ya manda
 * la altura buena y lo correcto es usarla.
 *
 * ## El marco de referencia
 *
 * **Los modelos meteorológicos reportan la dirección del viento en grados verdaderos**,
 * igual que el METAR escrito. O sea que entra directo a `windTriangle` sin conversión,
 * como todo lo demás en `navegacion.ts`.
 */

export interface NivelViento {
  /** Presión del nivel, hPa. Identifica el nivel en el modelo. */
  hPa: number;
  /** Altura real de ese nivel, en pies. Del modelo, no de una tabla. */
  altitudFt: number;
  /** De dónde sopla, grados **verdaderos**. */
  direccion: number;
  /** Nudos. */
  velocidad: number;
}

/**
 * Los tres niveles que le sirven a un vuelo VFR de aviación general.
 *
 * 925 hPa ≈ 2.800 ft, 850 ≈ 5.000, 700 ≈ 10.000 — medidos en Morón, y por eso mismo
 * aproximados. Arriba de 700 hPa un avión sin oxígeno no va, y abajo de 925 el modelo
 * ya se pisa con el viento de superficie que da el METAR.
 */
export const NIVELES_HPA = [925, 850, 700] as const;

/**
 * El nivel que mejor representa el viento a una altitud de crucero.
 *
 * **El más cercano en altura, no una interpolación.** Interpolar entre dos niveles daría
 * un número más suave y no más cierto: el modelo tiene un error de varios nudos y de
 * varios grados, mucho mayor que lo que se gana promediando. Y un número interpolado se
 * lee como si fuera una medición.
 *
 * `null` si no hay ningún nivel — sin datos no se estima.
 */
export function nivelParaAltitud(niveles: NivelViento[], altitudFt: number): NivelViento | null {
  if (niveles.length === 0) return null;
  return niveles.reduce((a, b) =>
    Math.abs(b.altitudFt - altitudFt) < Math.abs(a.altitudFt - altitudFt) ? b : a
  );
}

/**
 * Cuánto se aparta el viento en altura del de superficie.
 *
 * Sirve para una sola cosa, y es honestidad: si el piloto venía planificando con el
 * viento del METAR, tiene que poder ver cuánto cambia la cuenta. Devuelve la diferencia
 * de dirección con signo —positiva si rola a la derecha, que es lo habitual— y la de
 * intensidad.
 */
export function diferenciaConSuperficie(
  superficie: { direccion: number; velocidad: number },
  altura: { direccion: number; velocidad: number }
): { giroGrados: number; masNudos: number } {
  // Por el lado corto: de 350 a 010 son 20° a la derecha, no 340 a la izquierda.
  let giro = ((altura.direccion - superficie.direccion + 540) % 360) - 180;
  if (giro <= -180) giro += 360;

  return {
    giroGrados: giro,
    masNudos: altura.velocidad - superficie.velocidad,
  };
}

/**
 * Convierte la respuesta cruda de Open-Meteo a niveles utilizables.
 *
 * Vive acá y no en la ruta de API para poder testearla: la ruta es un `route.ts` y este
 * repo sólo testea `src/**\/*.test.ts`.
 *
 * **Un nivel con cualquier campo nulo se descarta entero.** Open-Meteo contesta 200 con
 * `null` en los niveles que un modelo no publica —lo confirmó la investigación previa—
 * así que un `Number(null)` daría cero, y cero es "viento calmo del norte": un dato
 * faltante disfrazado del dato más tranquilizador posible.
 */
export function nivelesDesdeOpenMeteo(datos: unknown, indiceHora: number): NivelViento[] {
  const hourly = (datos as { hourly?: Record<string, unknown[]> })?.hourly;
  if (!hourly) return [];

  const niveles: NivelViento[] = [];

  for (const hPa of NIVELES_HPA) {
    const dir = hourly[`wind_direction_${hPa}hPa`]?.[indiceHora];
    const vel = hourly[`wind_speed_${hPa}hPa`]?.[indiceHora];
    const alturaM = hourly[`geopotential_height_${hPa}hPa`]?.[indiceHora];

    if (typeof dir !== "number" || typeof vel !== "number" || typeof alturaM !== "number") {
      continue;
    }

    niveles.push({
      hPa,
      altitudFt: Math.round(alturaM * 3.28084),
      direccion: Math.round(dir),
      velocidad: Math.round(vel),
    });
  }

  return niveles.sort((a, b) => a.altitudFt - b.altitudFt);
}

/**
 * El índice de la hora más cercana a la que se quiere volar.
 *
 * Open-Meteo devuelve un array por hora en UTC. Sin esto habría que asumir "la hora
 * cero", que es medianoche y no cuando nadie vuela.
 */
export function indiceDeHora(tiempos: string[], cuando: Date): number {
  if (tiempos.length === 0) return 0;
  const objetivo = cuando.getTime();
  let mejor = 0;
  let distancia = Infinity;

  for (let i = 0; i < tiempos.length; i++) {
    // Open-Meteo manda "2026-08-19T12:00" sin zona, y es UTC.
    const t = Date.parse(`${tiempos[i]}:00Z`.replace(/(:\d\d):00Z$/, "$1:00Z"));
    if (Number.isNaN(t)) continue;
    const d = Math.abs(t - objetivo);
    if (d < distancia) {
      distancia = d;
      mejor = i;
    }
  }
  return mejor;
}
