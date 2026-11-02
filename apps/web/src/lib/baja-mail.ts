/**
 * El link para dejar de recibir un mail (el resumen del mes o las novedades), firmado.
 *
 * El mail lleva `?u=<id de la cuenta>&t=<firma>`, y la firma es un HMAC del id con el
 * secreto de los barridos. Así la baja funciona **sin iniciar sesión** —que es lo que
 * se espera de un "no recibirlo más"— y nadie puede dar de baja a otro cambiando el id
 * del link. La etiqueta adelante separa esta firma de cualquier otro uso del secreto.
 *
 * No vence a propósito: un link de baja de un mail de hace un año tiene que andar.
 */
import { createHmac, timingSafeEqual } from "crypto";

/**
 * De qué mail es la baja. Cada uno tiene la suya: darse de baja del resumen del mes no
 * saca de las novedades, ni al revés.
 */
export type TipoBaja = "resumen" | "novedades";

/** Lo que firma cada baja. La del resumen no cambia: sus links ya salieron en mails. */
const ETIQUETAS: Record<TipoBaja, string> = {
  resumen: "vector:resumen-mensual:baja:",
  novedades: "vector:novedades:baja:",
};

export const tipoDeBaja = (valor: string | null | undefined): TipoBaja => (valor === "novedades" ? "novedades" : "resumen");

export function firmaBaja(userId: string, secreto: string, tipo: TipoBaja = "resumen"): string {
  return createHmac("sha256", secreto).update(ETIQUETAS[tipo] + userId).digest("base64url");
}

export function firmaValida(userId: string, firma: string, secreto: string, tipo: TipoBaja = "resumen"): boolean {
  if (!userId || !firma || !secreto) return false;
  const a = Buffer.from(firmaBaja(userId, secreto, tipo));
  const b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** La página de la baja (GET, sólo muestra un botón) y su acción (POST). */
export function linksDeBaja(appUrl: string, userId: string, secreto: string, tipo: TipoBaja = "resumen") {
  const q = new URLSearchParams({
    u: userId,
    t: firmaBaja(userId, secreto, tipo),
    // El del resumen no lleva `m`, como los links que ya salieron.
    ...(tipo === "resumen" ? {} : { m: tipo }),
  }).toString();
  return { pagina: `${appUrl}/mail/baja?${q}`, unClick: `${appUrl}/api/mail/baja?${q}` };
}
