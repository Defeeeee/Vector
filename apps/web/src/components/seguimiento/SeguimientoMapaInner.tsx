"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import type { SeguimientoPublico } from "@/lib/seguimiento";

/**
 * El mapa de `/seguir/[token]`: el avión, por dónde pasó y la ruta prevista, con los mismos tiles
 * que el resto de la app (`lib/mapa-tiles.ts`, atribución visible) y el filtro oscuro de
 * `.mapa-oscuro`. Norte arriba, sin rotar: quien mira no está volando.
 *
 * Se dibuja una vez y se actualiza en el lugar (no se recrea el mapa cada 15 s: perdería el zoom
 * que haya puesto quien mira). Se encuadra todo la primera vez; después el mapa acompaña al avión
 * sólo hasta que quien mira lo mueve con la mano (`centrar` lo vuelve a enganchar). `encuadrar`
 * vuelve a mostrar la ruta entera. Lleva los nombres de los puntos, la salida y el destino marcados,
 * y el avión orientado por el rumbo. Se adapta solo al tamaño del contenedor (`ResizeObserver`):
 * en el teléfono la hoja de datos y la rotación cambian el alto.
 */

const CIAN = "#38bdf8";

const SOMBRA = "text-shadow:0 0 3px #000,0 0 3px #000,0 0 6px #000";
const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function iconoAvion(track: number | null): L.DivIcon {
  const forma =
    track === null
      ? `<circle cx="16" cy="16" r="7" fill="${CIAN}" stroke="white" stroke-width="3"/>`
      : `<path d="M16 3 L25 27 L16 21 L7 27 Z" fill="${CIAN}" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>`;
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${track ?? 0}deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,.5))">${forma}</svg>`,
  });
}

export default function SeguimientoMapaInner({
  datos,
  centrar,
  encuadrar,
  onSuelto,
}: {
  datos: SeguimientoPublico;
  /** Sube cada vez que quien mira toca "Ver la ruta": vuelve a encuadrar todo. */
  encuadrar: number;
  /** Sube cada vez que quien mira toca "Centrar": vuelve a acompañar al avión. */
  centrar: number;
  /** Quien mira movió el mapa. */
  onSuelto: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capas = useRef<{ ruta: L.LayerGroup; estela: L.Polyline; avion: L.Marker | null } | null>(null);
  const encuadrado = useRef(false);
  const siguiendo = useRef(true);
  const alSoltar = useRef(onSuelto);
  useEffect(() => {
    alSoltar.current = onSuelto;
  });

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const mapa = L.map(el, { zoomControl: false, attributionControl: false, zoomSnap: 0.25 });
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(mapa);
    L.control.zoom({ position: "topright" }).addTo(mapa);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);
    mapa.setView([-34.6, -58.4], 8);
    const ruta = L.layerGroup().addTo(mapa);
    const estela = L.polyline([], { color: CIAN, weight: 3.5, opacity: 0.95, lineCap: "round", interactive: false }).addTo(mapa);
    capas.current = { ruta, estela, avion: null };
    // Sólo el gesto de quien mira suelta el mapa; los movimientos de código (`fitBounds`, `panTo`) no.
    mapa.on("dragstart", () => {
      siguiendo.current = false;
      alSoltar.current();
    });
    mapaRef.current = mapa;
    // El contenedor cambia de alto (hoja del teléfono, rotación, barra del navegador): Leaflet no se entera solo.
    const observador = new ResizeObserver(() => mapa.invalidateSize({ pan: false }));
    observador.observe(el);
    return () => {
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      capas.current = null;
      encuadrado.current = false;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const c = capas.current;
    if (!mapa || !c) return;

    c.ruta.clearLayers();
    const prevista = datos.puntos.map(([la, lo]) => [la, lo] as L.LatLngTuple);
    if (prevista.length > 1) L.polyline(prevista, { color: "#ffffff", weight: 2, opacity: 0.55, dashArray: "6 6", interactive: false }).addTo(c.ruta);
    datos.puntos.forEach(([la, lo, codigo, nombre], i) => {
      const extremo = i === 0 || i === datos.puntos.length - 1;
      const punto = L.circleMarker([la, lo], {
        radius: extremo ? 7 : 4,
        color: extremo ? CIAN : "#0b0d10",
        weight: extremo ? 3 : 1.5,
        fillColor: "#ffffff",
        fillOpacity: 0.95,
        interactive: false,
      }).addTo(c.ruta);
      if (!codigo && !extremo) return;
      const rol = i === 0 ? "SALIDA" : i === datos.puntos.length - 1 && datos.puntos.length > 1 ? "DESTINO" : "";
      const html =
        `<span style="${SOMBRA}">` +
        (rol ? `<span style="color:${CIAN}">${rol}</span> ` : "") +
        `${escapar(codigo)}` +
        (extremo && nombre ? `<br><span style="font-weight:500;opacity:.85">${escapar(nombre)}</span>` : "") +
        `</span>`;
      punto.bindTooltip(html, { permanent: true, direction: "top", offset: [0, -6], className: "!bg-transparent !border-0 !shadow-none !text-white !font-mono !text-[10px] !font-bold !text-center" });
    });

    const volado = datos.recorrido.map((p) => [p[0], p[1]] as L.LatLngTuple);
    const u = datos.ultima;
    if (u) volado.push([u.lat, u.lon]);
    c.estela.setLatLngs(volado);

    if (u) {
      const ll: L.LatLngTuple = [u.lat, u.lon];
      if (c.avion) {
        c.avion.setLatLng(ll);
        c.avion.setIcon(iconoAvion(u.track));
      } else {
        c.avion = L.marker(ll, { icon: iconoAvion(u.track), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(mapa);
      }
    }

    if (!encuadrado.current) {
      const todo = [...prevista, ...volado];
      if (todo.length > 0) {
        mapa.fitBounds(L.latLngBounds(todo), { padding: [48, 48], maxZoom: 12, animate: false });
        encuadrado.current = true;
      }
    } else if (u && siguiendo.current && !mapa.getBounds().pad(-0.2).contains([u.lat, u.lon])) {
      mapa.panTo([u.lat, u.lon], { animate: true });
    }
  }, [datos]);

  // "Ver la ruta": encuadra todo otra vez.
  useEffect(() => {
    if (encuadrar === 0) return;
    const mapa = mapaRef.current;
    const todo = [...datos.puntos.map(([la, lo]) => [la, lo] as L.LatLngTuple), ...datos.recorrido.map((p) => [p[0], p[1]] as L.LatLngTuple)];
    if (datos.ultima) todo.push([datos.ultima.lat, datos.ultima.lon]);
    if (mapa && todo.length > 0) mapa.fitBounds(L.latLngBounds(todo), { padding: [48, 48], maxZoom: 12, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadrar]);

  // "Centrar": vuelve a acompañar al avión.
  useEffect(() => {
    if (centrar === 0) return;
    siguiendo.current = true;
    const u = datos.ultima;
    if (u) mapaRef.current?.panTo([u.lat, u.lon], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centrar]);

  // `absolute inset-0` y no `h-full`: el padre crece con flex y no tiene un alto definido, así que
  // un `h-full` resolvía a 0 px y el mapa no se veía (lo encontró la prueba de la 3.20.0).
  return <div ref={contenedor} className="leaflet-container mapa-oscuro absolute inset-0" />;
}
