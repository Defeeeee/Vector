import type { Flight } from "@/types";

/**
 * Qué tan seguido volás, y cómo viene este mes contra los anteriores.
 *
 * Dos preguntas que el dashboard tenía los datos para contestar y no contestaba.
 * El heatmap ya dibuja la actividad, pero dibujarla no es lo mismo que decirla: un
 * piloto mira una grilla de cuadraditos y no sabe si viene mejor o peor que en
 * marzo.
 *
 * Todo se calcula sobre las fechas ISO de los vuelos, comparando strings y sin
 * construir un `Date` local: el server corre en UTC y el navegador en UTC−3, y
 * cualquier cuenta que pase por `new Date()` puede caer en días distintos de los
 * dos lados y romper la hidratación. Es un error que este repo ya pagó dos veces.
 */

/** El lunes de la semana de `iso`, como "YYYY-MM-DD". Todo en UTC. */
export function lunesDe(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  // getUTCDay: 0 es domingo. La semana aeronáutica no existe; se usa lunes porque
  // es como se habla de "esta semana" en Argentina.
  const dia = new Date(t).getUTCDay();
  const offset = dia === 0 ? 6 : dia - 1;
  return new Date(t - offset * 86_400_000).toISOString().slice(0, 10);
}

export interface Racha {
  /** Semanas consecutivas con al menos un vuelo, contando hacia atrás desde hoy. */
  semanas: number;
  /** `true` si la racha incluye la semana en curso; `false` si viene de la pasada. */
  incluyeEstaSemana: boolean;
}

/**
 * Semanas seguidas volando.
 *
 * **La semana en curso no corta la racha si todavía no volaste.** Es martes y no
 * volaste: la racha sigue viva desde la semana pasada, porque te quedan cinco días.
 * Contarla como cortada convertiría el número en un reproche los lunes, que es
 * exactamente lo que haría que nadie lo mire.
 */
export function racha(flights: Flight[], hoyIso: string): Racha {
  const semanas = new Set(flights.filter((f) => f.date).map((f) => lunesDe(f.date)));
  if (semanas.size === 0) return { semanas: 0, incluyeEstaSemana: false };

  const estaSemana = lunesDe(hoyIso);
  const incluyeEstaSemana = semanas.has(estaSemana);

  // Si esta semana todavía no tiene vuelos, la racha se cuenta desde la anterior.
  let cursor = incluyeEstaSemana
    ? estaSemana
    : new Date(Date.parse(`${estaSemana}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);

  let n = 0;
  while (semanas.has(cursor)) {
    n += 1;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  }
  return { semanas: n, incluyeEstaSemana };
}

export interface ComparacionMensual {
  /** Horas de este mes. */
  horas: number;
  /** Promedio de los meses anteriores considerados. */
  promedio: number;
  /** Cuántos meses entraron en el promedio. `0` si no hay con qué comparar. */
  meses: number;
  /** Diferencia contra el promedio, en horas. Positivo = mejor mes. */
  diferencia: number;
}

/**
 * Este mes contra el promedio de los anteriores.
 *
 * **Los meses sin volar cuentan como cero y eso es a propósito.** Promediar sólo
 * los meses con actividad daría una vara artificialmente alta: alguien que voló en
 * marzo y en agosto no tiene un promedio de sus dos mejores meses, tiene seis meses
 * de los cuales cuatro fueron cero.
 *
 * El mes en curso nunca entra en su propio promedio.
 */
export function compararConElPromedio(
  flights: Flight[],
  hoyIso: string,
  mesesAtras = 6
): ComparacionMensual {
  const mesActual = hoyIso.slice(0, 7);

  const horasDe = (mes: string) =>
    flights.reduce((acc, f) => (f.date?.startsWith(mes) ? acc + (f.duration || 0) : acc), 0);

  const [y, m] = mesActual.split("-").map(Number);
  const anteriores: string[] = [];
  for (let i = 1; i <= mesesAtras; i++) {
    const total = y * 12 + (m - 1) - i;
    anteriores.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }

  // Sin un solo vuelo antes de este mes no hay con qué comparar, y un promedio de
  // ceros diría "vas 8 horas mejor que siempre" en el primer mes de uso.
  const hayHistoria = anteriores.some((mes) => horasDe(mes) > 0);
  if (!hayHistoria) return { horas: horasDe(mesActual), promedio: 0, meses: 0, diferencia: 0 };

  const promedio = anteriores.reduce((acc, mes) => acc + horasDe(mes), 0) / mesesAtras;
  const horas = horasDe(mesActual);
  return { horas, promedio, meses: mesesAtras, diferencia: horas - promedio };
}
