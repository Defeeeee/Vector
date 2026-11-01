"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PuntoMapa } from "@/components/dashboard/PlanMapaInner";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import { colorPorAltura } from "@/lib/recorrido";
import type { RecorridoPublicado } from "@/types";

/**
 * El mapa chico del vuelo de una publicación: uno o dos aeródromos y la línea entre
 * ellos, con los mismos tiles que los otros mapas de la app (`lib/mapa-tiles.ts`). En
 * modo oscuro los tiles se invierten con un filtro, sólo en este mapa (`.mapa-oscuro`
 * en `globals.css`): OSM no tiene una versión oscura.
 *
 * **Quieto a propósito.** En un feed que se recorre con el dedo, un mapa que se puede
 * arrastrar o hacer zoom se come el scroll: el pulgar queda atrapado adentro. Sin
 * controles, sin arrastre, sin zoom, sin tooltips; es una ilustración, no una
 * herramienta. Para eso está el Planificador.
 *
 * Con el recorrido ADS-B (2.37.0), en lugar de la línea recta va el recorrido coloreado por
 * altura y punteado donde se cortó la señal, como en la tarjeta del vuelo (`RecorridoMapaInner`).
 */
export default function MiniMapaRutaInner({ puntos, recorrido }: { puntos: PuntoMapa[]; recorrido?: RecorridoPublicado | null }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const oscuro = resolvedTheme === "dark";
  // El array cambia de identidad con cada render de la lista; lo que importa es dónde
  // están los puntos.
  const clave = puntos.map((p) => `${p.lat},${p.lon}`).join("|") + (recorrido ? `|r${recorrido.p.length},${recorrido.p[0]}` : "");

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor || (puntos.length === 0 && !recorrido)) return;

    const mapa = L.map(contenedor, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.25,
    });
    // OSM exige la atribución visible (ver `lib/mapa-tiles.ts`).
    const atribucion = L.control.attribution({ prefix: false, position: "bottomright" }).addTo(mapa);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(mapa);

    if (recorrido && recorrido.p.length > 1) {
      // adsb.fi pide que se lo cite (y adsb.lol, la ODbL).
      atribucion.addAttribution(recorrido.fuente === "adsb.lol" ? "Recorrido: adsb.lol (ODbL)" : "Recorrido: adsb.fi");
      const ll = recorrido.p.map(([la, lo]) => [la, lo] as L.LatLngTuple);
      const techo = Math.max(1000, ...recorrido.p.map((p) => p[2]));
      const cortes = new Set(recorrido.cortes ?? []);
      L.polyline(ll, { color: oscuro ? "#000000" : "#ffffff", weight: 6, opacity: 0.7, interactive: false }).addTo(mapa);
      for (let i = 1; i < ll.length; i++) {
        L.polyline([ll[i - 1], ll[i]], {
          color: colorPorAltura((recorrido.p[i - 1][2] + recorrido.p[i][2]) / 2, techo, oscuro ? "oscuro" : "claro"),
          weight: 3.5,
          lineCap: "round",
          dashArray: cortes.has(i) ? "2 6" : undefined,
          interactive: false,
        }).addTo(mapa);
      }
      const punta = (p: L.LatLngTuple, color: string) =>
        L.circleMarker(p, { radius: 5, color: oscuro ? "#000000" : "#ffffff", weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(mapa);
      punta(ll[0], "#16a34a");
      punta(ll[ll.length - 1], "#dc2626");
      mapa.fitBounds(L.latLngBounds(ll), { padding: [20, 20], maxZoom: 13 });
      return () => {
        mapa.remove();
      };
    }

    const coords = puntos.map((p) => [p.lat, p.lon] as L.LatLngTuple);
    if (coords.length > 1) {
      L.polyline(coords, { color: "#0A84FF", weight: 3, opacity: 0.95, interactive: false }).addTo(mapa);
    }
    for (const c of coords) {
      L.circleMarker(c, {
        radius: 6,
        color: oscuro ? "#000000" : "#ffffff",
        weight: 2,
        fillColor: "#0A84FF",
        fillOpacity: 1,
        interactive: false,
      }).addTo(mapa);
    }

    // Un solo punto —un vuelo local— no tiene área: se centra a escala de la zona.
    if (coords.length === 1) mapa.setView(coords[0], 10);
    else mapa.fitBounds(L.latLngBounds(coords), { padding: [28, 28], maxZoom: 11 });

    return () => {
      mapa.remove();
    };
    // `clave` resume `puntos`: pasarle el array haría un mapa nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, oscuro]);

  return <div ref={contenedorRef} className={`absolute inset-0 ${oscuro ? "mapa-oscuro" : ""}`} />;
}
