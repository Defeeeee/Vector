/**
 * El número de WhatsApp del copiloto de Vector: el que el piloto tiene que agendar.
 *
 * Hasta el 2026-09-24 no figuraba en ningún lado de la app: el piloto guardaba su número
 * en el Hangar, pero nadie le decía a cuál escribirle. Es público —es un número de
 * atención—, así que va en el código y no en una variable de entorno. Número de
 * Kapso, dado por Federico el 2026-09-24.
 */
export const NUMERO_COPILOTO = process.env.NEXT_PUBLIC_WHATSAPP_COPILOTO || "12015867983";

/** `+1 (201) 586-7983`, para mostrarlo. */
export const NUMERO_COPILOTO_VISIBLE = "+1 (201) 586-7983";

/** El link que abre el chat con el copiloto, con un primer mensaje ya escrito. */
export function linkCopiloto(texto = "Hola Vector"): string | null {
  const n = NUMERO_COPILOTO.replace(/\D/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}
