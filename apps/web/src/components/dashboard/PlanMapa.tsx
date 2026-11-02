"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { PuntoMapa } from "./PlanMapaInner";

/**
 * Leaflet toca `window` al importarse, así que entra por `dynamic` con `ssr: false`.
 * Mismo patrón que `FlightMap`, y por la misma razón: sin esto el build del servidor
 * rompe antes de renderizar nada.
 */
const PlanMapaInner = dynamic(() => import("./PlanMapaInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[300px] md:h-[420px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] flex items-center justify-center">
      <p className="text-sm text-zinc-400 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando mapa…
      </p>
    </div>
  ),
});

export default function PlanMapa({ puntos }: { puntos: PuntoMapa[] }) {
  return <PlanMapaInner puntos={puntos} />;
}
