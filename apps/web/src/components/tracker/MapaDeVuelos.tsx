"use client";

import dynamic from "next/dynamic";

/** Leaflet toca `window`: sólo en el navegador. */
const MapaDeVuelos = dynamic(() => import("./MapaDeVuelosInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-carbon" />,
});

export default MapaDeVuelos;
