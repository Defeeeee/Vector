/**
 * Si los puntos de la ruta se resolvieron con el catálogo de a bordo.
 *
 * ## Por qué esto existe
 *
 * Porque el planificador puede resolver una ruta **sin señal**, y cuando lo hace el
 * piloto tiene derecho a saberlo. No porque el resultado sea peor —es el mismo
 * algoritmo y los mismos datos— sino porque el catálogo de a bordo **tiene Argentina
 * sola**: un código extranjero que con señal resuelve, sin señal no. Sin el aviso, eso
 * se ve como "el punto no existe".
 *
 * Es la misma disciplina de `SinConexionBanner` y del `unavailable` del dashboard:
 * cuando la respuesta viene de otro lado, se dice de dónde.
 *
 * ## Por qué un módulo con suscripción y no un `useState`
 *
 * Porque quien se entera y quien lo muestra están lejos: el que ve la respuesta es
 * cada campo de punto —hay hasta doce— y el que dibuja el aviso es el planificador,
 * una vez. Pasar un callback por doce campos para que suban un booleano sería peor que
 * esto.
 *
 * El estado vive en el módulo y no en un contexto de React porque **no hay nada que
 * decidir**: es un dato de la sesión de la pestaña, no del árbol.
 */

let resolvioLocal = false;
const oyentes = new Set<() => void>();

/**
 * Lo llama quien recibe una respuesta de `/api/puntos` con `offline: true`, que es la
 * marca que pone el service worker cuando resolvió con el catálogo precacheado.
 */
export function marcarOrigenLocal(): void {
  if (resolvioLocal) return;
  resolvioLocal = true;
  for (const oyente of oyentes) oyente();
}

/**
 * Vuelve a "con señal" cuando una respuesta llega de la red.
 *
 * Sin esto, el aviso se quedaría pegado hasta recargar: el piloto recupera la señal,
 * el punto siguiente resuelve contra el servidor, y la pantalla seguiría diciendo que
 * está resolviendo de a bordo. Un cartel que dejó de ser cierto es peor que ninguno.
 */
export function marcarOrigenRemoto(): void {
  if (!resolvioLocal) return;
  resolvioLocal = false;
  for (const oyente of oyentes) oyente();
}

/** Para `useSyncExternalStore`. */
export function suscribirOrigen(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function leerOrigenLocal(): boolean {
  return resolvioLocal;
}

/**
 * Anota el origen mirando el cuerpo de una respuesta de `/api/puntos`.
 *
 * `offline: true` es la misma convención que ya usa el 503 sintético de `apiFetch`
 * (`src/lib/api.ts`), que hasta ahora nadie leía. Acá estrena su primer lector.
 */
export function anotarOrigen(cuerpo: unknown): void {
  const local = Boolean((cuerpo as { offline?: unknown } | null)?.offline);
  if (local) marcarOrigenLocal();
  else marcarOrigenRemoto();
}
