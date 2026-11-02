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

  return (
    <nav
      aria-label={seccion.label}
      className="-mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:scroll-px-0 mb-6 md:mb-10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
        {seccion.pestanas.map((pestana) => {
          const esActiva = pestana.href === activa?.href;
          const cantidad = contadores[pestana.href] ?? 0;

          return (
            <Link
              key={pestana.href}
              href={pestana.href}
              ref={esActiva ? activaRef : undefined}
              aria-current={esActiva ? "page" : undefined}
              className={`shrink-0 inline-flex items-center gap-2 px-3.5 md:px-4 py-2 rounded-xl text-[13px] md:text-sm font-semibold whitespace-nowrap transition-colors ${
                esActiva
                  ? "bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
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
