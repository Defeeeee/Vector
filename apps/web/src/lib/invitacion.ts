import { normalizarHandle, problemaDelHandle } from "./handle";

/**
 * "Te invitó @fulano": quien abre el perfil de un piloto sin tener cuenta y después se
 * suma a Vector, cuando crea su @, ve la oferta de seguirlo. Es lo que hace que un link
 * mandado por WhatsApp termine en una conexión y no sólo en una cuenta nueva.
 *
 * Se guarda en el navegador de quien abrió el link (`localStorage`), no en el backend:
 * es sólo un recordatorio para esa persona. Vence a los 30 días, y el último perfil
 * abierto gana.
 */

export const CLAVE_INVITACION = "vector:invitacion";
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;

export function guardarInvitacion(handle: string, ahoraMs: number): string | null {
  const h = normalizarHandle(handle);
  if (problemaDelHandle(h)) return null;
  return JSON.stringify({ handle: h, desde: ahoraMs });
}

/** El @ que invitó, si sigue vigente y no es el propio. */
export function leerInvitacion(guardado: string | null, ahoraMs: number, miHandle: string | null): string | null {
  if (!guardado) return null;
  try {
    const d = JSON.parse(guardado) as { handle?: unknown; desde?: unknown };
    if (typeof d.handle !== "string" || typeof d.desde !== "number") return null;
    const h = normalizarHandle(d.handle);
    if (problemaDelHandle(h) || ahoraMs - d.desde > VIGENCIA_MS || d.desde > ahoraMs) return null;
    if (miHandle && normalizarHandle(miHandle) === h) return null;
    return h;
  } catch {
    return null;
  }
}
