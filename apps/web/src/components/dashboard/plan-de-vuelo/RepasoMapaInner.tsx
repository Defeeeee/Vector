"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";

/**
 * El recorrido que vio el ADS-B sobre la ruta del plan: la ruta planeada punteada y, encima, lo
 * volado en cian, con el despegue y el último punto visto. Sin horas (el recorrido no las trae).
 * Lo volado se dibuja cortado donde faltan más de 3 NM entre dos puntos (cobertura): no se
 * inventa una línea por donde no se lo vio.
 */
export default function RepasoMapaInner({
  planeada,
  volado,
  aterrizo,
}: {
  planeada: { lat: number; lon: number; codigo: string }[];
  volado: [number, number, number | null][];
  aterrizo: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    const mapa = L.map(contenedor.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    L.control.attribution({ prefix: false, position: "bottomleft" }).addAttribution('Recorrido: <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>').addTo(mapa);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);

    const todos: L.LatLngTuple[] = [];
    if (planeada.length >= 2) {
      const ll = planeada.map((p) => [p.lat, p.lon] as L.LatLngTuple);
      L.polyline(ll, { color: "#475569", weight: 3, opacity: 0.9, dashArray: "6 8" }).addTo(mapa);
      planeada.forEach((p, i) => {
        const extremo = i === 0 || i === planeada.length - 1;
        const m = L.circleMarker([p.lat, p.lon], { radius: extremo ? 5 : 3, color: "#475569", weight: 2, fillColor: "#ffffff", fillOpacity: 1 }).addTo(mapa);
        if (p.codigo) m.bindTooltip(p.codigo, { direction: "top" });
      });
      todos.push(...ll);
    }
    if (volado.length >= 2) {
      const ll = volado.map(([la, lo]) => [la, lo] as L.LatLngTuple);
      // Un salto grande entre dos puntos seguidos es un hueco de cobertura: línea suelta, no un tramo.
      let tramo: L.LatLngTuple[] = [ll[0]];
      const trazar = (t: L.LatLngTuple[]) => t.length > 1 && L.polyline(t, { color: "#00b8d9", weight: 4, lineCap: "round" }).addTo(mapa);
      for (let i = 1; i < ll.length; i++) {
        if (mapa.distance(ll[i - 1], ll[i]) > 3 * 1852) {
          trazar(tramo);
          L.polyline([ll[i - 1], ll[i]], { color: "#00b8d9", weight: 2, dashArray: "2 7", opacity: 0.8 }).addTo(mapa);
          tramo = [];
        }
        tramo.push(ll[i]);
      }
      trazar(tramo);
      const punta = (p: L.LatLngTuple, color: string, texto: string) =>
        L.circleMarker(p, { radius: 6, color: "#ffffff", weight: 2.5, fillColor: color, fillOpacity: 1 }).addTo(mapa).bindTooltip(texto, { direction: "top" });
      punta(ll[0], "#16a34a", "Primer punto visto en el aire");
      punta(ll[ll.length - 1], aterrizo ? "#dc2626" : "#f59e0b", aterrizo ? "Último punto visto (final)" : "Último punto visto");
      todos.push(...ll);
    }
    if (todos.length) mapa.fitBounds(L.latLngBounds(todos), { padding: [24, 24] });
    else mapa.setView([-34.6, -58.4], 7);
    return () => {
      mapa.remove();
    };
  }, [planeada, volado, aterrizo]);

  return <div ref={contenedor} className="w-full h-[260px] md:h-[340px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 z-0" />;
}
