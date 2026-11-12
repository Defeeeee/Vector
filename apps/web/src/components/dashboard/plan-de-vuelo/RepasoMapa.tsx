"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/** Leaflet toca `window` al importarse: entra por `dynamic` con `ssr: false`, como los otros mapas. */
const RepasoMapaInner = dynamic(() => import("./RepasoMapaInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[260px] md:h-[340px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-carbon flex items-center justify-center">
      <p className="text-sm text-zinc-400 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando mapa…
      </p>
    </div>
  ),
});

export default RepasoMapaInner;
