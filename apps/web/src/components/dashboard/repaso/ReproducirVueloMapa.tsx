"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import { colorPorAltura } from "@/lib/recorrido";
import { huecosSinSenal, type EstadoVuelo, type SerieVuelo } from "@/lib/reproducir-vuelo";

/** El avión, de arriba, mirando al norte: se gira con el rumbo. Blanco con borde oscuro. */
const AVION_SVG = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M16 2.5c1.1 0 1.8 1.1 1.8 2.6v7.6l10.2 6v2.6l-10.2-3v6.1l3 2.3v2.1L16 27.9l-4.8 1.3v-2.1l3-2.3v-6.1l-10.2 3v-2.6l10.2-6V5.1c0-1.5.7-2.6 1.8-2.6z" fill="#fff" stroke="#0b0d10" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/**
 * El mapa de "Repasar el vuelo": el recorrido entero tenue, lo ya volado coloreado por altura y
 * el avión en su posición. No se redibuja en cada cuadro: cada tramo es una línea que se prende o
 * se apaga al cruzarlo (`indice`), y sólo el tramo en curso y el avión se mueven.
 * Llena a su contenedor.
 */
export default function ReproducirVueloMapa({ serie, estado, seguir, altitudMax }: { serie: SerieVuelo; estado: EstadoVuelo; seguir: boolean; altitudMax: number | null }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const tramos = useRef<L.Polyline[]>([]);
  const encendidos = useRef(0);
  const enCurso = useRef<L.Polyline | null>(null);
  const avion = useRef<L.Marker | null>(null);
  const girar = useRef<HTMLElement | null>(null);
  const siguiendo = useRef(seguir);
  siguiendo.current = seguir;

  useEffect(() => {
    const m = serie.muestras;
    if (!contenedor.current || m.length < 2) return;
    // `rotateControl: false`: en el Mapa está cargado `leaflet-rotate`, que si no le agrega su botón a todo mapa.
    const mapa = L.map(contenedor.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.5, rotateControl: false });
    mapaRef.current = mapa;
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    const control = L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapa);
    control.addAttribution(TILES_OPCIONES.attribution);
    if (serie.fuente === "adsb") {
      control.addAttribution(
        serie.proveedor === "adsb.lol"
          ? 'Recorrido: <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> (ODbL)'
          : 'Recorrido: <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>'
      );
    }
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);

    const ll = m.map((x) => [x.lat, x.lon] as L.LatLngTuple);
    // Todo el recorrido, tenue.
    L.polyline(ll, { color: "#ffffff", weight: 3, opacity: 0.25, interactive: false }).addTo(mapa);
    // Los cortes, punteados también en lo tenue.
    for (const [a, b] of huecosSinSenal(serie)) {
      const i = m.findIndex((x) => x.t === a);
      const j = m.findIndex((x) => x.t === b);
      if (i >= 0 && j >= 0) L.polyline([ll[i], ll[j]], { color: "#fbbf24", weight: 2, opacity: 0.55, dashArray: "2 7", interactive: false }).addTo(mapa);
    }
    // Lo volado: un tramo por par de muestras, apagado hasta que el avión lo cruza.
    const techo = Math.max(altitudMax ?? 0, 1000);
    const umbral = serie.fuente === "gps" ? 120_000 : 60_000;
    tramos.current = [];
    for (let i = 1; i < m.length; i++) {
      tramos.current.push(
        L.polyline([ll[i - 1], ll[i]], {
          color: colorPorAltura(((m[i - 1].altFt ?? 0) + (m[i].altFt ?? 0)) / 2, techo, "oscuro"),
          weight: 4,
          lineCap: "round",
          opacity: 0,
          dashArray: m[i].t - m[i - 1].t > umbral ? "2 7" : undefined,
          interactive: false,
        }).addTo(mapa)
      );
    }
    encendidos.current = 0;
    enCurso.current = L.polyline([ll[0], ll[0]], { color: "#ffffff", weight: 4, opacity: 0.9, lineCap: "round", interactive: false }).addTo(mapa);

    const punta = (p: L.LatLngTuple, color: string, texto: string) =>
      L.circleMarker(p, { radius: 6, color: "#ffffff", weight: 2.5, fillColor: color, fillOpacity: 1 }).addTo(mapa).bindTooltip(texto, { direction: "top" });
    punta(ll[0], "#16a34a", serie.fuente === "gps" ? "Inicio" : "Despegue");
    punta(ll[ll.length - 1], "#dc2626", serie.fuente === "gps" ? "Fin" : "Aterrizaje");

    const icono = L.divIcon({ className: "", html: `<div style="width:30px;height:30px;will-change:transform">${AVION_SVG}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    avion.current = L.marker(ll[0], { icon: icono, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(mapa);
    girar.current = avion.current.getElement()?.firstElementChild as HTMLElement | null;

    mapa.fitBounds(L.latLngBounds(ll), { padding: [40, 40] });

    // El contenedor cambia de tamaño al girar el teléfono o abrir la barra del navegador.
    // Sin "Seguir", se vuelve a encuadrar el recorrido entero: si no, el avión puede quedar afuera.
    const ro = new ResizeObserver(() => {
      mapa.invalidateSize();
      if (!siguiendo.current) mapa.fitBounds(L.latLngBounds(ll), { padding: [40, 40] });
    });
    ro.observe(contenedor.current);

    return () => {
      ro.disconnect();
      mapa.remove();
      mapaRef.current = null;
      tramos.current = [];
      avion.current = null;
      girar.current = null;
      enCurso.current = null;
    };
  }, [serie, altitudMax]);

  // Cada cuadro: el avión, el tramo en curso y los tramos que cambiaron de estado.
  useEffect(() => {
    const m = serie.muestras;
    const mapa = mapaRef.current;
    if (!mapa || !avion.current || m.length < 2) return;
    const pos: L.LatLngTuple = [estado.lat, estado.lon];
    avion.current.setLatLng(pos);
    avion.current.setOpacity(estado.sinSenal ? 0.5 : 1);
    const g = girar.current ?? (avion.current.getElement()?.firstElementChild as HTMLElement | null);
    girar.current = g;
    if (g) g.style.transform = `rotate(${estado.rumbo.toFixed(1)}deg)`;

    // Tramos ya cruzados: los del 0 al `indice - 1` (el tramo i va de la muestra i a la i + 1).
    const hasta = Math.min(estado.indice, tramos.current.length);
    if (hasta !== encendidos.current) {
      const desde = Math.min(hasta, encendidos.current);
      const fin = Math.max(hasta, encendidos.current);
      for (let i = desde; i < fin; i++) tramos.current[i]?.setStyle({ opacity: i < hasta ? 0.95 : 0 });
      encendidos.current = hasta;
    }
    enCurso.current?.setLatLngs([[m[estado.indice].lat, m[estado.indice].lon], pos]);
    if (siguiendo.current) mapa.panTo(pos, { animate: false });
  }, [serie, estado]);

  // Al activar "Seguir", se centra de una.
  useEffect(() => {
    if (seguir && mapaRef.current) mapaRef.current.panTo([estado.lat, estado.lon], { animate: false });
    // Sólo al cambiar el interruptor: el movimiento lo hace el efecto de cada cuadro.
  }, [seguir]);

  // Las teselas de OSM, oscurecidas como en el Mapa (`MapaLeaflet`): Vector es sólo oscuro y la
  // paleta de alturas y la estela blanca están pensadas para ese fondo.
  return <div ref={contenedor} className="w-full h-full bg-noche [&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.85)_contrast(0.9)]" />;
}
