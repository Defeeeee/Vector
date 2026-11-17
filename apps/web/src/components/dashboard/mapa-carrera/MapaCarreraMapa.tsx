"use client";

import dynamic from "next/dynamic";
import type { AerodromoMapa, PiernaMapa } from "@/lib/mapa-carrera";

/** Leaflet toca `window` al importarse: entra por `dynamic`, como los otros mapas. */
const MapaCarreraLeaflet = dynamic(() => import("./MapaCarreraLeaflet"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-noche" />,
});

export default function MapaCarreraMapa({ aerodromos, piernas }: { aerodromos: AerodromoMapa[]; piernas: PiernaMapa[] }) {
  return (
    <div className="h-[62vh] min-h-[380px] rounded-2xl overflow-hidden ring-1 ring-white/10">
      <MapaCarreraLeaflet aerodromos={aerodromos} piernas={piernas} />
    </div>
  );
}
