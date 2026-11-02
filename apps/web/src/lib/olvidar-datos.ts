import { MENSAJES } from "./pwa";

/**
 * Borrar del teléfono lo que es del piloto.
 *
 * ## Por qué esto no puede vivir sólo en el service worker
 *
 * Porque **el botón "Cerrar Sesión" no pasa por `/api/auth/logout`**. Llama a la server
 * action `logout`, que es un `POST` a la URL de la página con un header `Next-Action`.
 * Y la regla de oro del `fetch` handler es no meterse con nada que no sea `GET`:
 * distinguir *qué* server action es implicaría hashear identificadores y leer un
 * stream de body, algo frágil y feo.
 *
 * O sea que un service worker que sólo interceptara esa URL **no borraría nada en el
 * caso más común**. Hay que avisarle, y por eso existe esta función.
 *
 * ## Y por qué el service worker no puede darse cuenta solo
 *
 * Porque las cookies de sesión son `httpOnly`: ni `document.cookie` ni la Cookie Store
 * API se las muestran. El service worker **no tiene forma de consultar si hay sesión**.
 *
 * ## Los tres disparadores
 *
 * 1. El botón, antes de invocar la acción.
 * 2. `/api/auth/logout` como `GET`, que es el camino de los 401 — lo maneja el propio
 *    service worker por URL.
 * 3. La landing y el login al montar, que es la red de seguridad: captura la sesión que
 *    el proxy declaró muerta, el refresh token vencido a los 30 días y las cookies
 *    borradas a mano.
 */

/** Cuánto se espera la confirmación antes de seguir igual. */
const ESPERA_MS = 500;

/**
 * Le pide al service worker que borre los caches personales y **espera** la respuesta.
 *
 * Primero se borra y después se sale: si la acción de salir falla por red, el teléfono
 * ya quedó limpio, que es el orden correcto. El timeout evita colgar el botón si el
 * worker no está o no contesta — sin service worker no hay nada guardado que borrar.
 */
export async function olvidarDatosPersonales(): Promise<void> {
  try {
    const registro = await navigator.serviceWorker?.ready;
    const worker = registro?.active;
    if (!worker) return;

    await new Promise<void>((listo) => {
      const canal = new MessageChannel();
      const reloj = setTimeout(listo, ESPERA_MS);
      canal.port1.onmessage = () => {
        clearTimeout(reloj);
        listo();
      };
      worker.postMessage({ tipo: MENSAJES.olvidarDatosPersonales }, [canal.port2]);
    });
  } catch {
    // Sin service worker, en modo privado, o con la API ausente: no hay nada guardado.
  }
}
