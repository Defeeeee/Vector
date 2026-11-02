"use client";

import { useEffect } from "react";
import ErrorEstado, { type ErrorEstadoProps } from "@/components/ErrorEstado";

/**
 * La frontera de la raíz. **Es la que salva el caso importante.**
 *
 * `src/app/dashboard/error.tsx` no puede capturar lo que tire
 * `src/app/dashboard/layout.tsx` —un boundary no atrapa a su propio layout—, y ese
 * layout llama a `getProfile()`, que hasta hace poco reventaba el dashboard entero
 * ante un corte de red. Ésta es la que agarra eso, y además las páginas públicas.
 */
export default function RootError({ error, reset }: ErrorEstadoProps) {
  useEffect(() => {
    console.error("Root error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex items-center justify-center">
      <ErrorEstado error={error} reset={reset} />
    </div>
  );
}
