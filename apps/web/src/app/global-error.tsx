"use client";

import { useEffect } from "react";
import ErrorEstado, { type ErrorEstadoProps } from "@/components/ErrorEstado";

/**
 * El último recurso: errores del `layout.tsx` de la raíz.
 *
 * **Reemplaza el documento entero**, así que tiene que renderizar sus propios
 * `<html>` y `<body>` — el layout de la raíz es justamente lo que falló, así que no
 * hay nada envolviéndolo. Por el mismo motivo no hereda las clases de tema, y de ahí
 * el `bg-white` explícito: sin él, el fondo lo pone el navegador.
 */
export default function GlobalError({ error, reset }: ErrorEstadoProps) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-zinc-900 flex items-center justify-center antialiased">
        <ErrorEstado error={error} reset={reset} />
      </body>
    </html>
  );
}
