"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";

export interface AirportLocation {
  icao: string;
  visits: number;
}

export interface RouteConnection {
  origin: string;
  destination: string;
  times: number;
  hours: number;
}

interface FlightMapInnerProps {
  airports: AirportLocation[];
  routes: RouteConnection[];
  airportDetails: Record<string, { name: string; label: string; lat?: number; lon?: number; city?: string }>;
}

export default function FlightMapInner({ airports, routes, airportDetails }: FlightMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: [-34.6037, -58.3816],
        zoom: 6,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);
      // OSM exige la atribución visible (ver `lib/mapa-tiles.ts`).
      L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(map);

      L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(map);

      mapRef.current = map;
    }

    const map = mapRef.current;

    // Remove old vectors before re-drawing
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const bounds: L.LatLngExpression[] = [];
    const maxVisits = Math.max(...airports.map((a) => a.visits), 1);

    // Draw route lines connecting aerodromes
    routes.forEach((r) => {
      const orig = airportDetails[r.origin];
      const dest = airportDetails[r.destination];

      if (orig?.lat !== undefined && orig?.lon !== undefined && dest?.lat !== undefined && dest?.lon !== undefined) {
        const line = L.polyline(
          [
            [orig.lat, orig.lon],
            [dest.lat, dest.lon],
          ],
          {
            color: "#0284c7",
            weight: Math.min(Math.max(r.times * 1.5, 2), 6),
            opacity: 0.75,
            dashArray: r.times === 1 ? "4, 6" : undefined,
          }
        ).addTo(map);

        line.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
            <strong style="font-family: monospace; font-weight: bold; color: #111;">${r.origin} → ${r.destination}</strong>
            <div style="font-size: 11px; color: #555;">${r.times} ${r.times === 1 ? "vuelo" : "vuelos"} · ${r.hours.toFixed(1)} hs</div>
          </div>`,
          { sticky: true }
        );
      }
    });

    // Draw markers for each aerodrome
    airports.forEach((a) => {
      const info = airportDetails[a.icao];
      if (info?.lat !== undefined && info?.lon !== undefined) {
        bounds.push([info.lat, info.lon]);

        const radius = Math.min(Math.max(6 + (a.visits / maxVisits) * 8, 6), 14);

        const marker = L.circleMarker([info.lat, info.lon], {
          radius,
          fillColor: "#0284c7",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-family: sans-serif; padding: 2px; color: #111;">
            <div style="font-family: monospace; font-size: 14px; font-weight: bold;">${a.icao}</div>
            <div style="font-size: 12px; font-weight: 600; color: #333;">${info.label || info.name}</div>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">${a.visits} ${a.visits === 1 ? "visita" : "visitas"} en el período</div>
          </div>`
        );
      }
    });

    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 11);
      } else {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
      }
    }
  }, [airports, routes, airportDetails]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[380px] md:h-[450px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-inner z-0"
    />
  );
}
