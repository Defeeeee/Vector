"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import type { EspacioAereo, Frecuencias } from "@/lib/espacios-aereos";
import type { Fir, Vfr } from "@/lib/firs";
import type { PuntoMapa } from "@/lib/mapa-ruta";

/** Lo que devuelve `/api/mapa`, compacto: arrays en vez de objetos. */
export interface CapasMapa {
  /** [icao, designador, nombre, lat, lon, tamaño, controlado, canal de llamada, torre del AIP] */
  aerodromos: [string, string, string, number, number, string, boolean | null, { mhz: string[]; fuente: "madhel" | "lista" } | null, Frecuencias | null][];
  /** [ident, tipo, nombre, lat, lon, kHz] */
  radioayudas: [string, string, string, number, number, number | null][];
  espacios: EspacioAereo[];
  descartados: string[];
  /** Las FIR con su centro (3.1.0). */
  firs: Fir[];
  /** Corredores y sectores VFR de Baires (3.2.0), cada corredor con su franja. */
  vfr?: Vfr & { corredores: (Vfr["corredores"][number] & { banda?: [number, number][] })[] };
}

export interface Posicion {
  lat: number;
  lon: number;
  trackT: number | null;
}

/**
 * Los colores de una carta VFR: las TMA en azul y las CTR y ATZ en magenta, punteadas.
 * El relleno es apenas un tinte, para que se lean los aeródromos de abajo.
 */
const ESTILO: Record<EspacioAereo["tipo"], L.PathOptions> = {
  TMA: { color: "#2563eb", weight: 1.5, fillColor: "#2563eb", fillOpacity: 0.04 },
  CTR: { color: "#c026d3", weight: 1.5, dashArray: "6 4", fillColor: "#c026d3", fillOpacity: 0.06 },
  ATZ: { color: "#db2777", weight: 1.5, dashArray: "3 3", fillColor: "#db2777", fillOpacity: 0.08 },
};

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** El avión propio: una flecha que apunta al track del GPS. */
function iconoAvion(trackT: number | null): L.DivIcon {
  const rotacion = trackT ?? 0;
  const forma =
    trackT === null
      ? `<circle cx="16" cy="16" r="7" fill="#0A84FF" stroke="white" stroke-width="3"/>`
      : `<path d="M16 3 L25 27 L16 21 L7 27 Z" fill="#0A84FF" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>`;
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${rotacion}deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,.4))">${forma}</svg>`,
  });
}

interface Props {
  capas: CapasMapa | null;
  puntos: PuntoMapa[];
  /** El punto al que vas, en vuelo. */
  proximo: number | null;
  posicion: Posicion | null;
  /** En vuelo con "Seguir": el mapa se mueve con el avión. */
  seguir: boolean;
  volando: boolean;
  /** Un toque sobre un aeródromo o una radioayuda lo suma a la ruta. */
  onAgregar: (codigo: string) => void;
  /** El piloto movió el mapa con la mano: deja de seguir. */
  onArrastre: () => void;
  /** Cuánto ocupa la tarjeta a la izquierda, para que la ruta no quede debajo. */
  margenIzquierdo: number;
  /** Con "Agregar puntos" prendido, un toque en el mapa suma esa coordenada a la ruta. */
  agregando?: boolean;
  onPuntoLibre?: (lat: number, lon: number) => void;
}

