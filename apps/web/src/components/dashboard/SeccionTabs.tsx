"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pestanaActiva, seccionDe } from "@/lib/secciones";

/**
 * Las pestañas de la sección en la que está el piloto.
 *
 * Es lo que hace posible que la barra tenga pocos íconos: Resumen, Calendario y
 * Auditoría siguen a un toque, pero desde adentro de la Bitácora; Aeropuertos, Clima y
 * Herramientas desde "Preparar vuelo"; Buscar y Actividad desde Pilotos.
 *
 * Vive en el layout y no en cada página: así una pantalla que se agrega a una sección
 * en `lib/secciones.ts` aparece sola en sus pestañas, sin acordarse de tocar cuatro
 * archivos. En las secciones de una sola pantalla —y fuera de toda sección— no dibuja
 * nada.
 */
export default function SeccionTabs({
  contadores = {},
}: {
  /**
   * Un número en rojo al lado de la pestaña, por `href`: los hallazgos abiertos en
   * Auditoría; las solicitudes y lo nuevo en Actividad. Cero o ausente no dibuja nada.
   */
  contadores?: Record<string, number>;
}) {
  const pathname = usePathname();
  const seccion = seccionDe(pathname);
  const activa = seccion ? pestanaActiva(seccion, pathname) : null;
  const activaRef = useRef<HTMLAnchorElement>(null);

  /*
    En un teléfono angosto las cuatro pestañas de "Preparar vuelo" no entran y la fila
    scrollea de costado. Sin esto, entrar a Herramientas —la última— la deja cortada
    contra el borde, y parece que no hay nada seleccionado.
  */
  useEffect(() => {
    activaRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  if (!seccion || seccion.pestanas.length < 2) return null;

  /*
    En el teléfono (3.4.0): en el navegador, pestañas subrayadas en una franja blanca pegada
    al encabezado; instalada (`app:`), un control segmentado gris cuando entran (hasta cuatro).
    Desde `md`, las píldoras de siempre.
  */
  const segmentado = seccion.pestanas.length <= 4;
  return (
    <nav
      aria-label={seccion.label}
      className={`-mx-4 -mt-4 mb-4 px-4 scroll-px-4 bg-white dark:bg-black border-b border-zinc-200 dark:border-white/10 md:mx-0 md:mt-0 md:px-0 md:scroll-px-0 md:mb-10 md:bg-transparent md:dark:bg-transparent md:border-0 lg:mb-12 lg:border-b lg:border-white/10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        segmentado ? "app:mx-0 app:mt-0 app:px-0 app:mb-2.5 app:bg-transparent app:dark:bg-transparent app:border-0" : "app:bg-transparent app:dark:bg-transparent"
      }`}
    >
      <div
        className={`flex h-10 items-end gap-[18px] md:inline-flex md:h-auto md:items-center md:gap-1 md:p-1 md:rounded-2xl md:bg-zinc-100 md:dark:bg-white/5 md:border md:border-zinc-200 md:dark:border-white/10 lg:flex lg:gap-9 lg:p-0 lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:border-0 ${
          segmentado ? "app:grid app:grid-flow-col app:auto-cols-fr app:h-9 app:items-stretch app:gap-0 app:p-[3px] app:rounded-[11px] app:bg-zinc-200 app:dark:bg-white/10" : ""
        }`}
      >
        {seccion.pestanas.map((pestana) => {
          const esActiva = pestana.href === activa?.href;
          const cantidad = contadores[pestana.href] ?? 0;

          return (
            <Link
              key={pestana.href}
              href={pestana.href}
              ref={esActiva ? activaRef : undefined}
              aria-current={esActiva ? "page" : undefined}
              className={`shrink-0 inline-flex items-center gap-2 pb-[9px] border-b-2 md:border-b-0 md:px-4 md:py-2 md:rounded-xl text-[13px] md:text-sm md:font-semibold lg:px-0 lg:py-0 lg:pb-4 lg:-mb-px lg:rounded-none lg:border-b-2 lg:font-mono lg:text-[12px] lg:uppercase lg:tracking-[0.14em] lg:font-medium whitespace-nowrap transition-colors ${
                segmentado ? "app:justify-center app:pb-0 app:border-b-0 app:rounded-[9px] app:text-[12.5px]" : ""
              } ${
                esActiva
                  ? `border-zinc-900 dark:border-white font-extrabold md:bg-white md:dark:bg-white/10 text-zinc-900 dark:text-white md:shadow-sm lg:bg-transparent lg:dark:bg-transparent lg:shadow-none lg:font-medium lg:border-aviation-cyan ${segmentado ? "app:bg-white app:dark:bg-zinc-800 app:shadow-sm" : ""}`
                  : "border-transparent font-bold lg:font-medium text-zinc-500 dark:text-zinc-400 lg:dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {pestana.label}
              {cantidad > 0 && (
                <span
                  aria-label={`${cantidad} pendientes`}
                  className="data min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold leading-5 text-center"
                >
                  {cantidad}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
