"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoVector } from "@/components/Marca";
import { MENSAJES, VENTANA_ARRANQUE_MS, VOLVER_TRAS_MS, actualizarSinPreguntar, comoActualizar, linkParaActualizar } from "@/lib/pwa";

/** Para no recargar en loop si una versión obligatoria no llega: un intento cada tanto. */
const CLAVE_RECARGA = "vector-recarga-obligatoria";

/**
 * Registra el service worker, ofrece la actualización y expone la vía de escape.
 *
 * Va en el layout raíz y no en el del dashboard, por dos motivos. El service worker
 * tiene alcance de origen entero, así que registrarlo desde adentro del dashboard
 * sería registrarlo tarde; y sobre todo, **`?sw=reset` tiene que funcionar desde una
 * pantalla que no sea el dashboard** — si el dashboard es justamente lo que quedó
 * roto, no se puede pedir que el remedio viva ahí adentro.
 *
 * No dibuja nada salvo una línea en las pantallas de escribir cuando hay una versión esperando,
 * o la pantalla de "Actualizando" mientras se aplica.
 *
 * **Cómo se aplica una versión nueva (3.13.0, Federico: "te deja seguir sin actualizar, es raro
 * eso"; ver `comoActualizar`).** Al abrir o al volver a la app, ya. Usando la app, en el próximo
 * cambio de pantalla: un link se convierte en una navegación entera con la versión nueva, y un
 * cambio de pantalla sin link (guardar y volver a la lista) recarga. En una pantalla de escribir,
 * al salir de ella. Y si la app es más vieja que `VERSION_MINIMA`, sin opción. Ya no hay cartel
 * que se pueda ignorar.
 */
