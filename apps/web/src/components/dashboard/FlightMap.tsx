"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { AirportLocation, RouteConnection } from "./FlightMapInner";

const FlightMapInner = dynamic(() => import("./FlightMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[380px] md:h-[450px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] flex items-center justify-center">
      <p className="text-sm text-zinc-400 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando mapa de vuelo…
      </p>
    </div>
  ),
});

export default function FlightMap(props: {
  airports: AirportLocation[];
  routes: RouteConnection[];
  airportDetails: Record<string, { name: string; label: string; lat?: number; lon?: number; city?: string }>;
}) {
  return <FlightMapInner {...props} />;
}
