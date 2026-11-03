import { capturaVigente } from "./pwa";

/**
 * Cuánto se reusa lo que el navegador ya le trajo a ANAC antes de volver a preguntar
 * (`lib/anac-navegador.ts`).
 *
 * **Pedirle a ANAC lo menos posible** (Federico, 2026-11-02): ANAC bloquea las IPs que le
 * hacen muchos pedidos o que no parecen un navegador, y el 2026-11-02 bloqueó también la de
 * la Mac de Federico después de un día de pruebas. Si un piloto quedara bloqueado por usar
 * la ficha, también se quedaría sin el CAD. Así que lo guardado se usa mientras sirva:
 *
 * - **MADHEL, 24 h.** Es la ficha del aeródromo: pistas, frecuencias, teléfonos. Cambia muy
 *   de vez en cuando.
 * - **NOTAM, 15 min.** Pueden salir en cualquier momento, pero un cuarto de hora es lo que
 *   tarda alguien en mirar la ficha y salir a volar; y la pantalla dice de cuándo son.
 */
export const VIGENCIA_MADHEL_MIN = 24 * 60;
export const VIGENCIA_NOTAM_MIN = 15;

/** ¿Hay que volver a preguntarle a ANAC? `capturadoEn` es ISO o `null` si no hay nada guardado. */
export function hayQuePreguntar(capturadoEn: string | null, vigenciaMin: number, ahora: Date): boolean {
  return !capturaVigente(capturadoEn, vigenciaMin, ahora);
}

/**
 * De cuándo son los NOTAM que se muestran, si no son de recién: "hace 12 min", "hace 3 h".
 * Relativo y no la hora, para no formatear una hora local en el cliente (invariante 1).
 */
export function antiguedad(capturadoEn: string | null | undefined, ahora: Date): string | null {
  const t = capturadoEn ? Date.parse(capturadoEn) : NaN;
  if (Number.isNaN(t)) return null;
  const min = Math.floor((ahora.getTime() - t) / 60000);
  if (min < 2) return null;
  return min < 90 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
}
