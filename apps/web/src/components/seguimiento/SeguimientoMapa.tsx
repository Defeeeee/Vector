"use client";

import dynamic from "next/dynamic";

/** Leaflet toca `window`: sólo en el navegador. */
const SeguimientoMapa = dynamic(() => import("./SeguimientoMapaInner"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-carbon" />,
});

export default SeguimientoMapa;
