"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import L from "leaflet";
// Después de Leaflet, que deja `window.L`: el plugin lo extiende (rotar el mapa, "nariz arriba").
// Fijado en la 0.2.8 (2023): las 0.3–0.5 salieron todas en las dos semanas antes de la 3.16.0.
import "leaflet-rotate";
import "leaflet/dist/leaflet.css";
import { TILES_OPCIONES, TILES_URL } from "@/lib/mapa-tiles";
import { CAPAS_CARTAS, urlTeselaCarta } from "@/lib/cartas-aip";
import type { IdCapa } from "@/lib/capas-mapa";
import type { EspacioAereo, Frecuencias } from "@/lib/espacios-aereos";
import type { Fir, Vfr } from "@/lib/firs";
import type { PuntoMapa } from "@/lib/mapa-ruta";
import type { PuntoTrack } from "@/lib/track-vuelo";
import { descripcionCorredor, etiquetaCorredor, informacionCorredor } from "@/lib/corredores-vfr";

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

/** Lo que la pantalla de vuelo le pide al mapa: sus propios botones de zoom. */
export interface ApiMapa {
  acercar: () => void;
  alejar: () => void;
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

/** El orden en que se apilan, de abajo hacia arriba: lo que se toca queda arriba. */
const ORDEN_CAPAS: IdCapa[] = ["firs", "tma", "ctr", "atz", "sectores-vfr", "corredores", "aerodromos", "radioayudas"];

type Grupos = Record<Exclude<IdCapa, `carta-${string}`>, L.LayerGroup> & { ruta: L.LayerGroup; estela: L.LayerGroup; avion: L.LayerGroup };

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * El avión propio: una flecha que apunta al track del GPS. `rumboMapa` es lo que está rotado el
 * mapa (`getBearing`): los íconos quedan derechos en la pantalla, así que la flecha gira el track
 * más eso. Con la nariz arriba, el mapa gira −track y la flecha queda apuntando arriba.
 */
function iconoAvion(trackT: number | null, rumboMapa: number): L.DivIcon {
  const rotacion = ((trackT ?? 0) + rumboMapa) % 360;
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
  /** Lo que el piloto eligió ver (`lib/capas-mapa.ts`). */
  visibles: IdCapa[];
  /** Cuánto se ve la carta del AIP encima del mapa base, de 0,2 a 1. */
  opacidadCarta: number;
  /**
   * En vuelo: cuánto se rota el mapa (0 = norte arriba; con la nariz arriba, −track), lo que tapan
   * las bandas de arriba y de abajo (el avión se centra en lo que queda) y si va la nariz arriba
   * (entonces el avión baja, para ver más de lo que viene).
   */
  rumbo?: number;
  margenes?: { arriba: number; abajo: number };
  narizArriba?: boolean;
  /** Lo volado (el track del GPS), como una estela. */
  estela?: PuntoTrack[] | null;
  onMapa?: (api: ApiMapa | null) => void;
}

const SIN_MARGENES = { arriba: 0, abajo: 0 };

export default function MapaLeaflet({
  capas,
  puntos,
  proximo,
  posicion,
  seguir,
  volando,
  onAgregar,
  onArrastre,
  margenIzquierdo,
  agregando = false,
  onPuntoLibre,
  visibles,
  opacidadCarta,
  rumbo = 0,
  margenes = SIN_MARGENES,
  narizArriba = false,
  estela = null,
  onMapa,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capasRef = useRef<Grupos | null>(null);
  const cartasRef = useRef<Partial<Record<IdCapa, L.TileLayer>>>({});
  const callbacks = useRef({ onAgregar, onArrastre, onPuntoLibre, agregando });
  callbacks.current = { onAgregar, onArrastre, onPuntoLibre, agregando };
  const ultimoEncuadre = useRef("");
  const callbacksMapa = useRef(onMapa);
  callbacksMapa.current = onMapa;

  // El mapa, una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, {
      center: [-34.6, -58.6],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
      // `leaflet-rotate`: el mapa se puede rotar (nariz arriba), pero sólo desde el código. Girar
      // con dos dedos en la cabina rota sin querer.
      rotate: true,
      touchRotate: false,
      shiftKeyRotate: false,
      rotateControl: false,
      // SVG y no canvas: con canvas, desmontar el mapa con un redibujo pendiente tira
      // "Cannot read properties of undefined (reading 'clearRect')" (pasaba al recargar).
    });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    // OSM exige la atribución visible (ver `lib/mapa-tiles.ts`).
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(m);
    L.tileLayer(TILES_URL, TILES_OPCIONES).addTo(m);

