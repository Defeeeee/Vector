/**
 * Si un error es el mecanismo interno de Next para un `redirect()` dentro de una
 * server action, y no una falla de verdad.
 *
 * ## Por qué existe
 *
 * Next tira `redirect()` como una excepción con un `digest` que empieza en
 * `"NEXT_REDIRECT"`, y el runtime del cliente **rechaza** la promesa de la action
 * con ese mismo error para que lo maneje el `RedirectBoundary`. Un `catch` que no
 * distingue este caso de una falla real —de red, de validación— pinta el redirect
 * como si el vuelo, la aeronave o lo que sea no se hubiera guardado. Es exactamente
 * el bug que tuvo `logFlight`: cada carga exitosa terminaba en un cartel de error
 * con el texto `NEXT_REDIRECT`.
 *
 * ## Por qué está en un solo lugar y no eran ocho copias
 *
 * `e?.digest?.startsWith("NEXT_REDIRECT")` estaba escrito **ocho veces** —cuatro en
 * `actions/flight.ts`, tres en `actions/planned-flight.ts`, una en
 * `FlightLogForm.tsx`— y ninguna tenía un test. Es la misma lección que dejó
 * `splitRoute`, que en este repo llegó a estar escrita cinco veces con cuatro
 * criterios distintos: una condición que se repite a mano es una condición que se
 * separa en silencio la primera vez que alguien la copia mal.
 */
export function esErrorDeRedirect(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
