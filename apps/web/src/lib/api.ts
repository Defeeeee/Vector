import { getSessionToken } from "@/actions/auth";
import { redirect } from "next/navigation";

/*
  Causa real de la caída del 2026-08-27: las rutas del backend viven bajo `/api/`
  (`/api/profiles`, `/api/dashboard`...) y **nginx agrega ese prefijo solo** cuando la
  llamada entra por el dominio público. `127.0.0.1:7477` a secas salta a nginx —la
  conexión de red andaba perfecta— pero cada pedido de acá (`/profiles`, `/dashboard`)
  le llegaba al backend sin el `/api/` que necesita, y devolvía 404 en absolutamente
  todo. Confirmado en el VPS: `curl http://127.0.0.1:7477/api/health` → 200; sin el
  `/api`, 404. Local por defecto, con el prefijo puesto.
*/
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

/**
 * Cuánto se espera antes de dar por muerta una respuesta.
 *
 * **El primer número acá fue 8 s y estaba mal, medido contra producción.** Lo puso este
 * mismo archivo sin medir nada, y rompió `/api/share-card` en CI: la tarjeta hace dos
 * llamadas con `cache: "no-store"` —a propósito, para no dibujar un total viejo en una
 * imagen que no puede volver atrás— y el camino completo tarda **12,6 s** contra el
 * backend real. Los 8 s las abortaban y la tarjeta salía 502.
 *
 * 15 s es holgado para lo que de verdad tarda un render de página —3,5 s medidos en el
 * mismo entorno— y sigue acotando el caso que el timeout existe para atajar: un backend
 * que acepta la conexión y no contesta nunca.
 */
const TIMEOUT_POR_DEFECTO_MS = 15000;

/**
 * Para el generador de imágenes, que legítimamente tarda más y donde una tarjeta lenta
 * es infinitamente mejor que ninguna tarjeta.
 */
export const TIMEOUT_IMAGEN_MS = 25000;

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  {
    timeoutMs = TIMEOUT_POR_DEFECTO_MS,
    anonimo = false,
  }: {
    timeoutMs?: number;
    /**
     * Pedir como alguien sin sesión, aunque la cookie esté. Lo usa la vista previa
     * del perfil público (`/u/[handle]/opengraph-image`): esa imagen la ve cualquiera
     * que reciba el link, así que tiene que mostrar lo que ve un anónimo y nunca lo
     * que ve un seguidor que justo la abrió.
     */
    anonimo?: boolean;
  } = {}
) {
  const token = anonimo ? undefined : await getSessionToken();

  /*
    Con un `FormData` no va `Content-Type`: `fetch` lo arma solo, con el `boundary` del
    multipart, y forzar `application/json` hacía que el backend rechazara toda subida de
    fotos. Se reconoce también por el nombre del constructor porque el `FormData` que
    devuelve `req.formData()` en una ruta de Next puede ser de otra copia de undici que la
    del global, y ahí `instanceof` da falso.
  */
  const esMultipart = options.body instanceof FormData || options.body?.constructor?.name === "FormData";
  const headers = {
    ...(esMultipart ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Briefly cache GETs so switching between dashboard tabs a few seconds apart
  // reuses the same response instead of re-hitting the backend on every nav.
  // Mutations (anything with an explicit method) are never cached. Server
  // actions already call revalidatePath after writes, which busts this
  // immediately, so it doesn't cause stale data after logging/editing.
  const isMutation = !!options.method && options.method.toUpperCase() !== "GET";
  const defaultCache = isMutation ? {} : { next: { revalidate: 20 } };

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      /*
        Un backend que acepta la conexión y no contesta cuelga el render hasta que la
        plataforma lo mate. "No explotar" con treinta segundos de pantalla en blanco
        sigue siendo explotar, sólo que despacio. El timeout cae en el mismo `catch` de
        abajo y produce el mismo 503.

        El presupuesto es por llamador, no único: ver `TIMEOUT_POR_DEFECTO_MS`.
      */
      signal: AbortSignal.timeout(timeoutMs),
      ...defaultCache,
      ...options,
      headers,
    });
  } catch (error) {
    /*
      Sin red, `fetch` tira `TypeError: fetch failed` y esa excepción sube al render
      del server component. Como `dashboard/layout.tsx` también llama acá sin
      protección, **una falla de red reventaba el layout y con él las trece páginas
      del dashboard**: pantalla en blanco con "Application error".

      Devolver un `Response` sintético en vez de propagar es lo que evita eso, y la
      forma importa: los doce llamadores ya hacen `if (!response.ok)` y
      `if (response.status === 401)`. Un 503 fluye por ese camino **sin tocar un solo
      call site**, y en `dashboard/page.tsx` cae solo en el patrón `unavailable` que
      ya distingue "no hay datos" de "no pudimos preguntar".

      El cuerpo va en JSON —y no vacío— para que un llamador descuidado que haga
      `.json()` sin mirar el status reciba un objeto y no una excepción nueva.
    */
    console.error(`apiFetch: sin respuesta de ${endpoint}:`, error);
    return new Response(
      JSON.stringify({ detail: "No se pudo contactar al servidor", offline: true }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (response.status === 401) {
    console.log(`apiFetch: 401 Unauthorized for ${endpoint}.`);
    // We don't redirect here anymore because it causes "Cookies can only be modified" error
    // when called during Server Component rendering.
    // The proxy or the component should handle authentication state.
  }

  return response;
}
