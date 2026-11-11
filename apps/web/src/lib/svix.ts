/**
 * La verificación de un webhook firmado con Svix (el que usa Resend para `email.received`),
 * a mano con `crypto`: no se agrega el paquete por una sola función.
 *
 * Svix manda `svix-id`, `svix-timestamp` (segundos) y `svix-signature` (`v1,<base64>`, a veces
 * varias separadas por espacios, durante una rotación de secreto). La firma es el HMAC-SHA256
 * de `${id}.${timestamp}.${cuerpo}` con el secreto —el `whsec_…` sin el prefijo, decodificado
 * de base64—, y se calcula sobre el **cuerpo crudo**, tal como llegó: parsear y volver a
 * serializar cambiaría los bytes.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** Cuánto puede diferir el reloj del mensaje del nuestro: 5 minutos, como pide Svix contra repeticiones. */
export const TOLERANCIA_SVIX_S = 5 * 60;

export interface FirmaSvix {
  id: string | null;
  timestamp: string | null;
  firma: string | null;
}

export function verificarSvix(
  { id, timestamp, firma }: FirmaSvix,
  cuerpo: string,
  secreto: string,
  ahoraS: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!id || !timestamp || !firma || !secreto) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(ahoraS - Number(timestamp)) > TOLERANCIA_SVIX_S) return false;

  const clave = Buffer.from(secreto.replace(/^whsec_/, ""), "base64");
  if (clave.length === 0) return false;
  const esperada = createHmac("sha256", clave).update(`${id}.${timestamp}.${cuerpo}`).digest();

  for (const candidata of firma.split(" ")) {
    const [version, valor] = candidata.split(",");
    if (version !== "v1" || !valor) continue;
    const recibida = Buffer.from(valor, "base64");
    if (recibida.length === esperada.length && timingSafeEqual(recibida, esperada)) return true;
  }
  return false;
}

/** Lo contrario, para los tests y el flujo de prueba: arma la cabecera de una firma válida. */
export function firmarSvix(id: string, timestamp: number | string, cuerpo: string, secreto: string): string {
  const clave = Buffer.from(secreto.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", clave).update(`${id}.${timestamp}.${cuerpo}`).digest("base64")}`;
}
