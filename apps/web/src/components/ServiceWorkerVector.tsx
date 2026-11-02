"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MENSAJES } from "@/lib/pwa";

/**
 * Registra el service worker, ofrece la actualización y expone la vía de escape.
 *
 * Va en el layout raíz y no en el del dashboard, por dos motivos. El service worker
 * tiene alcance de origen entero, así que registrarlo desde adentro del dashboard
 * sería registrarlo tarde; y sobre todo, **`?sw=reset` tiene que funcionar desde una
 * pantalla que no sea el dashboard** — si el dashboard es justamente lo que quedó
 * roto, no se puede pedir que el remedio viva ahí adentro.
 *
 * No dibuja nada salvo cuando hay una versión esperando.
 */
export default function ServiceWorkerVector() {
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    /*
      **La vía de escape va primero y no depende del service worker.**

      Un service worker roto puede no contestar un `postMessage` nunca, así que este
      camino no le pide nada: desregistra todo lo que haya y borra todos los caches
      **desde la página**, que puede hacer las dos cosas por su cuenta. El mensaje
      `autodestruir` existe igual para los casos en que sí responde, pero acá no se
      usa: cuando estás usando el botón de pánico, ya no confiás en el paciente.
    */
    const sw = new URLSearchParams(window.location.search).get("sw");

    /*
      Después del reseteo se aterriza acá, y esta carga **no vuelve a registrar**.

      Sin esta parada, la recarga registraba de nuevo al instante y quedaba
      indistinguible un desregistro que funcionó de uno que no: en las dos pantallas
      se ve un service worker activo. Una vía de escape que no se puede comprobar no
      es una vía de escape. Acá el piloto —o el test— ve el origen sin nada, y la
      próxima navegación normal registra la versión que esté publicada.
    */
    if (sw === "limpio") return;

    if (sw !== null) {
      (async () => {
        try {
          const registros = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registros.map((r) => r.unregister()));
          if ("caches" in window) {
            const nombres = await caches.keys();
            await Promise.all(nombres.map((n) => caches.delete(n)));
          }
        } catch {
          // Safari en modo privado tira al tocar storage. Que falle el borrado no
          // puede impedir que la página cargue: recargar sin service worker ya es
          // la mitad del arreglo.
        }
        window.location.replace("/?sw=limpio");
      })();
      return;
    }

    // En desarrollo no se registra: `public/sw.js` lo genera `npm run build`, así
    // que en `next dev` no existe, y un 404 dejaría un registro fallido dando vueltas.
    if (process.env.NODE_ENV !== "production") return;

    let cancelado = false;

    (async () => {
      try {
        /*
          `updateViaCache: "none"` obliga a que el propio `sw.js` se pida a la red y
          no salga del cache HTTP del navegador, que si no puede servir el viejo
          hasta 24 h. Es la mitad de la mitigación; la otra mitad es el
          `Cache-Control: no-cache` que le pone `next.config.js`.
        */
        const registro = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        const mirar = () => {
          if (cancelado) return;
          if (registro.waiting) setEsperando(registro.waiting);
        };

        mirar();
        registro.addEventListener("updatefound", () => {
          const nuevo = registro.installing;
          if (!nuevo) return;
          nuevo.addEventListener("statechange", () => {
            // `installed` con un controlador ya presente significa "hay una versión
            // nueva lista y esperando". Sin controlador es la primera instalación,
            // que no hay que anunciar.
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) mirar();
          });
        });
      } catch {
        // Un registro fallido no puede romper la app: sin service worker, Vector
        // funciona exactamente como funcionaba antes de todo esto.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (!esperando) return null;

  /*
    La versión nueva **no se activa sola**.

    Activarla debajo de una pestaña abierta le cambia el precache abajo de los pies:
    el próximo pedazo de la app que se cargue perezosamente —el mapa, los gráficos—
    puede no existir más en el build nuevo, y el piloto se come un error en la cara.
    Así que se pregunta. Y como recargar tira lo que esté escrito sin guardar, se
    pregunta con un botón y no con un contador.
  */
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))]">
      <div className="flex items-center gap-3 rounded-2xl border border-aviation-blue/20 bg-white dark:bg-zinc-900 px-4 py-3 shadow-lg">
        <span className="p-2 rounded-xl bg-aviation-blue/10 text-aviation-blue shrink-0">
          <RefreshCw className="w-4 h-4" />
        </span>
        <p className="text-[13px] text-zinc-700 dark:text-zinc-200 leading-snug min-w-0 flex-1">
          Hay una versión nueva de Vector.
        </p>
        <button
          type="button"
          onClick={() => {
            esperando.postMessage({ tipo: MENSAJES.activarAhora });
            // El `controllerchange` llega cuando la versión nueva tomó el control;
            // recién ahí recargar sirve de algo.
            navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
              once: true,
            });
          }}
          className="shrink-0 px-4 py-2 rounded-full bg-aviation-blue text-white text-xs font-bold"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
