/**
 * Los hitos de horas de un perfil público.
 *
 * Salen sólo del total de horas, a propósito: lo público de un piloto son sus horas
 * (decisión de Federico, 2026-09-22), así que un hito no puede revelar nada que las
 * horas no digan ya —ni aeródromos, ni fechas, ni aeronaves—.
 */

export const HITOS_DE_HORAS = [50, 100, 150, 200, 250, 500, 1000] as const;

export interface EstadoHitos {
  /** Los hitos ya pasados, de menor a mayor. */
  alcanzados: number[];
  /** El próximo, o `null` si ya pasó todos. */
  proximo: number | null;
  /** Cuánto falta para el próximo, con un decimal. `null` si no hay próximo. */
  faltan: number | null;
  /** Avance entre el hito anterior (o cero) y el próximo, de 0 a 1. */
  avance: number;
}

export function estadoHitos(totalHoras: number): EstadoHitos {
  const total = Number.isFinite(totalHoras) ? Math.max(0, totalHoras) : 0;
  const alcanzados = HITOS_DE_HORAS.filter((h) => total >= h);
  const proximo = HITOS_DE_HORAS.find((h) => total < h) ?? null;
  if (proximo === null) return { alcanzados, proximo: null, faltan: null, avance: 1 };

  const anterior = alcanzados[alcanzados.length - 1] ?? 0;
  return {
    alcanzados,
    proximo,
    faltan: Number((proximo - total).toFixed(1)),
    avance: (total - anterior) / (proximo - anterior),
  };
}

/**
 * El hito que se cruzó al pasar de `antes` a `despues` horas, o `null`. Si un vuelo
 * cruzó dos a la vez —un piloto que cargó un vuelo largo con la apertura recién puesta—,
 * el más alto: es el que se festeja.
 *
 * Lo usa la Bitácora recién cargado un vuelo, con el mismo total que muestra el perfil
 * público (`estadisticas_publicas` del backend): lo volado sin simuladores, más la
 * apertura de PIC y SIC.
 */
export function hitoCruzado(antes: number, despues: number): number | null {
  if (!Number.isFinite(antes) || !Number.isFinite(despues) || despues <= antes) return null;
  // En décimas, como se guardan las horas: 49,9 + 0,1 tiene que dar 50 y no 49,99999.
  const a = Math.round(antes * 10);
  const d = Math.round(despues * 10);
  const cruzados = HITOS_DE_HORAS.filter((h) => a < h * 10 && h * 10 <= d);
  return cruzados.length ? cruzados[cruzados.length - 1] : null;
}
