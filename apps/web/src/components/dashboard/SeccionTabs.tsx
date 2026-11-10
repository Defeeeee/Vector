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
    Las pestañas (3.14.0): en todas las pantallas, subrayadas, con el nombre en mono y la activa en
    cian, como el encabezado de la landing. En el teléfono, una franja de borde a borde pegada al
    encabezado (también en la app instalada, donde hasta la 3.13.0 eran un control segmentado gris);
    en la compu, con la línea fina abajo.
  */
  return (
    <nav
      aria-label={seccion.label}
      className="-mx-4 -mt-4 mb-5 px-4 scroll-px-4 bg-noche border-b border-white/10 md:-mx-8 md:mt-0 md:px-8 lg:mx-0 lg:mt-0 lg:px-0 lg:scroll-px-0 lg:mb-12 lg:bg-transparent overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex h-11 lg:h-auto items-end gap-[18px] lg:gap-9">
        {seccion.pestanas.map((pestana) => {
          const esActiva = pestana.href === activa?.href;
          const cantidad = contadores[pestana.href] ?? 0;

          return (
            <Link
              key={pestana.href}
              href={pestana.href}
              ref={esActiva ? activaRef : undefined}
              aria-current={esActiva ? "page" : undefined}
              className={`shrink-0 inline-flex items-center gap-2 pb-3 lg:pb-4 -mb-px border-b-2 font-mono text-[10.5px] lg:text-[12px] uppercase tracking-[0.06em] lg:tracking-[0.14em] whitespace-nowrap transition-colors ${
                esActiva ? "border-aviation-cyan text-white" : "border-transparent text-zinc-500 hover:text-white"
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
