"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";

export interface PuntoMapa {
  codigo: string;
  label: string;
  lat: number;
  lon: number;
}

/**
 * La ruta planificada, dibujada.
 *
 * Reusa el patrón de `FlightMapInner`: misma librería —Leaflet ya era dependencia—,
 * mismos tiles de Carto, mismo import dinámico desde el wrapper. Lo que cambia es qué
 * se dibuja: **acá el orden importa**. `FlightMapInner` pinta un grafo de aeródromos
 * visitados donde una línea es "volé de A a B alguna vez"; esto pinta una secuencia,
 * donde la línea 2 arranca donde terminó la 1.
 *
 * Por eso los puntos van numerados y no dimensionados por cantidad de visitas: el dato
 * que el piloto necesita leer del mapa es **en qué orden**, no cuánto.
 */
export default function PlanMapaInner({ puntos }: { puntos: PuntoMapa[] }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;

    if (!mapaRef.current) {
      mapaRef.current = L.map(contenedorRef.current, {
        center: [-34.6037, -58.3816],
        zoom: 6,
        zoomControl: false,
        attributionControl: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(mapaRef.current);
      // OSM exige la atribución visible (ver `lib/mapa-tiles.ts`).
      L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapaRef.current);
      L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapaRef.current);
    }

    const mapa = mapaRef.current;

    // Se redibuja entero en cada cambio de ruta. Son cuatro capas: comparar y parchear
    // costaría más código que rehacerlas, y el planificador cambia con cada tecla.
    mapa.eachLayer((capa) => {
      if (capa instanceof L.Polyline || capa instanceof L.CircleMarker || capa instanceof L.Marker) {
        mapa.removeLayer(capa);
      }
    });

    if (puntos.length === 0) return;

    const coords: L.LatLngExpression[] = puntos.map((p) => [p.lat, p.lon]);

    if (puntos.length > 1) {
      L.polyline(coords, {
        color: "#0A84FF",
        weight: 2.5,
        opacity: 0.9,
      }).addTo(mapa);
    }

    puntos.forEach((punto, i) => {
      const esExtremo = i === 0 || i === puntos.length - 1;
      L.circleMarker([punto.lat, punto.lon], {
        radius: esExtremo ? 7 : 5,
        color: "#0A84FF",
        weight: 2,
        fillColor: esExtremo ? "#0A84FF" : "#ffffff",
        fillOpacity: 1,
      })
        .addTo(mapa)
        .bindTooltip(`${i + 1}. ${punto.codigo} — ${punto.label}`, {
          direction: "top",
          offset: [0, -8],
        });
    });

    /*
      Un solo punto no tiene `bounds` con área, así que `fitBounds` haría zoom al
      máximo sobre la pista. Con uno se centra a escala de región, que es lo que sirve
      mientras el piloto todavía está cargando el resto de la ruta.
    */
    if (puntos.length === 1) {
      mapa.setView(coords[0] as L.LatLngExpression, 9);
    } else {
      mapa.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
    }
  }, [puntos]);

  // Leaflet mide el contenedor al crearse. Si el mapa nace oculto —dentro de un panel
  // colapsado, o antes de que el layout se asiente— queda con tamaño cero y se ven
  // tiles grises. Un invalidate al montar lo resuelve sin tener que coordinar con el
  // resto de la página.
  useEffect(() => {
    const t = setTimeout(() => mapaRef.current?.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={contenedorRef}
      className="w-full h-[300px] md:h-[420px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 z-0"
    />
  );
}
