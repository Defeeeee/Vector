"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import { colorPorAltura, type RecorridoCompacto } from "@/lib/recorrido";

/**
 * El recorrido real del vuelo sobre el mapa: cada tramo coloreado por altura, punteado donde se
 * cortó la señal más de un minuto, y el despegue y el aterrizaje marcados. Leaflet, como los
 * otros mapas de la app (`FlightMapInner`, `PlanMapaInner`), con los tiles de OSM.
 */
export default function RecorridoMapaInner({ recorrido, altitudMax }: { recorrido: RecorridoCompacto; altitudMax: number | null }) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedor.current || recorrido.p.length < 2) return;
    const mapa = L.map(contenedor.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    // OSM exige la atribución visible, y adsb.fi pide que se lo cite con un link.
    L.control
      .attribution({ prefix: false, position: "bottomleft" })
      .addAttribution(
        recorrido.fuente === "adsb.lol"
          ? 'Recorrido: <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> (ODbL)'
          : 'Recorrido: <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>'
      )
      .addTo(mapa);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);

    const techo = Math.max(altitudMax ?? 0, 1000);
    const ll = recorrido.p.map(([, la, lo]) => [la, lo] as L.LatLngTuple);
    L.polyline(ll, { color: "#ffffff", weight: 7, opacity: 0.85 }).addTo(mapa);
    for (let i = 1; i < recorrido.p.length; i++) {
      const [t0, , , a0] = recorrido.p[i - 1];
      const [t1, , , a1] = recorrido.p[i];
      L.polyline([ll[i - 1], ll[i]], {
        color: colorPorAltura(((a0 ?? 0) + (a1 ?? 0)) / 2, techo, "claro"),
        weight: 4,
        lineCap: "round",
        dashArray: t1 - t0 > 60 ? "2 7" : undefined,
      }).addTo(mapa);
    }
    const punta = (p: L.LatLngTuple, color: string, texto: string) =>
      L.circleMarker(p, { radius: 6, color: "#ffffff", weight: 2.5, fillColor: color, fillOpacity: 1 }).addTo(mapa).bindTooltip(texto, { direction: "top" });
    punta(ll[0], "#16a34a", "Despegue");
    punta(ll[ll.length - 1], "#dc2626", "Aterrizaje");
    mapa.fitBounds(L.latLngBounds(ll), { padding: [24, 24] });

    return () => {
      mapa.remove();
    };
  }, [recorrido, altitudMax]);

  return <div ref={contenedor} className="w-full h-[280px] md:h-[360px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 z-0" />;
}
