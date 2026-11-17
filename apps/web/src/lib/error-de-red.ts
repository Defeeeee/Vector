/**
 * Si un error es de **red** (sin señal) y no de validación ni del servidor (2026-11-17).
 *
 * Sin red, una server action de Next es un POST que no sale: el navegador tira un `TypeError`
 * ("Failed to fetch", "Load failed" en Safari, "NetworkError…" en Firefox). Hasta hoy eso llegaba
 * al piloto como el texto crudo del error o como el cartel genérico. Con esto, los formularios
 * dicen la verdad: "Necesita señal".
 *
 * Puro y sin DOM: `online` se pasa de afuera (`navigator.onLine`) para poder testearlo.
 */
export const MENSAJE_NECESITA_SENAL = "Necesita señal: no hay conexión en este momento. Probá de nuevo cuando vuelva.";

const PATRONES_DE_RED = /failed to fetch|load failed|networkerror|network request failed|fetch failed|network connection was lost|internet connection appears to be offline|err_internet_disconnected|err_network/i;

export function esErrorDeRed(error: unknown, online?: boolean): boolean {
  if (online === false) return true;
  if (error === null || typeof error !== "object") return false;
  // El redirect interno de Next no es una falla (ver `redirect-error.ts`).
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return false;
  const mensaje = (error as { message?: unknown }).message;
  if (error instanceof TypeError) return typeof mensaje !== "string" || PATRONES_DE_RED.test(mensaje) || mensaje === "";
  return typeof mensaje === "string" && PATRONES_DE_RED.test(mensaje);
}

/** El texto para mostrar en un `catch`: "Necesita señal" si fue la red, o el del error, o el de respaldo. */
export function mensajeDeError(error: unknown, respaldo: string, online?: boolean): string {
  if (esErrorDeRed(error, online)) return MENSAJE_NECESITA_SENAL;
  const m = error instanceof Error ? error.message : typeof error === "object" && error ? (error as { message?: unknown }).message : null;
  return typeof m === "string" && m ? m : respaldo;
}
