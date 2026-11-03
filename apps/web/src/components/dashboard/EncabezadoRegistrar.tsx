"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

/**
 * El encabezado de Registrar vuelo en el teléfono (3.4.0), en lugar del de la app
 * (`data-sin-encabezado-movil` lo esconde, ver el layout).
 * - En el navegador: volver, "Registrar vuelo" e "Importar".
 * - Instalada (`app:`): como una hoja de iOS, "Cancelar", "Nuevo vuelo" y "Guardar", que envía
 *   el formulario con `form=`. Es sólo el aspecto: la ruta sigue siendo una página, sin
 *   interceptar (ver AGENTS.md).
 *
 * Va en un portal sobre `body`: la página entra con una animación de `transform`, y adentro de
 * ella `fixed` se ubicaría contra la página y no contra la pantalla.
 */
export default function EncabezadoRegistrar({ importar, guardar }: { importar: boolean; guardar: boolean }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(
    <header
      data-sin-encabezado-movil
      className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white dark:bg-black app:bg-zinc-100 app:dark:bg-black border-b border-zinc-200 dark:border-white/10 app:border-b-0 h-14 app:h-auto px-2 app:pt-[max(58px,calc(env(safe-area-inset-top)+0.75rem))] app:pb-2 flex items-center gap-1"
    >
      <Link href="/dashboard" aria-label="Volver" className="app:hidden w-11 h-11 rounded-xl flex items-center justify-center text-zinc-900 dark:text-white">
        <ChevronLeft className="w-[22px] h-[22px]" />
      </Link>
      <Link href="/dashboard/history" className="hidden app:block px-2.5 py-2.5 text-base font-bold text-aviation-blue dark:text-aviation-cyan">
        Cancelar
      </Link>
      <h1 className="flex-1 text-lg app:text-base app:text-center font-display font-extrabold text-zinc-900 dark:text-white">
        <span className="app:hidden">Registrar vuelo</span>
        <span className="hidden app:inline">Nuevo vuelo</span>
      </h1>
      {importar && (
        <Link href="/dashboard/log-flight/import" className="app:hidden px-3 py-2.5 text-sm font-bold text-aviation-blue dark:text-aviation-cyan">
          Importar
        </Link>
      )}
      {guardar ? (
        <button type="submit" form="form-registrar-vuelo" className="hidden app:block px-2.5 py-2.5 text-base font-extrabold text-aviation-blue dark:text-aviation-cyan">
          Guardar
        </button>
      ) : (
        <span className="hidden app:block w-[78px]" aria-hidden="true" />
      )}
    </header>,
    document.body,
  );
}