export default function ServiceWorkerVector() {
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);
  const [aplicando, setAplicando] = useState<null | "ya" | "obligatoria">(null);
  const pathname = usePathname();
  const pathnameAnterior = useRef(pathname);

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
    let quitar = () => {};

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

        /*
          **Al volver a la app, una versión nueva se toma sola** (3.7.0, Federico): si estuvo un
          minuto o más en segundo plano, se busca una versión nueva y, si aparece en los próximos
          30 s y la pantalla no es de las que se escriben (`actualizarSinPreguntar`), se activa y
          se recarga sin preguntar: al volver nadie está a mitad de una frase. En el resto de los
          casos sigue el cartel, por lo que se explica abajo.
        */
        const cargadaEn = Date.now();
        let alVolverHasta = 0;
        let obligatoria = false;
        const activar = (sw: ServiceWorker, despues: () => void = () => window.location.reload()) => {
          navigator.serviceWorker.addEventListener("controllerchange", despues, { once: true });
          sw.postMessage({ tipo: MENSAJES.activarAhora });
          // Si el cambio de control no llega, se recarga igual: no puede quedar la pantalla de
          // "Actualizando" para siempre.
          setTimeout(despues, 4000);
        };
        const mirar = () => {
          if (cancelado || !registro.waiting) return;
          const modo = obligatoria
            ? "obligatoria"
            : comoActualizar({
                pathname: location.pathname,
                search: location.search,
                arrancando: Date.now() - cargadaEn < VENTANA_ARRANQUE_MS || Date.now() < alVolverHasta,
              });
          if (modo === "ya" || modo === "obligatoria") {
            setAplicando(modo);
            activar(registro.waiting);
          } else setEsperando(registro.waiting);
        };
        /*
          La versión mínima: si el servidor dice que esta app ya no sirve, se busca la nueva y se
          aplica sin opción. Si no aparece (sin service worker, o no se instala), se recarga una vez
          cada cinco minutos como mucho: un loop de recargas sería peor que una app vieja.
        */
        const revisarMinima = async () => {
          try {
            const r = await fetch("/api/version", { cache: "no-store" });
            if (!r.ok) return;
            const { minima } = (await r.json()) as { minima?: string };
            if (comoActualizar({ pathname: "/", arrancando: false, minima }) !== "obligatoria") return;
            obligatoria = true;
            setAplicando("obligatoria");
            await registro.update().catch(() => undefined);
            if (registro.waiting) return mirar();
            setTimeout(() => {
              if (cancelado || registro.waiting) return;
              let ultima = 0;
              try {
                ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) || 0);
                sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
              } catch {}
              if (Date.now() - ultima > 5 * 60_000) window.location.reload();
              else setAplicando(null);
            }, 15_000);
          } catch {
            // Sin red no se sabe: se sigue con lo que hay (invariante 2: no saber no es "vieja").
          }
        };
        let ocultoDesde: number | null = null;
        const visibilidad = () => {
          if (document.visibilityState === "hidden") {
            ocultoDesde = Date.now();
            return;
          }
          if (ocultoDesde !== null && Date.now() - ocultoDesde >= VOLVER_TRAS_MS) {
            alVolverHasta = Date.now() + 30_000;
            void registro.update().catch(() => undefined).then(mirar);
            void revisarMinima();
          }
          ocultoDesde = null;
        };
        document.addEventListener("visibilitychange", visibilidad);
        quitar = () => document.removeEventListener("visibilitychange", visibilidad);
        void revisarMinima();

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
      quitar();
    };
  }, []);

  /*
    Con una versión esperando, **el próximo cambio de pantalla la aplica**. Un link se convierte en
    una navegación entera: se activa la versión nueva y se va al destino con ella, sin dibujar dos
    veces. Lo que cambia de pantalla sin link (guardar y volver a la lista, el botón de atrás) se
    agarra con el `pathname` y recarga.
  */
  useEffect(() => {
    if (!esperando) return;
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const destino = linkParaActualizar(a.getAttribute("href") ?? "", location.origin, location.pathname + location.search, {
        target: a.getAttribute("target"),
        download: a.hasAttribute("download"),
        modificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
      });
      if (!destino) return;
      e.preventDefault();
      e.stopPropagation();
      const ir = () => window.location.assign(destino);
      navigator.serviceWorker.addEventListener("controllerchange", ir, { once: true });
      esperando.postMessage({ tipo: MENSAJES.activarAhora });
      // Si el cambio de control no llega, se navega igual: la próxima carga ya toma la nueva.
      setTimeout(ir, 2500);
    };
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, [esperando]);

  useEffect(() => {
    if (pathnameAnterior.current === pathname) return;
    pathnameAnterior.current = pathname;
    if (!esperando) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    esperando.postMessage({ tipo: MENSAJES.activarAhora });
  }, [pathname, esperando]);

  if (aplicando) {
    return (
      <div role="status" className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-noche text-white">
        <LogoVector sobreOscuro className="h-8 w-auto" />
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
          {aplicando === "obligatoria" ? "Hay una versión nueva que hace falta · actualizando" : "Actualizando Vector"}
        </p>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-aviation-cyan animate-[cargando_1.1s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  // Fuera de las pantallas de escribir no se muestra nada: se aplica sola al cambiar de pantalla.
  if (!esperando || actualizarSinPreguntar(pathname, typeof location === "undefined" ? "" : location.search)) return null;

  /*
    En una pantalla de escribir no se recarga debajo de lo escrito (se perdería). Una franja avisa
    que se aplica al salir, que casi siempre es al guardar. Con la estética de la 3.13.0 (Federico:
    "que el cartel no sea una bento flotante"): no es una tarjeta sino una barra de estado de borde a
    borde, con el rótulo en mono y el punto cian. En la compu va pegada al borde de abajo, al lado de
    la barra lateral; en el teléfono, justo arriba de la píldora de secciones.
  */
  return (
    <div
      role="status"
      className="fixed inset-x-0 lg:left-20 z-[45] bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] lg:bottom-0 border-y lg:border-b-0 border-white/10 bg-noche/95 backdrop-blur pointer-events-none"
    >
      <p className="flex items-center justify-center lg:justify-start gap-2.5 h-9 px-4 lg:px-10 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-aviation-cyan animate-blip" />
        <span className="truncate sm:hidden">
          Versión nueva <span className="text-zinc-600">·</span> al salir de acá
        </span>
        <span className="truncate max-sm:hidden">
          Versión nueva lista <span className="text-zinc-600">·</span> se aplica al salir de esta pantalla
        </span>
      </p>
    </div>
  );
}
