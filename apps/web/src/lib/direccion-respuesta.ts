/**
 * La dirección a la que contesta la oficina: `plan-<id>-<firma>@respuestas.vector.fdiaznem.com.ar`
 * (o `@respuestas.vectoraero.ar`, ver `DOMINIO_RESPUESTAS`).
 *
 * Resend recibe los mails de ese subdominio y avisa al webhook (`/api/mail/entrante`); la
 * dirección dice de qué plan es la respuesta. La firma es un HMAC corto (10 hex) del id del
 * plan: sin ella cualquiera que conozca un id inventaría la dirección y haría sonar el
 * teléfono de otro piloto. Con el secreto de los barridos (`DOCUMENTS_ALERT_SECRET`) y una
 * etiqueta propia, como `baja-mail.ts`.
 *
 * La respuesta le sigue llegando directo al piloto (va en `to`/`cc`): esta dirección es
 * el `reply_to`, y el piloto va en copia.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** Los dominios de respuesta que existieron: los planes ya mandados contestan a cualquiera de ellos. */
const DOMINIOS_CONOCIDOS = ["respuestas.vector.fdiaznem.com.ar", "respuestas.vectoraero.ar"];

/**
 * El dominio con el que SALE un plan. Variable `DOMINIO_RESPUESTAS`; sin ella, el viejo, hasta
 * que `respuestas.vectoraero.ar` esté verificado en Resend (mudanza a vectoraero.ar, 2026-11).
 */
export const DOMINIO_RESPUESTAS = (process.env.DOMINIO_RESPUESTAS || DOMINIOS_CONOCIDOS[0]).trim().toLowerCase();

/** Los que el webhook acepta al leer: el de salida y los conocidos, sin repetir. */
export function dominiosAceptados(saliente: string = DOMINIO_RESPUESTAS): string[] {
  return [...new Set([saliente.toLowerCase(), ...DOMINIOS_CONOCIDOS])];
}

const ETIQUETA = "vector:plan-respuesta:";
const LARGO_FIRMA = 10;

export function firmaDelPlan(planId: string, secreto: string): string {
  return createHmac("sha256", secreto).update(ETIQUETA + planId.toLowerCase()).digest("hex").slice(0, LARGO_FIRMA);
}

/** `null` sin secreto o con un id que no es un UUID: el mail sale igual, con el piloto como `reply_to`. */
export function direccionDeRespuesta(planId: string, secreto: string | undefined): string | null {
  if (!secreto || !UUID.test(planId)) return null;
  return `plan-${planId.toLowerCase()}-${firmaDelPlan(planId, secreto)}@${DOMINIO_RESPUESTAS}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function regexDeDireccion(dominios: string[]): RegExp {
  const alt = dominios.map((d) => d.replace(/\./g, "\\.")).join("|");
  return new RegExp(`plan-([0-9a-f-]{36})-([0-9a-f]{${LARGO_FIRMA}})@(?:${alt})(?![a-z0-9-])`, "i");
}

const DIRECCION = regexDeDireccion(dominiosAceptados());

/**
 * El id del plan de la primera dirección de respuesta de una lista de destinatarios
 * (`"Nombre <plan-…@…>"` o la dirección sola), si su firma es válida. `null` si no hay
 * ninguna o la firma no coincide.
 */
export function planDeLosDestinatarios(destinatarios: (string | null | undefined)[], secreto: string): string | null {
  if (!secreto) return null;
  for (const d of destinatarios) {
    const m = DIRECCION.exec(d ?? "");
    if (!m || !UUID.test(m[1])) continue;
    const esperada = Buffer.from(firmaDelPlan(m[1], secreto));
    const recibida = Buffer.from(m[2].toLowerCase());
    if (esperada.length === recibida.length && timingSafeEqual(esperada, recibida)) return m[1].toLowerCase();
  }
  return null;
}