export default function MapaLeaflet({ capas, puntos, proximo, posicion, seguir, volando, onAgregar, onArrastre, margenIzquierdo, agregando = false, onPuntoLibre }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capasRef = useRef<{ ruta: L.LayerGroup; avion: L.LayerGroup; espacios: L.LayerGroup; firs: L.LayerGroup; aerodromos: L.LayerGroup; radioayudas: L.LayerGroup } | null>(null);
  const callbacks = useRef({ onAgregar, onArrastre, onPuntoLibre, agregando });
  callbacks.current = { onAgregar, onArrastre, onPuntoLibre, agregando };
  const ultimoEncuadre = useRef("");

  // El mapa, una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, {
      center: [-34.6, -58.6],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
      // SVG y no canvas: con canvas, desmontar el mapa con un redibujo pendiente tira
      // "Cannot read properties of undefined (reading 'clearRect')" (pasaba al recargar).
    });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    // OSM exige la atribución visible (ver `lib/mapa-tiles.ts`).
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(m);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(m);

    const firs = L.layerGroup().addTo(m);
    const espacios = L.layerGroup().addTo(m);
    const aerodromos = L.layerGroup().addTo(m);
    const radioayudas = L.layerGroup().addTo(m);
    const ruta = L.layerGroup().addTo(m);
    const avion = L.layerGroup().addTo(m);
    L.control
      .layers(undefined, { "Espacios aéreos": espacios, "FIR y sectores": firs, "Aeródromos": aerodromos, "Radioayudas": radioayudas }, { position: "topright", collapsed: true })
      .addTo(m);
    capasRef.current = { ruta, avion, espacios, firs, aerodromos, radioayudas };

    m.on("dragstart", () => callbacks.current.onArrastre());
    // Un toque en el mapa (no en un aeródromo ni una radioayuda, que suman su código).
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (callbacks.current.agregando) callbacks.current.onPuntoLibre?.(e.latlng.lat, e.latlng.lng);
    });
    mapa.current = m;
    // Si nace antes de que el layout se asiente, Leaflet mide cero: un invalidate lo arregla.
    const t = setTimeout(() => m.invalidateSize(), 150);
    const alCambiarTamano = () => m.invalidateSize();
    window.addEventListener("resize", alCambiarTamano);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", alCambiarTamano);
      m.remove();
      mapa.current = null;
    };
  }, []);

  // Las capas fijas: espacios aéreos, aeródromos y radioayudas.
  useEffect(() => {
    const c = capasRef.current;
    if (!c || !capas) return;
    c.espacios.clearLayers();
    c.firs.clearLayers();
    c.aerodromos.clearLayers();

    // Las FIR: sólo los tramos del AIP (sin los rodeos por afuera del país), y la línea entre
    // los sectores de su centro. En gris, debajo de todo: son el fondo, no el dato.
    for (const f of capas.firs ?? []) {
      const centro = f.centro
        ? `${escapar(f.centro.distintivo)}<br>${f.centro.sectores.map((s) => `${s.nombre ? `${escapar(s.nombre.toLowerCase())}: ` : ""}${s.mhz.join(" · ")}`).join("<br>")}`
        : "";
      for (const b of f.bordes) {
        L.polyline(b, { color: "#475569", weight: 2, opacity: 0.8, dashArray: "12 6 2 6" })
          .bindTooltip(`<b>${escapar(f.nombre)}</b><br>${centro}`, { sticky: true })
          .addTo(c.firs);
      }
      if (f.lineaSectores) {
        L.polyline(f.lineaSectores, { color: "#64748b", weight: 1.5, opacity: 0.8, dashArray: "4 6" })
          .bindTooltip(`Límite entre sectores · ${escapar(f.centro?.distintivo ?? f.nombre)}`, { sticky: true })
          .addTo(c.firs);
      }
    }
    c.radioayudas.clearLayers();

    // Las TMA primero, para que las CTR y ATZ queden arriba y se puedan tocar.
    const orden = { TMA: 0, CTR: 1, ATZ: 2 } as const;
    for (const e of [...capas.espacios].sort((a, b) => orden[a.tipo] - orden[b.tipo])) {
      // Con sus huecos: el sector (II) de la TMA Baires es "el resto", sin el (I).
      // El sector (I) de una TMA es el de piso más bajo (Baires: 2500 FT): se tiñe un poco más.
      const estilo = e.tipo === "TMA" && / \(I\)$/.test(e.nombre) ? { ...ESTILO.TMA, fillOpacity: 0.1 } : ESTILO[e.tipo];
      L.polygon(e.huecos?.length ? [e.poligono, ...e.huecos] : e.poligono, estilo)
        .bindTooltip(
          `<b>${escapar(e.nombre)}</b><br>${escapar(e.limites)}${e.clase ? ` · Clase ${escapar(e.clase)}` : ""}${
            e.aproximado ? "<br><i>Contorno aproximado: entre puntos sigue rutas o ríos.</i>" : ""
          }`,
          { sticky: true, direction: "top" }
        )
        .addTo(c.espacios);
    }

    // Los sectores y corredores VFR (ENR 3.3), en verde: clase G, como en la carta ENR 6.10. Después de las TMA, para que queden arriba y se puedan tocar.
    for (const s of capas.vfr?.sectores ?? []) {
      L.polygon(s.poligono, { color: "#047857", weight: 2, dashArray: "6 4", fillColor: "#10b981", fillOpacity: 0.18 })
        .bindTooltip(`<b>${escapar(s.nombre)}</b><br>Clase G · GND / ${s.techoFt} ft${s.informacion ? `<br>Información: ${escapar(s.informacion)}` : ""}`, { sticky: true })
        .addTo(c.espacios);
    }
    for (const co of capas.vfr?.corredores ?? []) {
      const tooltip = `<b>Corredor VFR Nº ${escapar(co.numero)}</b><br>${escapar(co.nombre)}<br>Clase G · 2.500 m y 1.000 ft máx. en CTR; 5.000 m y 2.000 ft fuera`;
      // La franja con su ancho (ENR 3.3) y el eje punteado encima.
      if (co.banda?.length) {
        L.polygon(co.banda, { color: "#047857", weight: 1.5, opacity: 0.9, fillColor: "#10b981", fillOpacity: 0.32 }).bindTooltip(tooltip, { sticky: true }).addTo(c.espacios);
      }
      L.polyline(co.eje.map((p) => [p.lat, p.lon] as L.LatLngTuple), { color: "#065f46", weight: 1.5, opacity: 0.9, dashArray: "6 5" })
        .bindTooltip(tooltip, { sticky: true })
        .addTo(c.espacios);
    }

    for (const [icao, local, nombre, lat, lon, tamano] of capas.aerodromos) {
      const grande = tamano === "L" || tamano === "M";
      const codigo = icao || local;
      L.circleMarker([lat, lon], {
        radius: grande ? 5 : 3.5,
        color: "#18181b",
        weight: 1.2,
        fillColor: grande ? "#18181b" : "#ffffff",
        fillOpacity: 1,
        // El toque suma el código del aeródromo; no tiene que llegar al mapa y sumar además la coordenada.
        bubblingMouseEvents: false,
      })
        .bindTooltip(`<b>${escapar(codigo)}</b>${local && local !== codigo ? ` · ${escapar(local)}` : ""} — ${escapar(nombre)}`, { direction: "top", offset: [0, -4] })
        .on("click", () => callbacks.current.onAgregar(codigo))
        .addTo(c.aerodromos);
    }

    for (const [ident, tipo, nombre, lat, lon, khz] of capas.radioayudas) {
      const mhz = khz && khz > 2000 ? `${(khz / 1000).toFixed(2)} MHz` : khz ? `${khz} kHz` : "";
      L.circleMarker([lat, lon], { radius: 4, color: "#059669", weight: 1.5, fillColor: "#d1fae5", fillOpacity: 1, bubblingMouseEvents: false })
        .bindTooltip(`<b>${escapar(ident)}</b> ${escapar(tipo)} — ${escapar(nombre)}${mhz ? `<br>${mhz}` : ""}`, { direction: "top", offset: [0, -4] })
        .on("click", () => callbacks.current.onAgregar(ident))
        .addTo(c.radioayudas);
    }
  }, [capas]);

  // La ruta.
  useEffect(() => {
    const m = mapa.current;
    const c = capasRef.current;
    if (!m || !c) return;
    c.ruta.clearLayers();
    if (puntos.length === 0) return;
    const coords = puntos.map((p) => [p.lat, p.lon] as L.LatLngTuple);
    if (coords.length > 1) {
      L.polyline(coords, { color: "#ffffff", weight: 7, opacity: 0.9 }).addTo(c.ruta);
      L.polyline(coords, { color: "#0A84FF", weight: 3.5, opacity: 1 }).addTo(c.ruta);
    }
    puntos.forEach((p, i) => {
      const esProximo = proximo === i;
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui;color:${esProximo ? "#fff" : "#0A84FF"};background:${esProximo ? "#0A84FF" : "#fff"};border:2px solid #0A84FF;box-shadow:0 1px 3px rgba(0,0,0,.35)">${i + 1}</div>`,
        }),
        keyboard: false,
      })
        .bindTooltip(`${i + 1}. <b>${escapar(p.codigo)}</b> — ${escapar(p.label)}${p.aerovia ? ` · por ${escapar(p.aerovia)}` : ""}`, { direction: "top", offset: [0, -10] })
        .addTo(c.ruta);
    });

    // Encuadra cuando cambian los puntos, no en cada render; nunca en vuelo ni mientras se
    // agregan puntos tocando el mapa (se movería debajo del dedo).
    const clave = coords.map((x) => x.join(",")).join("|");
    if (!volando && !callbacks.current.agregando && clave !== ultimoEncuadre.current) {
      ultimoEncuadre.current = clave;
      const izquierda = margenIzquierdo + 32;
      if (coords.length === 1) m.setView(coords[0], 10);
      else m.fitBounds(L.latLngBounds(coords), { paddingTopLeft: [izquierda, 48], paddingBottomRight: [48, 48], maxZoom: 11 });
    }
  }, [puntos, proximo, volando, margenIzquierdo]);

  // El avión propio y la línea al próximo punto.
  useEffect(() => {
    const m = mapa.current;
    const c = capasRef.current;
    if (!m || !c) return;
    c.avion.clearLayers();
    if (!posicion) return;
    const destino = proximo !== null ? puntos[proximo] : null;
    if (destino) {
      L.polyline(
        [
          [posicion.lat, posicion.lon],
          [destino.lat, destino.lon],
        ],
        { color: "#f59e0b", weight: 2.5, dashArray: "6 6" }
      ).addTo(c.avion);
    }
    L.marker([posicion.lat, posicion.lon], { icon: iconoAvion(posicion.trackT), interactive: false, zIndexOffset: 1000 }).addTo(c.avion);
    if (seguir) m.setView([posicion.lat, posicion.lon], Math.max(m.getZoom(), 10), { animate: true });
  }, [posicion, proximo, puntos, seguir]);

  // La mira mientras se agregan puntos.
  useEffect(() => {
    if (contenedor.current) contenedor.current.style.cursor = agregando ? "crosshair" : "";
  }, [agregando]);

  return (
    <div
      ref={contenedor}
      // `isolate`: los z-index de Leaflet (400, 600…) quedan adentro y no tapan la tarjeta.
      // En oscuro, los tiles de OSM se invierten: no hay una versión oscura con la misma licencia.
      className="absolute inset-0 isolate bg-zinc-100 dark:bg-zinc-900 dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.85)_contrast(0.9)]"
    />
  );
}
