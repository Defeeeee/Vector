"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EVENTO_CONSENTIMIENTO,
  EVENTO_REGISTRO,
  PIXEL_META_ID,
  guardarConsentimiento,
  leerConsentimiento,
  pixelPermitidoEn,
  type Consentimiento,
} from "@/lib/pixel-meta";

/**
 * El píxel de Meta y el cartel que pide permiso para cargarlo (`lib/pixel-meta.ts`).
 *
 * Va en el layout raíz, pero sólo hace algo en la portada y las guías, y con un "sí".
 */

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; push: unknown; loaded: boolean; version: string; disablePushState?: boolean };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** El código base de Meta, sin el `PageView` automático: los eventos se mandan a mano. */
function cargarPixel(id: string) {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  /*
    **Sin seguimiento automático de la navegación.** Por defecto el píxel anota cada cambio
    de URL de una app como ésta. Cargado en la portada, seguiría anotando el dashboard
    cuando el piloto entra: la app sólo navega entre páginas sin recargar.
  */
  fbq.disablePushState = true;
  window.fbq = fbq;
  window._fbq = fbq;

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);

  // Sin configuración automática: no lee botones ni metadatos de la página.
  fbq("set", "autoConfig", false, id);
  fbq("init", id);
}

export default function PixelMeta() {
  const ruta = usePathname();
  const [montado, setMontado] = useState(false);
  const [consentimiento, setConsentimiento] = useState<Consentimiento | null>(null);

  // La elección vive en el navegador: se lee después de montar, para no discrepar con el server.
  useEffect(() => {
    setConsentimiento(leerConsentimiento(window.localStorage));
    setMontado(true);
    const releer = () => setConsentimiento(leerConsentimiento(window.localStorage));
    window.addEventListener(EVENTO_CONSENTIMIENTO, releer);
    return () => window.removeEventListener(EVENTO_CONSENTIMIENTO, releer);
  }, []);

  // Una visita, en las páginas donde se permite.
  useEffect(() => {
    if (!PIXEL_META_ID || consentimiento !== "si" || !pixelPermitidoEn(ruta)) return;
    cargarPixel(PIXEL_META_ID);
    window.fbq?.("track", "PageView");
  }, [ruta, consentimiento]);

  // El registro terminado: se carga recién acá, con el formulario ya fuera de la pantalla.
  useEffect(() => {
    if (!PIXEL_META_ID || consentimiento !== "si") return;
    const id = PIXEL_META_ID;
    const alRegistrarse = () => {
      cargarPixel(id);
      window.fbq?.("track", "CompleteRegistration");
    };
    window.addEventListener(EVENTO_REGISTRO, alRegistrarse);
    return () => window.removeEventListener(EVENTO_REGISTRO, alRegistrarse);
  }, [consentimiento]);

  if (!PIXEL_META_ID || !montado || consentimiento !== null || !pixelPermitidoEn(ruta)) return null;

  const elegir = (valor: Consentimiento) => {
    guardarConsentimiento(window.localStorage, valor);
    setConsentimiento(valor);
  };

  return (
    <div role="dialog" aria-label="Medición de anuncios" className="fixed inset-x-0 bottom-0 z-[60] p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl shadow-cal dark:shadow-none p-4 md:p-5">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          ¿Nos dejás usar el píxel de Meta para saber si nuestros anuncios funcionan? Sólo en esta página y en las guías: nunca adentro de la app.{" "}
          <Link href="/legal/privacidad#meta" className="font-semibold text-aviation-blue dark:text-aviation-cyan underline underline-offset-2">
            Qué se manda
          </Link>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => elegir("si")}
            className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold"
          >
            Aceptar
          </button>
          <button
            type="button"
            onClick={() => elegir("no")}
            className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 text-sm font-semibold"
          >
            No, gracias
          </button>
        </div>
      </div>
    </div>
  );
}
