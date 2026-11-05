"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { REFRESCO_PERIODICO_MS, VOLVER_TRAS_MS } from "@/lib/pwa";

/** Lo que hay que tirar para que suelte y actualice, en px de pantalla (ya con la resistencia). */
const UMBRAL = 70;
const MAXIMO = 110;
/** Dónde queda el círculo mientras actualiza. */
const QUIETO = 56;

/**
 * Que Vector esté al día sin tocar nada (3.7.0, Federico, 2026-11-05):
 *
 * - **al volver** a la app después de un minuto o más en segundo plano (`VOLVER_TRAS_MS`),
 * - **cada 5 minutos** mientras está a la vista (`REFRESCO_PERIODICO_MS`),
 * - **al volver la conexión**,
 *
 * se vuelven a pedir los datos con `router.refresh()`: el server vuelve a dibujar las pantallas
 * y lo que el piloto esté escribiendo en un formulario no se toca (es estado del cliente). Son
 * sólo lecturas (invariante 15). El service worker no se mete con estos pedidos (`esRSC`,
 * `lib/pwa.ts`), así que llegan a la red.
 *
 * Y **tirar hacia abajo para actualizar**, sólo en la app instalada en el teléfono: iOS no lo
 * trae en una app de inicio (en Safari y en Chrome sí, así que en el navegador no se dibuja).
 * No arranca sobre el mapa ni en un campo de texto (`data-sin-tirar` para excluir otra cosa).
 *
 * `servido` es cuándo el server dibujó el layout: cambia cuando el refresco aterriza, y ésa es
 * la señal de que llegaron los datos nuevos para sacar el círculo.
 */
export default function ActualizarDatos({ servido }: { servido: number }) {
  const router = useRouter();
  const [dist, setDist] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const [tirando, setTirando] = useState(false);
  const desde = useRef<number | null>(null);
  const tirado = useRef(0);
  const inicio = useRef(0);
  const servidoAlSoltar = useRef(servido);

  const refrescar = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    router.refresh();
  }, [router]);

  // Al volver, cada tanto y al volver la red.
  useEffect(() => {
    let ocultoDesde: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    const visibilidad = () => {
      if (document.visibilityState === "hidden") ocultoDesde = Date.now();
      else {
        if (ocultoDesde !== null && Date.now() - ocultoDesde >= VOLVER_TRAS_MS) refrescar();
        ocultoDesde = null;
      }
    };
    // iOS a veces devuelve la app desde la memoria con `pageshow` y sin `visibilitychange`.
    const pageshow = (e: PageTransitionEvent) => {
      if (e.persisted) refrescar();
    };
    const reloj = window.setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
    }, REFRESCO_PERIODICO_MS);
    document.addEventListener("visibilitychange", visibilidad);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("online", refrescar);
    return () => {
      document.removeEventListener("visibilitychange", visibilidad);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("online", refrescar);
      window.clearInterval(reloj);
    };
  }, [refrescar]);

  // Tirar para actualizar: sólo instalada y en el teléfono.
  useEffect(() => {
    const app = window.matchMedia("(display-mode: standalone) and (width < 64rem)");
    const empezar = (e: TouchEvent) => {
      if (!app.matches || actualizando || e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.target as Element | null;
      if (t?.closest?.(".leaflet-container, [data-sin-tirar], input, textarea, select, [contenteditable], [role=dialog]")) return;
      desde.current = e.touches[0].clientY;
      setTirando(true);
    };
    const mover = (e: TouchEvent) => {
      if (desde.current === null) return;
      if (window.scrollY > 0) {
        desde.current = null;
        tirado.current = 0;
        setTirando(false);
        setDist(0);
        return;
      }
      const dy = e.touches[0].clientY - desde.current;
      tirado.current = dy <= 0 ? 0 : Math.min(MAXIMO, dy * 0.5);
      setDist(tirado.current);
    };
    const soltar = () => {
      if (desde.current === null) return;
      desde.current = null;
      setTirando(false);
      if (tirado.current >= UMBRAL) {
        inicio.current = Date.now();
        servidoAlSoltar.current = servido;
        setActualizando(true);
        setDist(QUIETO);
        refrescar();
      } else setDist(0);
      tirado.current = 0;
    };
    window.addEventListener("touchstart", empezar, { passive: true });
    window.addEventListener("touchmove", mover, { passive: true });
    window.addEventListener("touchend", soltar, { passive: true });
    window.addEventListener("touchcancel", soltar, { passive: true });
    return () => {
      window.removeEventListener("touchstart", empezar);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", soltar);
      window.removeEventListener("touchcancel", soltar);
    };
  }, [actualizando, refrescar, servido]);

  // Cuando llegó lo nuevo (y como mínimo medio segundo, para que se vea), el círculo se va. Si
  // no llega en 8 s (sin red, el server caído), también: los datos que se ven siguen siendo los de antes.
  useEffect(() => {
    if (!actualizando) return;
    const llego = servido !== servidoAlSoltar.current;
    const t = window.setTimeout(
      () => {
        setActualizando(false);
        setDist(0);
      },
      llego ? Math.max(0, 500 - (Date.now() - inicio.current)) : 8000 - (Date.now() - inicio.current)
    );
    return () => window.clearTimeout(t);
  }, [actualizando, servido]);

  if (dist <= 0 && !actualizando) return null;
  const listo = dist >= UMBRAL;
  return (
    <div
      data-tirar-para-actualizar
      aria-live="polite"
      className="lg:hidden fixed left-1/2 z-40 pointer-events-none top-[calc(max(58px,calc(env(safe-area-inset-top)+0.75rem))+3.25rem)]"
      style={{ transform: `translate(-50%, ${dist - 44}px)`, opacity: Math.min(1, dist / 50), transition: tirando ? "none" : "transform 0.25s, opacity 0.25s" }}
    >
      <span className="sr-only">{actualizando ? "Actualizando" : listo ? "Soltá para actualizar" : ""}</span>
      <span
        className={`w-10 h-10 rounded-full bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center ${listo || actualizando ? "text-aviation-blue dark:text-aviation-cyan" : "text-zinc-400"}`}
      >
        <RefreshCw className={`w-5 h-5 ${actualizando ? "animate-spin" : ""}`} style={actualizando ? undefined : { transform: `rotate(${dist * 3}deg)` }} />
      </span>
    </div>
  );
}
