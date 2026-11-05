/**
 * "¿Cuánto me queda?" hacia adelante (3.11.0): al ritmo de los últimos 30 días, hasta cuándo
 * alcanza el pack de horas, o para cuántas horas alcanza el saldo.
 *
 * Es una estimación y la pantalla lo dice ("al ritmo de…", "~"). Sin vuelos en los últimos 30
 * días no hay ritmo, y entonces no se estima nada (invariante 2: no saber no es "nunca se acaba").
 */

const DIA_MS = 86_400_000;

/** Por debajo de esto, el pack se avisa en ámbar: no alcanza para un vuelo de escuela típico. */
export const POCO_PACK_HORAS = 1;

export interface AlcancePack {
  /** "YYYY-MM-DD" en que se terminaría al ritmo actual, o `null` si no hay ritmo para estimarlo. */
  fecha: string | null;
  /** Horas por mes al ritmo de los últimos 30 días. */
  ritmoMensual: number;
  /** Queda menos de una hora. */
  poco: boolean;
}

export function alcanceDelPack(restan: number, horasUltimos30: number, hoyIso: string): AlcancePack {
  const poco = restan < POCO_PACK_HORAS;
  if (!(horasUltimos30 > 0) || !(restan > 0)) return { fecha: null, ritmoMensual: Math.max(0, horasUltimos30), poco };
  const dias = Math.round(restan / (horasUltimos30 / 30));
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  const fecha = new Date(hoy + dias * DIA_MS).toISOString().slice(0, 10);
  return { fecha, ritmoMensual: horasUltimos30, poco };
}

/** Para cuántas horas alcanza el saldo al precio por hora del mes, o `null` si no se sabe o no alcanza. */
export function horasQueAlcanzaElSaldo(saldo: number, porHora: number | null): number | null {
  if (!(saldo > 0) || !porHora || !(porHora > 0)) return null;
  return saldo / porHora;
}
