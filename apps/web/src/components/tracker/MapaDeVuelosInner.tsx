"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import type { TarjetaDeVuelo } from "@/lib/tracker";

const CIAN = "#38bdf8";
const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function iconoAvion(rumbo: number | null): L.DivIcon {
  const forma =
    rumbo === null
      ? `<circle cx="16" cy="16" r="7" fill="${CIAN}" stroke="white" stroke-width="3"/>`
      : `<path d="M16 3 L25 27 L16 21 L7 27 Z" fill="${CIAN}" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>`;
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<svg width="36" height="36" viewBox="0 0 32 32" style="transform: rotate(${rumbo ?? 0}deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,.5))">${forma}</svg>`,
  });
}

/**
 * Todos los aviones en el aire a la vez (lo que los pilotos te asignaron): cada uno con su ruta tenue y
 * su nombre. Tocar un avión abre ese vuelo. Mismos tiles y filtro oscuro que el resto de la app. Se
 * encuadra una vez (y cuando cambia qué vuelos hay); después se actualiza en el lugar, sin perder el
 * zoom de quien mira.
 */
export default function MapaDeVuelosInner({ vuelos, alAbrir }: { vuelos: TarjetaDeVuelo[]; alAbrir: (token: string) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const encuadradoCon = useRef<string>("");
  const abrir = useRef(alAbrir);
  useEffect(() => {
    abrir.current = alAbrir;
  });

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const mapa = L.map(el, { zoomControl: false, attributionControl: false, zoomSnap: 0.25, rotateControl: false });
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(mapa);
    L.control.zoom({ position: "topright" }).addTo(mapa);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);
    mapa.setView([-34.6, -58.4], 7);
    capa.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    const observador = new ResizeObserver(() => mapa.invalidateSize({ pan: false }));
    observador.observe(el);
    return () => {
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      capa.current = null;
      encuadradoCon.current = "";
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const c = capa.current;
    if (!mapa || !c) return;
    c.clearLayers();
    const todos: L.LatLngTuple[] = [];
    for (const v of vuelos) {
      if (v.ruta.length > 1) {
        L.polyline(v.ruta, { color: "#ffffff", weight: 2, opacity: 0.4, dashArray: "6 6", interactive: false }).addTo(c);
        todos.push(...v.ruta);
      }
      if (v.posicion) {
        const m = L.marker([v.posicion.lat, v.posicion.lon], { icon: iconoAvion(v.posicion.rumbo), keyboard: false, title: `${v.piloto} ${v.trayecto}`.trim(), zIndexOffset: 1000 }).addTo(c);
        m.bindTooltip(`<span style="text-shadow:0 0 3px #000,0 0 3px #000">${escapar(v.piloto)}${v.trayecto ? `<br>${escapar(v.trayecto)}` : ""}</span>`, {
          permanent: true,
          direction: "top",
          offset: [0, -14],
          className: "!bg-transparent !border-0 !shadow-none !text-white !font-mono !text-[11px] !font-bold !text-center",
        });
        m.on("click", () => abrir.current(v.token));
        todos.push([v.posicion.lat, v.posicion.lon]);
      }
    }
    const huella = vuelos.map((v) => v.token).join(",");
    if (huella !== encuadradoCon.current && todos.length > 0) {
      mapa.fitBounds(L.latLngBounds(todos), { padding: [48, 48], maxZoom: 11, animate: false });
      encuadradoCon.current = huella;
    }
  }, [vuelos]);

  return <div ref={contenedor} className="leaflet-container mapa-oscuro absolute inset-0" />;
}
