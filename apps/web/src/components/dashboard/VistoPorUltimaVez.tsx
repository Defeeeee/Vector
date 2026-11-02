"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { CACHE_PAGINAS, HEADER_CAPTURA, claveDeLoServido } from "@/lib/pwa";

/**
 * "Última vez que pudimos actualizar: jueves 14:20."
 *
 * ## Por qué la página lee el cache directamente
 *
 * Se descartaron las dos alternativas obvias.
 *
 * **Inyectar el timestamp en el HTML guardado** obliga al service worker a bufferear el
 * documento entero antes del primer byte —chau streaming— y mete un parser de HTML a
 * mano entre Next y el navegador. El día que Next cambie cómo emite su payload, eso se
 * rompe de una forma difícil de diagnosticar.
 *
 * **Preguntarle al service worker por `postMessage`** depende de que esté vivo, y el
 * service worker **se muere entre eventos**. La respuesta sería "no sé" — y "no sé"
 * degradando a "asumamos que está fresco" es exactamente lo que este proyecto prohíbe.
 *
 * El Cache API está disponible en `window`, no sólo en el worker. Se abre la caja y se
 * lee el header que el service worker estampó **al guardar**.
 *
 * ## Por qué se lee una clave aparte, y no la entrada de la página
 *
 * La entrada de `vector-paginas` para esta URL puede reescribirse **después** de que
 * el service worker ya respondió: cuando gana la copia guardada, el pedido de red que
 * perdió la carrera de 3 s sigue vivo en `waitUntil` y, al terminar, pisa esa misma
 * entrada con una fecha nueva — justo mientras este componente recién está montando.
 *
 * Leer esa entrada directamente tenía el modo de falla que el resto de este archivo
 * dice que no puede pasar: el sello fresco del perdedor tapaba la fecha real de lo que
 * el piloto tenía en pantalla, y el cartel se callaba sobre una página vieja.
 *
 * `claveDeLoServido` es una entrada que el service worker escribe **antes** de
 * responder, con la fecha de lo que decidió servir en esa navegación puntual — y a la
 * que ningún pedido posterior de esta misma navegación vuelve a tocar. Al ser un
 * `Response` que arma el propio worker, no lleva el `Vary` que trae el HTML de Next, así
 * que ni hace falta `ignoreVary` para encontrarla.
 *
 * ## Y por qué eso alcanza, que es la parte no obvia
 *
 * Con red primero **no hace falta saber si la página vino del cache**: las dos
 * respuestas posibles se distinguen solas.
 *
 * - Si sirvió la red, la marca es de hace segundos → por debajo del umbral, no se
 *   muestra nada.
 * - Si sirvió la copia guardada, la marca es la fecha de esa copia → se muestra.
 * - Si no hay marca, no hay nada que decir, que es el comportamiento de siempre.
 *
 * El único modo de falla es callarse sobre una página de pocos segundos. **Falla del
 * lado seguro**, y no depende de que el worker esté despierto.
 */

/** Por debajo de esto la página es de recién y no hay nada que avisar. */
const UMBRAL_S = 20;

/** Un intento de refrescar por pantalla y por minuto: ver "Si hay red" más abajo. */
const REINTENTO_MS = 60_000;

/**
 * ## Si hay red, se refresca solo (2026-09-24)
 *
 * El cartel aparecía con internet y en la computadora: el service worker espera a la red
 * **3 s** (`ESPERA_MS`), y un server lento —Supabase está en us-east-1— pierde esa
 * carrera sin que falte conexión. Además quedaba puesto toda la sesión: este componente
 * vive en el layout, leía el cache una sola vez, y las pantallas siguientes llegan por
 * RSC, que va directo a la red (`estrategiaPara` las ignora), o sea frescas.
 *
 * Ahora:
 * - Con `navigator.onLine`, se pide la versión nueva con `router.refresh()` (RSC, red) y
 *   al terminar el cartel se va, porque lo que hay en pantalla ya no es la copia.
 * - Al cambiar de pantalla el cartel se va, por lo mismo.
 * - Un intento por pantalla y por minuto (`sessionStorage`): si el server está caído de
 *   verdad, Next puede caer a una navegación dura, el worker vuelve a servir la copia y
 *   sin el tope sería un bucle de recargas. Sin red, el cartel se queda: es para eso.
 */
export default function VistoPorUltimaVez() {
  const [capturada, setCapturada] = useState<Date | null>(null);
  const [refrescando, startTransition] = useTransition();
  const refrescoPedido = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const primerPath = useRef(pathname);

  // Otra pantalla llegó por la red (RSC): lo que hay en pantalla ya no es la copia.
  useEffect(() => {
    if (pathname !== primerPath.current) setCapturada(null);
  }, [pathname]);

  // El refresco terminó: la pantalla tiene los datos de ahora.
  useEffect(() => {
    if (refrescoPedido.current && !refrescando) setCapturada(null);
  }, [refrescando]);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        if (typeof caches === "undefined") return;
        const cache = await caches.open(CACHE_PAGINAS);
        // La misma clave que el service worker calcula en `marcarLoServido`. Es una
        // entrada propia, no la de la página, así que un `match` simple alcanza sin
        // `ignoreVary`: el `Response` lo arma el propio worker y no lleva el `Vary`
        // que trae el HTML de Next.
        const marca = await cache.match(claveDeLoServido(window.location.pathname));
        const sello = marca?.headers.get(HEADER_CAPTURA);
        if (!sello || !vivo) return;

        const cuando = new Date(sello);
        if (Number.isNaN(cuando.getTime())) return;
        if (Date.now() - cuando.getTime() < UMBRAL_S * 1000) return;
        setCapturada(cuando);

        if (typeof navigator !== "undefined" && navigator.onLine) {
          const clave = `vector:refresco:${window.location.pathname}`;
          let ultimo = 0;
          try {
            ultimo = Number(sessionStorage.getItem(clave)) || 0;
            sessionStorage.setItem(clave, String(Date.now()));
          } catch {
            // Sin sessionStorage no hay tope: no se intenta, y el cartel se queda.
            return;
          }
          if (Date.now() - ultimo < REINTENTO_MS) return;
          refrescoPedido.current = true;
          startTransition(() => router.refresh());
        }
      } catch {
        // Safari en modo privado tira al tocar storage. Sin el cartel la pantalla
        // funciona igual; con una excepción no cargaría.
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  if (!capturada) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 mb-6">
      <Archive className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Esto es una foto guardada en el teléfono
        </p>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5">
          Última vez que pudimos actualizar:{" "}
          <span className="data font-semibold">{fechaLarga(capturada)}</span>.{" "}
          {refrescando ? "Actualizando…" : "Puede haber vuelos cargados después."}
        </p>
      </div>
    </div>
  );
}

/**
 * "viernes 21/08, 19:07".
 *
 * Fecha absoluta y no relativa: un "hace 3 h" obliga al piloto a hacer la cuenta justo
 * cuando menos ganas tiene. Y en **24 horas**, como todo el resto de la app — el
 * `es-AR` por defecto devuelve "07:07 p. m.", que además arrastra un punto final y
 * dejaba la frase terminando en "..".
 */
function fechaLarga(d: Date): string {
  const dia = d.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dia}, ${hora}`;
}