    const grupo = () => L.layerGroup();
    capasRef.current = {
      firs: grupo(),
      tma: grupo(),
      ctr: grupo(),
      atz: grupo(),
      "sectores-vfr": grupo(),
      corredores: grupo(),
      aerodromos: grupo(),
      radioayudas: grupo(),
      ruta: grupo().addTo(m),
      estela: grupo().addTo(m),
      avion: grupo().addTo(m),
    };
    // Las cartas del AIP (3.9.0, `lib/cartas-aip.ts`): la carta tal cual, georreferenciada, en el
    // panel de teselas, debajo de todo lo que dibuja Vector.
    for (const c of CAPAS_CARTAS) {
      cartasRef.current[`carta-${c.id}` as IdCapa] = L.tileLayer(urlTeselaCarta(c.id), {
        minNativeZoom: c.zoomMinimo,
        maxNativeZoom: c.zoomNativo,
        maxZoom: 19,
        bounds: L.latLngBounds(c.limites),
        // Fuera de la carta no hay tesela: transparente en vez del ícono de imagen rota.
        errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        attribution: "Cartas: AIP Argentina (ANAC)",
      });
    }

    m.on("dragstart", () => callbacks.current.onArrastre());
    // Un toque en el mapa (no en un aeródromo ni una radioayuda, que suman su código).
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (callbacks.current.agregando) callbacks.current.onPuntoLibre?.(e.latlng.lat, e.latlng.lng);
    });
    mapa.current = m;
    callbacksMapa.current?.({ acercar: () => m.zoomIn(), alejar: () => m.zoomOut() });
    // Si nace antes de que el layout se asiente, Leaflet mide cero: un invalidate lo arregla.
    const t = setTimeout(() => m.invalidateSize(), 150);
    // El contenedor cambia de tamaño sin que cambie la ventana: al pasar a vuelo pierde el
    // encabezado y crece. Sin esto Leaflet seguía midiendo lo de antes (y centraba mal el avión).
    const observador = new ResizeObserver(() => m.invalidateSize());
    observador.observe(contenedor.current);
    return () => {
      clearTimeout(t);
      observador.disconnect();
      callbacksMapa.current?.(null);
      m.remove();
      mapa.current = null;
    };
  }, []);

  // Las capas fijas: espacios aéreos, aeródromos y radioayudas.
  useEffect(() => {
    const c = capasRef.current;
    if (!c || !capas) return;
    for (const id of ORDEN_CAPAS) c[id as keyof Grupos].clearLayers();

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
        .addTo(c[e.tipo === "TMA" ? "tma" : e.tipo === "CTR" ? "ctr" : "atz"]);
    }

    // Los sectores y corredores VFR (ENR 3.3), en verde: clase G, como en la carta ENR 6.10. Después de las TMA, para que queden arriba y se puedan tocar.
    for (const s of capas.vfr?.sectores ?? []) {
      L.polygon(s.poligono, { color: "#047857", weight: 2, dashArray: "6 4", fillColor: "#10b981", fillOpacity: 0.18 })
        .bindTooltip(`<b>${escapar(s.nombre)}</b><br>Clase G · GND / ${s.techoFt} ft${s.informacion ? `<br>Información: ${escapar(s.informacion)}` : ""}`, { sticky: true })
        .addTo(c["sectores-vfr"]);
    }
    for (const co of capas.vfr?.corredores ?? []) {
      const info = informacionCorredor(co);
      const tooltip = `<b>${escapar(etiquetaCorredor(co))}</b><br>${escapar(co.nombre)}<br>${escapar(descripcionCorredor(co))}${info ? `<br>Información: ${escapar(info)}` : ""}`;
      // La franja con su ancho (ENR 3.3) y el eje punteado encima.
      if (co.banda?.length) {
        L.polygon(co.banda, { color: "#047857", weight: 1.5, opacity: 0.9, fillColor: "#10b981", fillOpacity: 0.32 }).bindTooltip(tooltip, { sticky: true }).addTo(c.corredores);
      }
      L.polyline(co.eje.map((p) => [p.lat, p.lon] as L.LatLngTuple), { color: "#065f46", weight: 1.5, opacity: 0.9, dashArray: "6 5" })
        .bindTooltip(tooltip, { sticky: true })
        .addTo(c.corredores);
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

  // Lo que el piloto eligió ver. Se sacan y se vuelven a poner en `ORDEN_CAPAS`: Leaflet apila
  // por orden de llegada, y una ATZ prendida después de la TMA tiene que quedar arriba para tocarla.
  const claveVisibles = [...visibles].sort().join(",");
  useEffect(() => {
    const m = mapa.current;
    const c = capasRef.current;
    if (!m || !c) return;
    for (const id of ORDEN_CAPAS) c[id as keyof Grupos].remove();
    for (const id of ORDEN_CAPAS) if (visibles.includes(id)) c[id as keyof Grupos].addTo(m);
    c.ruta.remove().addTo(m);
    c.estela.remove().addTo(m);
    c.avion.remove().addTo(m);
    for (const [id, capa] of Object.entries(cartasRef.current)) {
      if (visibles.includes(id as IdCapa)) {
        if (!m.hasLayer(capa)) capa.addTo(m);
      } else capa.remove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claveVisibles` resume `visibles`
  }, [claveVisibles]);
  useEffect(() => {
    for (const capa of Object.values(cartasRef.current)) capa.setOpacity(opacidadCarta);
  }, [opacidadCarta]);

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

  // La rotación: sólo si cambió más de 2°, para que el mapa no tiemble con el ruido del GPS.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const actual = m.getBearing();
    const diferencia = Math.abs(((rumbo - actual + 540) % 360) - 180);
    if (diferencia > 2 || (rumbo === 0 && actual !== 0)) m.setBearing(rumbo);
  }, [rumbo]);

  // La estela: lo volado, en violeta con un borde oscuro, debajo del avión.
  const lineaEstela = useRef<L.Polyline[] | null>(null);
  useEffect(() => {
    const c = capasRef.current;
    if (!c) return;
    const coords = (estela ?? []).map((p) => [p[1], p[2]] as L.LatLngTuple);
    if (coords.length < 2) {
      c.estela.clearLayers();
      lineaEstela.current = null;
      return;
    }
    if (!lineaEstela.current) {
      lineaEstela.current = [
        L.polyline(coords, { color: "#1e1b4b", weight: 6, opacity: 0.55, interactive: false }).addTo(c.estela),
        L.polyline(coords, { color: "#c084fc", weight: 3, opacity: 1, interactive: false }).addTo(c.estela),
      ];
    } else for (const linea of lineaEstela.current) linea.setLatLngs(coords);
  }, [estela]);

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
        { color: "#f59e0b", weight: 2.5, dashArray: "6 6", interactive: false }
      ).addTo(c.avion);
    }
    L.marker([posicion.lat, posicion.lon], { icon: iconoAvion(posicion.trackT, m.getBearing()), interactive: false, zIndexOffset: 1000 }).addTo(c.avion);
    if (!seguir) return;
    /*
      El avión va al centro de lo que se ve entre las bandas de vuelo y, con la nariz arriba, más
      abajo (al 68 %), para ver lo que viene. Con el mapa rotado, "más abajo" en la pantalla no es
      el sur: la pantalla es el mapa rotado θ en el sentido del reloj, así que para que el avión
      quede `bajar` px abajo del centro, el centro va a avión − (bajar·sen θ, bajar·cos θ) en los píxeles del
      mapa (sin rotar).
    */
    const zoom = Math.max(m.getZoom(), 10);
    const tamano = m.getSize();
    const arriba = margenes.arriba;
    const abajo = tamano.y - margenes.abajo;
    const deseado = narizArriba ? arriba + (abajo - arriba) * 0.68 : (arriba + abajo) / 2;
    const bajar = deseado - tamano.y / 2;
    const theta = (m.getBearing() * Math.PI) / 180;
    const avion = m.project([posicion.lat, posicion.lon], zoom);
    const centro = m.unproject(avion.subtract(L.point(bajar * Math.sin(theta), bajar * Math.cos(theta))), zoom);
    m.setView(centro, zoom, { animate: false });
  }, [posicion, proximo, puntos, seguir, rumbo, margenes, narizArriba]);

  // La mira mientras se agregan puntos.
  useEffect(() => {
    if (contenedor.current) contenedor.current.style.cursor = agregando ? "crosshair" : "";
  }, [agregando]);

  /*
    ⚠️ **El `className` del contenedor de Leaflet no puede cambiar nunca.** Leaflet le agrega sus
    clases (`leaflet-container`, `leaflet-touch`…) y React, al cambiar el atributo, las borra: en la
    3.16.0 entrar en vuelo cambiaba la clase, se perdía `leaflet-container`, dejaba de valer la regla
    de Leaflet que saca el `max-width: 100%` de Tailwind a las teselas, y quedaban de ancho 0: sin
    mapa de fondo ni cartas. Lo que cambia con el vuelo va en el envoltorio de afuera.
  */
  return (
    <div
      // En vuelo, los botones de zoom son los de la pantalla de vuelo, y la atribución de OSM sube
      // por encima de la banda de abajo (tiene que verse).
      style={{ "--abajo": `${margenes.abajo}px` } as CSSProperties}
      className={`absolute inset-0 ${volando ? "[&_.leaflet-control-zoom]:hidden [&_.leaflet-bottom]:bottom-[var(--abajo)]" : ""}`}
    >
      <div
        ref={contenedor}
        // `isolate`: los z-index de Leaflet (400, 600…) quedan adentro y no tapan la tarjeta.
        // En oscuro, los tiles de OSM se invierten: no hay una versión oscura con la misma licencia.
        className="absolute inset-0 isolate bg-zinc-100 dark:bg-zinc-900 dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.85)_contrast(0.9)]"
      />
    </div>
  );
}
