"use client";

import { useEffect } from "react";
import ErrorEstado, { type ErrorEstadoProps } from "@/components/ErrorEstado";

/**
 * Errores de las trece páginas del dashboard.
 *
 * **No captura los del `layout.tsx` de esta misma carpeta** — un error boundary no
 * atrapa lo que tira su propio layout, sólo lo que tiran sus hijos. De eso se ocupa
 * `src/app/error.tsx`, que está un nivel arriba. Los dos hacen falta.
 */
export default function DashboardError({ error, reset }: ErrorEstadoProps) {
  useEffect(() => {
    console.error("Dashboard error boundary:", error);
  }, [error]);

  return <ErrorEstado error={error} reset={reset} />;
}
