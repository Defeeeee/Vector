"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import { grosorDePierna, radioDeAerodromo, type AerodromoMapa, type PiernaMapa } from "@/lib/mapa-carrera";

const CIAN = "#38bdf8";
const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Lo que dice el globo al tocar un aeródromo; las fechas ya vienen escritas del server (invariante 1). */
function textoDelGlobo(a: AerodromoMapa): string {
  const veces = a.visitas === 1 ? "1 vez" : `${a.visitas} veces`;
  const fechas =
    a.primera === a.ultima
      ? `<div style="opacity:.7">${escapar(a.primeraTexto)}</div>`
      : `<div style="opacity:.7">Primera vez: ${escapar(a.primeraTexto)}</div><div style="opacity:.7">Última vez: ${escapar(a.ultimaTexto)}</div>`;
  return (
    `<div style="font:600 11px ui-monospace,monospace;letter-spacing:.14em;color:${CIAN}">${escapar(a.codigo)}</div>` +
    `<div style="font-weight:700;font-size:15px;margin:2px 0 4px">${escapar(a.nombre)}</div>` +
    (a.provincia ? `<div style="opacity:.7">${escapar(a.provincia)}</div>` : "") +
    `<div style="margin-top:4px;font-weight:600">${veces}</div>${fechas}`
  );
}

/**
 * El mapa de "Tu mapa": cada aeródromo es un punto que crece con las visitas (el más visitado, en
 * cian y con un aro), cada pierna una línea que engorda con las veces. Las teselas de OSM se
 * oscurecen como en el Mapa y en "Repasar el vuelo". Llena a su contenedor.
 */
export default function MapaCarreraLeaflet({ aerodromos, piernas }: { aerodromos: AerodromoMapa[]; piernas: PiernaMapa[] }) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    // `rotateControl: false`: si `leaflet-rotate` está cargado, no le agrega su botón a este mapa.
    const mapa = L.map(contenedor.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.5, rotateControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapa).addAttribution(TILES_OPCIONES.attribution);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);

    // Las piernas primero (de las menos a las más voladas, ya vienen así), para que los puntos queden encima.
    for (const p of piernas) {
      const a = aerodromos[p.a];
      const b = aerodromos[p.b];
      L.polyline(
        [[a.lat, a.lon], [b.lat, b.lon]],
        { color: "#a5e4ff", weight: grosorDePierna(p.veces), opacity: Math.min(0.9, 0.4 + p.veces * 0.08), interactive: false }
      ).addTo(mapa);
    }
    const maxV = aerodromos.reduce((m, a) => Math.max(m, a.visitas), 0);
    aerodromos.forEach((a, i) => {
      const r = radioDeAerodromo(a.visitas, maxV);
      const primero = i === 0;
      if (primero) L.circleMarker([a.lat, a.lon], { radius: r + 7, color: CIAN, weight: 2, fill: false, interactive: false }).addTo(mapa);
      L.circleMarker([a.lat, a.lon], {
        radius: r,
        color: "#0b0d10",
        weight: 1.5,
        fillColor: primero ? CIAN : "#ffffff",
        fillOpacity: 0.95,
      })
        .addTo(mapa)
        .bindPopup(textoDelGlobo(a), { closeButton: false, className: "popup-mapa-carrera" });
    });

    const encuadrar = () => {
      if (aerodromos.length === 1) mapa.setView([aerodromos[0].lat, aerodromos[0].lon], 9);
      else mapa.fitBounds(L.latLngBounds(aerodromos.map((a) => [a.lat, a.lon] as L.LatLngTuple)), { padding: [48, 48], maxZoom: 11 });
    };
    encuadrar();

    // El contenedor puede no tener su tamaño final al montarse (la hoja de Leaflet y el layout llegan
    // después): se vuelve a encuadrar cada vez que cambia, hasta que el piloto toca el mapa.
    let tocado = false;
    const tocar = () => { tocado = true; };
    const el = contenedor.current;
    el.addEventListener("pointerdown", tocar);
    el.addEventListener("wheel", tocar, { passive: true });
    const ro = new ResizeObserver(() => {
      mapa.invalidateSize();
      if (!tocado) encuadrar();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", tocar);
      el.removeEventListener("wheel", tocar);
      mapa.remove();
    };
  }, [aerodromos, piernas]);

  return (
    <div
      ref={contenedor}
      className="w-full h-full bg-noche [&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.85)_contrast(0.9)] [&_.leaflet-popup-content-wrapper]:bg-[#0c1a26] [&_.leaflet-popup-content-wrapper]:text-white [&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-tip]:bg-[#0c1a26] [&_.leaflet-popup-content]:text-[13px] [&_.leaflet-popup-content]:leading-snug"
    />
  );
}
