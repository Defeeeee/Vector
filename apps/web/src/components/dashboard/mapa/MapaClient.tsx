"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Layers, ChevronDown, ChevronLeft, ChevronRight, CloudSun, Crosshair, Loader2, MapPin, Navigation, Radio, Square, Undo2 } from "lucide-react";
import type { PuntoResuelto } from "@/lib/resolucion-puntos";
import type { EspacioAereo } from "@/lib/espacios-aereos";
import { aMagnetico } from "@/lib/navegacion";
import { dependenciasDeRuta, dependenciasEn, type Dependencia, type RadioDeAerodromo } from "@/lib/firs";
import { codigoVfr, corredoresCerca, puntosVfr } from "@/lib/corredores-vfr";
import {
  consultasDeRuta,
  duracionCorta,
  espaciosEn,
  espaciosEnRuta,
  haciaPunto,
  lecturaGps,
  proximoPunto,
  puntoEnRuta,
  puntosDeRuta,
  tokensDeRuta,
  tramosDeRuta,
  variacionDeRuta,
} from "@/lib/mapa-ruta";
import type { CapasMapa, Posicion } from "./MapaLeaflet";
import MenuCapas from "./MenuCapas";
import { alternarCapa, CAPAS_POR_DEFECTO, CLAVE_CAPAS, leerCapas, OPACIDAD_CARTA_POR_DEFECTO, type IdCapa } from "@/lib/capas-mapa";
import BriefingRuta from "../BriefingRuta";
import { SECCIONES } from "@/lib/secciones";
import type { Aircraft } from "@/types";
import type { PilotoParaPlan } from "@/lib/formulario-plan";
import type { RutaGuardada } from "@/lib/rutas-guardadas";
import RutaAcciones from "./RutaAcciones";

/**
 * **El Mapa** (3.0.0): todo es mapa, con la tarjeta de la ruta flotando arriba a la izquierda.
 *
 * - **Planificar:** se escribe la ruta (aeródromos, radioayudas, puntos, aerovías, como en el
 *   Planificador) o se tocan aeródromos en el mapa, y se dibuja al instante con sus tramos,
 *   los espacios aéreos que cruza y, a pedido, la meteo y los NOTAM.
 * - **Volar:** la misma tarjeta pasa a mostrar la posición del GPS del teléfono, el próximo
 *   punto con su distancia, rumbo y tiempo, y en qué espacio aéreo estás. Mantiene la
 *   pantalla prendida. Es una ayuda VFR y lo dice: no reemplaza la carta ni el instrumental.
 *
 * Reemplaza a la sesión en vivo (el cronómetro de puesta en marcha), que se sacó en la 3.0.0.
 *
 * Se dibuja en un portal sobre `body`: el `main` del layout tiene padding y su propio
 * contexto de apilado, y el mapa tiene que ir de borde a borde, al lado de la barra.
 */

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
    </div>
  ),
});

const TAS_POR_DEFECTO = 100;
const ANCHO_TARJETA = 380;
const clave = (c: { q: string; desde: string; hasta: string }) => `${c.q}|${c.desde}|${c.hasta}`;
const grados = (n: number) => String(Math.round(n) % 360 || 360).padStart(3, "0");
/** "4.500", sin `toLocaleString` (invariante 1). */
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const COLOR_TIPO: Record<EspacioAereo["tipo"], string> = {
  TMA: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  CTR: "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10",
  ATZ: "text-pink-600 dark:text-pink-400 bg-pink-500/10",
};

type Lectura = ReturnType<typeof lecturaGps>;

export default function MapaClient({
  rutaInicial,
  aeronaves,
  aeronaveInicial,
  piloto,
  rutasGuardadas,
}: {
  rutaInicial: string;
  aeronaves: Aircraft[];
  aeronaveInicial: string;
  piloto: PilotoParaPlan;
  rutasGuardadas: RutaGuardada[] | null;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  /* --------------------------------------------------------------- capas --- */
  const [capas, setCapas] = useState<CapasMapa | null>(null);
  const [errorCapas, setErrorCapas] = useState(false);
  useEffect(() => {
    // Con la versión en la URL: la respuesta se guarda un día (y el service worker la sirve
    // primero de lo guardado), así que sin esto una versión nueva mostraba las capas de la
    // anterior. Le pasó a Federico con las FIR de la 3.1.0 en Safari.
    fetch(`/api/mapa?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setCapas)
      .catch(() => setErrorCapas(true));
  }, []);

  /* --------------------------------------------------------------- ruta --- */
  const [texto, setTexto] = useState(rutaInicial);
  const [textoFirme, setTextoFirme] = useState(rutaInicial);
  useEffect(() => {
    const t = setTimeout(() => setTextoFirme(texto), 350);
    return () => clearTimeout(t);
  }, [texto]);
  const tokens = useMemo(() => tokensDeRuta(textoFirme), [textoFirme]);
  const consultas = useMemo(() => consultasDeRuta(tokens), [tokens]);

  // Cada token contra el directorio del Planificador (`/api/puntos`, que anda sin señal).
  const cache = useRef(new Map<string, PuntoResuelto | null>());
  const enCurso = useRef(new Set<string>());
  const [, setVersion] = useState(0);
  useEffect(() => {
    for (const c of consultas) {
      const k = clave(c);
      if (cache.current.has(k) || enCurso.current.has(k)) continue;
      enCurso.current.add(k);
      fetch(`/api/puntos?${new URLSearchParams(c)}`)
        .then((r) => (r.ok ? r.json() : { punto: null }))
        .then((d: { punto: PuntoResuelto | null }) => cache.current.set(k, d.punto && Number.isFinite(d.punto.lat) ? d.punto : null))
        .catch(() => undefined) // sin señal y sin copia: queda "buscando" y se reintenta al cambiar algo
        .finally(() => {
          enCurso.current.delete(k);
          setVersion((v) => v + 1);
        });
    }
  }, [consultas]);
  // Los puntos de los corredores VFR (ENR 3.3) se escriben en la ruta por su nombre: BENAVIDEZ,
  // DIQUELUJAN, CANUELAS. No están en el directorio del Planificador: salen de las capas del Mapa.
  const vfrPorCodigo = useMemo(() => puntosVfr(capas?.vfr?.corredores ?? []), [capas]);
  const resueltos = consultas.map((c): PuntoResuelto | null | undefined => {
    const vfr = vfrPorCodigo.get(c.q);
    if (vfr) return { codigo: c.q, clase: "fix", label: `VFR ${vfr.nombre}`, lat: vfr.lat, lon: vfr.lon };
    return cache.current.has(clave(c)) ? cache.current.get(clave(c)) : undefined;
  });
  const firmaResueltos = resueltos.map((r) => (r === undefined ? "?" : r === null ? "-" : `${r.codigo}${r.lat}${r.tramo?.length ?? ""}`)).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { puntos, sinUbicar, buscando } = useMemo(() => puntosDeRuta(tokens, resueltos), [tokens, firmaResueltos]);
  const { tramos, totalNm } = useMemo(() => tramosDeRuta(puntos), [puntos]);
  const cruzados = useMemo(() => (capas ? espaciosEnRuta(puntos, capas.espacios) : []), [puntos, capas]);
  const variacion = variacionDeRuta(puntos);

  // La ruta en la URL, como el Planificador: se comparte mandando el link.
  useEffect(() => {
    const q = tokens.length ? `?ruta=${encodeURIComponent(tokens.join("-"))}` : window.location.pathname;
    window.history.replaceState(null, "", q);
  }, [tokens]);

  const agregar = useCallback((codigo: string) => {
    setTexto((t) => {
      const actual = tokensDeRuta(t);
      if (actual[actual.length - 1] === codigo) return t;
      return `${t.trim()} ${codigo}`.trim();
    });
  }, []);

  // Puntos propios: con "Agregar puntos" prendido, cada toque en el mapa suma su coordenada a la
  // ruta, en el formato que entiende el Planificador ("S34.4091/W58.6847", ~10 m).
  const [agregando, setAgregando] = useState(false);
  const agregarCoordenada = useCallback((lat: number, lon: number) => {
    const token = `${lat < 0 ? "S" : "N"}${Math.abs(lat).toFixed(4)}/${lon < 0 ? "W" : "E"}${Math.abs(lon).toFixed(4)}`;
    setTexto((t) => `${t.trim()} ${token}`.trim());
  }, []);
  const deshacer = () => setTexto((t) => t.trim().split(/\s+/).slice(0, -1).join(" "));

  // El avión (3.13.0): pone la TAS y el consumo, y va al plan de vuelo. Arranca en el de la URL
  // (`?av=`) o en el primero del Hangar con TAS cargada, como hacía la TAS sola.
  const [avionId, setAvionId] = useState(
    () => aeronaves.find((a) => a.id === aeronaveInicial)?.id ?? aeronaves.find((a) => a.cruise_tas_kt)?.id ?? aeronaves[0]?.id ?? ""
  );
  const aeronave = aeronaves.find((a) => a.id === avionId) ?? null;
  const [tas, setTas] = useState(String(aeronave?.cruise_tas_kt ?? TAS_POR_DEFECTO));
  const elegirAvion = (id: string) => {
    setAvionId(id);
    const a = aeronaves.find((x) => x.id === id);
    if (a?.cruise_tas_kt) setTas(String(a.cruise_tas_kt));
  };
  const [rutas, setRutas] = useState<RutaGuardada[] | null>(rutasGuardadas);
  const cargarRuta = (r: RutaGuardada) => {
    setTexto(r.ruta);
    setTextoFirme(r.ruta);
    if (r.aircraft_id && aeronaves.some((a) => a.id === r.aircraft_id)) elegirAvion(r.aircraft_id);
  };
  const tasNum = Number(tas) > 30 ? Number(tas) : null;

  // La altitud de crucero decide con quién hablás: a FL 060 pasás por arriba de un ATZ de
  // 2500 ft y por debajo del piso de una TMA de FL 45 no estás en la TMA. Sin altitud, se
  // toma cualquier espacio que te contenga lateralmente.
  const [altitud, setAltitud] = useState("");
  const altitudNum = altitud.trim() ? Number(altitud) : null;
  // Lo de cada aeródromo para la salida y la llegada, por ICAO y por designador.
  const radios = useMemo(() => {
    const mapa = new Map<string, RadioDeAerodromo>();
    for (const [icao, local, , , , , controlado, llamada, torre] of capas?.aerodromos ?? []) {
      const r: RadioDeAerodromo = { controlado: controlado ?? null, llamada: llamada?.mhz ?? [], fuenteLlamada: llamada?.fuente, torre: torre ?? null };
      if (icao) mapa.set(icao, r);
      if (local) mapa.set(local, r);
    }
    return mapa;
  }, [capas]);
  const cambios = useMemo(
    () => (capas?.firs && puntos.length > 1 ? dependenciasDeRuta(puntos, altitudNum, capas.espacios, capas.firs, radios, false, capas.vfr) : []),
    [puntos, altitudNum, capas, radios]
  );
  // Si la ruta cruza una CTR y hay un corredor VFR cerca, por el corredor sería clase G.
  const sugerencia = useMemo(() => {
    if (!capas?.vfr || (altitudNum !== null && altitudNum > 2000)) return null;
    for (const c of cambios) {
      if (!c.dependencia.donde.startsWith("CTR ")) continue;
      const p = puntoEnRuta(puntos, c.desdeNm + 1);
      const cerca = p ? corredoresCerca(p, capas.vfr.corredores, 4) : [];
      if (!cerca.length || puntos.length < 2) continue;
      // La ruta de ejemplo: la salida, los puntos del corredor en el orden en que se vuelan (sin
      // los que ya son la salida o la llegada) y la llegada. "SADF BENAVIDEZ SAAK".
      const salida = puntos[0];
      const llegada = puntos[puntos.length - 1];
      const d = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * 0.82);
      const intermedios = cerca[0].puntos
        .map((n, i) => ({ codigo: puntosCodigo(n), p: cerca[0].eje[i] }))
        .filter((x) => x.codigo && d(x.p, salida) > 0.02 && d(x.p, llegada) > 0.02)
        .sort((a, b) => d(a.p, salida) - d(b.p, salida))
        .map((x) => x.codigo);
      return { ctr: c.dependencia.donde, corredores: cerca, ejemplo: [salida.codigo, ...intermedios, llegada.codigo].join(" ") };
    }
    return null;
  }, [cambios, capas, puntos, altitudNum]);

  /* --------------------------------------------------------------- vuelo --- */
  const [volando, setVolando] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [proximo, setProximo] = useState(0);
  const [seguir, setSeguir] = useState(true);
  const puedeGps = montado && typeof navigator !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (!volando) return;
    setErrorGps(null);
    const id = navigator.geolocation.watchPosition(
      (p) => setLectura(lecturaGps(p.coords)),
      (e) =>
        setErrorGps(
          e.code === e.PERMISSION_DENIED
            ? "El navegador no dio permiso para usar la ubicación. Habilitalo en los ajustes del sitio."
            : "Todavía no hay señal de GPS. Con cielo a la vista tarda menos."
        ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 }
    );
    // La pantalla prendida mientras volás. Si el sistema la suelta (otra app), se vuelve a pedir.
    let bloqueo: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        bloqueo = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      } catch {
        bloqueo = null;
      }
    };
    pedir();
    const alVolver = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      navigator.geolocation.clearWatch(id);
      document.removeEventListener("visibilitychange", alVolver);
      bloqueo?.release().catch(() => undefined);
    };
  }, [volando]);

  useEffect(() => {
    if (!volando || !lectura || puntos.length === 0) return;
    setProximo((prev) => proximoPunto(puntos, lectura, prev));
  }, [volando, lectura, puntos]);

  const posicion: Posicion | null = volando && lectura ? { lat: lectura.lat, lon: lectura.lon, trackT: lectura.gsKt && lectura.gsKt > 15 ? lectura.trackT : null } : null;
  const destino = volando && puntos.length ? puntos[Math.min(proximo, puntos.length - 1)] : null;
  const hacia = lectura && destino ? haciaPunto(lectura, destino, lectura.gsKt) : null;
  const dentro = lectura && capas ? espaciosEn(lectura, capas.espacios).sort((a, b) => "ATZCTRTMA".indexOf(a.tipo) - "ATZCTRTMA".indexOf(b.tipo)) : [];
  // Con quién hablás ahora (con la altura del GPS) y el próximo cambio sobre lo que queda de ruta.
  const ahora = lectura && capas?.firs ? dependenciasEn(lectura, lectura.altitudFt, capas.espacios, capas.firs, capas.vfr)[0] ?? null : null;
  const despues =
    lectura && capas?.firs && destino
      ? dependenciasDeRuta([lectura, ...puntos.slice(proximo)], lectura.altitudFt, capas.espacios, capas.firs, radios, true, capas.vfr).find(
          (c) => c.desdeNm > 0 && ahora && c.dependencia.distintivo !== ahora.distintivo
        ) ?? null
      : null;

  const empezar = () => {
    setProximo(0);
    setSeguir(true);
    setLectura(null);
    setVolando(true);
    setPlegada(false);
  };

  /* --------------------------------------------------------------- capas --- */
  const [menuCapas, setMenuCapas] = useState(false);
  const [visibles, setVisibles] = useState<IdCapa[]>(CAPAS_POR_DEFECTO);
  const [opacidadCarta, setOpacidadCarta] = useState(OPACIDAD_CARTA_POR_DEFECTO);
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CLAVE_CAPAS);
    } catch {}
    const g = leerCapas(guardado);
    setVisibles(g.visibles);
    setOpacidadCarta(g.opacidad);
  }, []);
  const guardarCapas = (v: IdCapa[], o: number) => {
    try {
      localStorage.setItem(CLAVE_CAPAS, JSON.stringify({ visibles: v, opacidad: o }));
    } catch {}
  };
  const alternar = (id: IdCapa) => {
    const v = alternarCapa(visibles, id);
    setVisibles(v);
    guardarCapas(v, opacidadCarta);
  };
  const cambiarOpacidad = (o: number) => {
    setOpacidadCarta(o);
    guardarCapas(visibles, o);
  };

  /* ------------------------------------------------------------- tarjeta --- */
  const [plegada, setPlegada] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [escritorio, setEscritorio] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const leer = () => setEscritorio(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);
  const aerodromosDeRuta = puntos.filter((p) => p.clase === "aerodromo");

  if (!montado) return null;
  const preparar = SECCIONES.find((x) => x.clave === "preparar");

  /*
    En vuelo, en el teléfono (3.4.0), la tarjeta baja y se vuelve una hoja pegada al borde de
    abajo, que se lee con el teléfono en la mano o en la pierna; la barra de secciones se esconde
    (`data-sin-barra-movil`). Arriba, lo que se mira cada minuto: el próximo punto y con quién
    hablás. Planificando sigue arriba a la izquierda.
  */
  const enHoja = volando ? "max-lg:top-auto max-lg:inset-x-0 max-lg:bottom-0 max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0 max-lg:max-h-[72%] max-lg:pb-[env(safe-area-inset-bottom)]" : "";
  const tarjeta = (
    <div
      className={`absolute z-10 top-3 left-3 right-3 lg:top-4 lg:left-4 lg:right-auto lg:w-[380px] max-h-[calc(100%-7.5rem-env(safe-area-inset-bottom))] lg:max-h-[calc(100%-2rem)] ${enHoja} flex flex-col rounded-3xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-black/10 overflow-hidden`}
    >
      {volando && (
        <div className="lg:hidden flex justify-center pt-2" aria-hidden="true">
          <span className="w-9 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20" />
        </div>
      )}
      {/* Encabezado: el modo y, en el teléfono, plegar para ver el mapa entero. */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{volando ? "En vuelo" : "Ruta"}</p>
          {plegada && (
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {volando && destino ? `→ ${destino.codigo}${hacia ? ` · ${hacia.distanciaNm.toFixed(1)} NM` : ""}` : tokens.join(" ") || "Sin ruta"}
            </p>
          )}
        </div>
        {volando ? (
          <button
            onClick={() => setVolando(false)}
            className="bg-aviation-cyan text-noche hover:bg-sky-300 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1.5"
          >
            <Square className="w-3 h-3" fill="currentColor" /> Terminar
          </button>
        ) : (
          <button
            onClick={empezar}
            disabled={!puedeGps}
            title={puedeGps ? "Seguir la ruta con el GPS del teléfono" : "Este navegador no tiene GPS"}
            className="inline-flex items-center gap-1.5 rounded-full bg-aviation-blue text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40"
          >
            <Navigation className="w-3.5 h-3.5" /> Volar
          </button>
        )}
        <button
          onClick={() => setMenuCapas((v) => !v)}
          aria-label="Capas del mapa"
          aria-expanded={menuCapas}
          title="Capas del mapa"
          className={`w-8 h-8 rounded-full flex items-center justify-center ${menuCapas ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"}`}
        >
          <Layers className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPlegada((v) => !v)}
          aria-label={plegada ? "Abrir la tarjeta" : "Plegar la tarjeta"}
          className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${plegada ? "" : "rotate-180"}`} />
        </button>
      </div>

      <div className={`${plegada ? "hidden" : "flex"} flex-col min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4 gap-4`}>
        {volando && (
          <section className="flex flex-col gap-3">
            {errorGps && !lectura && <p className="text-sm text-amber-600 dark:text-amber-400">{errorGps}</p>}
            {!lectura && !errorGps && (
              <p className="text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando el GPS…
              </p>
            )}
            {lectura && (
              <>
                <div className="grid grid-cols-3 gap-2 max-lg:order-2">
                  <Dato etiqueta="GS" valor={lectura.gsKt !== null ? Math.round(lectura.gsKt).toString() : "—"} unidad="kt" />
                  <Dato etiqueta="Track" valor={lectura.trackT !== null && (lectura.gsKt ?? 0) > 15 ? grados(variacion !== null ? aMagnetico(lectura.trackT, variacion) : lectura.trackT) : "—"} unidad={variacion !== null ? "°M" : "°V"} />
                  <Dato etiqueta="Alt. GPS" valor={lectura.altitudFt !== null ? miles(lectura.altitudFt) : "—"} unidad="ft" />
                </div>
                {destino && hacia && (
                  <div className="rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setProximo((i) => Math.max(0, i - 1))}
                        disabled={proximo === 0}
                        aria-label="Punto anterior"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[11px] text-zinc-500">Próximo punto · {proximo + 1} de {puntos.length}</p>
                        <p className="text-lg font-bold text-zinc-900 dark:text-white truncate">
                          {destino.codigo} <span className="text-sm font-medium text-zinc-500">{destino.label}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setProximo((i) => Math.min(puntos.length - 1, i + 1))}
                        disabled={proximo >= puntos.length - 1}
                        aria-label="Punto siguiente"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-30"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Dato etiqueta="Distancia" valor={hacia.distanciaNm.toFixed(1)} unidad="NM" />
                      <Dato etiqueta="Rumbo" valor={grados(variacion !== null ? aMagnetico(hacia.rumboT, variacion) : hacia.rumboT)} unidad={variacion !== null ? "°M" : "°V"} />
                      <Dato etiqueta="Tiempo" valor={hacia.eteMin !== null ? duracionCorta(hacia.eteMin) : "—"} />
                    </div>
                  </div>
                )}
                {ahora && (
                  <div className="rounded-2xl bg-aviation-blue/10 border border-aviation-blue/20 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-aviation-blue mb-1 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" /> Hablás con
                    </p>
                    <DependenciaFila d={ahora} grande />
                    {despues && (
                      <p className="mt-2 text-xs text-zinc-500">
                        En {despues.desdeNm.toFixed(0)} NM: <b className="text-zinc-700 dark:text-zinc-300">{despues.dependencia.distintivo}</b> {despues.dependencia.mhz.join(" · ")}
                      </p>
                    )}
                  </div>
                )}
                <div className="max-lg:order-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Estás dentro de</p>
                  {dentro.length ? (
                    <ListaEspacios espacios={dentro} />
                  ) : (
                    <p className="text-sm text-zinc-500">Ningún espacio controlado de los que dibuja el mapa.</p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 max-lg:order-4">
                  <span>Precisión ±{Math.round(lectura.precisionM)} m{lectura.precisionM > 100 ? " · señal débil" : ""}</span>
                  {!seguir && (
                    <button onClick={() => setSeguir(true)} className="inline-flex items-center gap-1 font-semibold text-aviation-blue">
                      <Crosshair className="w-3.5 h-3.5" /> Seguir
                    </button>
                  )}
                </div>
              </>
            )}
            <p className="text-[11px] leading-snug text-zinc-500 flex gap-1.5 max-lg:order-5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Ayuda VFR con el GPS del teléfono: no reemplaza la carta ni la navegación. La altura es la del GPS, no la del altímetro.
            </p>
          </section>
        )}

        <section className={`space-y-2 ${volando ? "max-lg:hidden" : ""}`}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.toUpperCase())}
            rows={2}
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="SADF DCT SADM · con aerovías: SADF UGIMI W18 BCA SAZB · por un corredor VFR: SADF BENAVIDEZ SAAK"
            className="w-full resize-none rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-aviation-blue/40"
          />
          {!volando && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAgregando((v) => !v)}
                aria-pressed={agregando}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                  agregando ? "bg-aviation-blue text-white border-aviation-blue" : "border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" /> {agregando ? "Tocá el mapa para sumar puntos" : "Agregar puntos en el mapa"}
              </button>
              {tokens.length > 0 && (
                <button onClick={deshacer} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">
                  <Undo2 className="w-3.5 h-3.5" /> Deshacer
                </button>
              )}
            </div>
          )}
          {!volando && <p className="text-[11px] text-zinc-500">Aeródromos, radioayudas, puntos, aerovías y puntos VFR, como en el Planificador. Tocar un aeródromo en el mapa lo suma a la ruta.</p>}
          {sinUbicar.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">No encontré {sinUbicar.join(", ")}: no se dibuja.</p>}
          {buscando && (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
            </p>
          )}
        </section>

        {puntos.length > 0 && (
          <section>
            <ol className="space-y-px">
              {puntos.map((p, i) => {
                const tramo = i > 0 ? tramos[i - 1] : null;
                return (
                  <li
                    key={`${p.codigo}-${i}`}
                    className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${volando && i === proximo ? "bg-aviation-blue/10" : ""}`}
                  >
                    <span className="w-5 h-5 shrink-0 rounded-full border-2 border-aviation-blue text-[10px] font-bold text-aviation-blue flex items-center justify-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                        {p.codigo} <span className="font-normal text-zinc-500">{p.clase === "coordenada" ? "punto propio" : p.label !== p.codigo ? p.label : ""}</span>
                      </p>
                      {p.aerovia && <p className="text-[11px] text-zinc-500">por {p.aerovia}</p>}
                    </div>
                    {tramo && (
                      <span className="text-xs tabular-nums text-zinc-500 text-right shrink-0">
                        {tramo.distanciaNm.toFixed(1)} NM{tasNum ? ` · ${duracionCorta((tramo.distanciaNm / tasNum) * 60)}` : ""}
                        <br />
                        {grados(tramo.rumboM ?? tramo.rumboT)}
                        {tramo.rumboM !== null ? "°M" : "°V"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {tramos.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 dark:bg-white/5 px-3 py-2.5">
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{totalNm.toFixed(1)} NM</p>
                  <p className="text-[11px] text-zinc-500">{tasNum ? `${duracionCorta((totalNm / tasNum) * 60)} sin viento` : "Poné la TAS"}</p>
                  {tasNum && aeronave?.fuel_burn_lph ? (
                    <p className="text-[11px] text-zinc-500 tabular-nums">
                      ≈ {Math.ceil((totalNm / tasNum) * aeronave.fuel_burn_lph)} L a {aeronave.fuel_burn_lph} L/h
                    </p>
                  ) : null}
                  {aeronaves.length > 0 && (
                    <select
                      value={avionId}
                      onChange={(e) => elegirAvion(e.target.value)}
                      aria-label="Avión"
                      className="mt-1.5 max-w-[150px] rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 px-2 py-1 text-xs font-semibold text-zinc-900 dark:text-white"
                    >
                      {aeronaves.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.registration} · {a.type}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Altitud
                  <input
                    value={altitud}
                    onChange={(e) => setAltitud(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    inputMode="numeric"
                    placeholder="6000"
                    className="w-16 rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 px-2 py-1 text-right text-sm font-semibold text-zinc-900 dark:text-white tabular-nums placeholder:text-zinc-300"
                  />
                  ft
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  TAS
                  <input
                    value={tas}
                    onChange={(e) => setTas(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric"
                    className="w-14 rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 px-2 py-1 text-right text-sm font-semibold text-zinc-900 dark:text-white tabular-nums"
                  />
                  kt
                </label>
                </div>
              </div>
            )}
          </section>
        )}

        {!volando && (
          <RutaAcciones
            tokens={tokens}
            resueltos={resueltos}
            aeronave={aeronave}
            tasKt={tasNum}
            altitudFt={altitudNum}
            distanciaNm={totalNm}
            minutosSinViento={tasNum && totalNm > 0 ? (totalNm / tasNum) * 60 : null}
            piloto={piloto}
            rutas={rutas}
            onRutas={setRutas}
            onCargar={cargarRuta}
          />
        )}

        {cambios.length > 0 && !volando && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" /> Con quién hablás
            </p>
            <ol className="space-y-2">
              {cambios.map((c, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-400 pt-0.5">{c.desdeNm === 0 ? "salida" : `${c.desdeNm.toFixed(0)} NM`}</span>
                  <DependenciaFila d={c.dependencia} />
                </li>
              ))}
            </ol>
            {sugerencia && (
              <p className="mt-2 rounded-xl bg-green-500/10 px-3 py-2 text-xs text-green-800 dark:text-green-300">
                Cruzás la {nombreLindo(sugerencia.ctr)}. Por{" "}
                {sugerencia.corredores.map((c, i) => (
                  <span key={c.numero}>
                    {i > 0 && " o "}el Corredor VFR Nº {c.numero} ({c.puntos.map((n) => nombreLindo(n.replace(/^ESTACI[ÓO]N\s+/i, ""))).join(" – ")})
                  </span>
                ))}{" "}
                es clase G hasta 1.000 ft dentro de la CTR. Ruta por el corredor:{" "}
                <b>{sugerencia.ejemplo}</b>.
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-zinc-500">
              {altitudNum === null ? "Poné la altitud de crucero para saber si pasás por arriba o por debajo de cada espacio. " : `A ${miles(altitudNum)} ft; la salida y la llegada, en el suelo. `}
              Del AIP: torres (AD 2.18), TMA y centros (ENR 2.1).
            </p>
          </section>
        )}

        {puntos.length > 0 && capas && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Espacios aéreos que cruza</p>
            {cruzados.length ? (
              <ListaEspacios espacios={cruzados} />
            ) : (
              <p className="text-sm text-zinc-500">Ninguno de los que dibuja el mapa.</p>
            )}
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Lateralmente: la altura la decidís vos con sus límites. Del AIP (AD 2.17 y ENR 2.1); {capas.descartados.length} no se dibujan porque el AIP los define con radiales o límites sin coordenadas.
            </p>
          </section>
        )}
        {errorCapas && <p className="text-xs text-amber-600 dark:text-amber-400">No se pudieron traer los espacios aéreos ni los aeródromos del mapa.</p>}

        {aerodromosDeRuta.length > 0 && (
          <section>
            <button
              onClick={() => setBriefing((v) => !v)}
              className="w-full flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-2">
                <CloudSun className="w-4 h-4 text-zinc-500" /> Meteo y NOTAM de la ruta
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${briefing ? "rotate-180" : ""}`} />
            </button>
            {/* Recién al abrirla: pide METAR, TAF y NOTAM de cada aeródromo, y no hace falta en cada tecla. */}
            {briefing && (
              <div className="mt-3">
                <BriefingRuta
                  puntos={aerodromosDeRuta.map((p) => ({
                    codigo: p.codigo,
                    label: p.label,
                    lat: p.lat,
                    lon: p.lon,
                    elevacionFt: p.elevacionFt,
                    pistas: p.pistas,
                    variacionW: p.variacionW,
                  }))}
                />
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );

  return createPortal(
    <div
      // El menú de capas es una hoja desde abajo: la barra de secciones le taparía el final.
      data-sin-barra-movil={volando || menuCapas ? "" : undefined}
      data-sin-encabezado-movil={volando ? "" : undefined}
      className={`fixed inset-x-0 bottom-0 ${volando ? "top-0" : "top-24 app:top-[calc(max(58px,calc(env(safe-area-inset-top)+0.75rem))+6.625rem)]"} lg:top-0 lg:left-20 z-[35]`}
    >
      <MapaLeaflet
        capas={capas}
        puntos={puntos}
        proximo={volando ? proximo : null}
        posicion={posicion}
        seguir={volando && seguir}
        volando={volando}
        onAgregar={agregar}
        onArrastre={() => setSeguir(false)}
        agregando={agregando && !volando}
        onPuntoLibre={agregarCoordenada}
        margenIzquierdo={escritorio ? ANCHO_TARJETA : 0}
        visibles={visibles}
        opacidadCarta={opacidadCarta}
      />
      {tarjeta}
      {/*
        Las pestañas de Preparar vuelo (3.12.0). Desde que el Mapa es la primera, el ícono de la
        sección cae acá, y el mapa a pantalla completa tapaba las de la página. En el teléfono el
        mapa empieza debajo de ellas (`top-24`); en la compu flotan a la derecha de la tarjeta.
      */}
      {!volando && preparar && (
        <nav
          aria-label="Preparar vuelo"
          className="max-lg:hidden absolute z-10 top-4 left-[calc(380px+2rem)] flex gap-1 p-1 rounded-2xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-black/10"
        >
          {preparar.pestanas.map((p) => {
            const activa = p.href === "/dashboard/mapa";
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={activa ? "page" : undefined}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  activa
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      )}
      {menuCapas && <MenuCapas visibles={visibles} onAlternar={alternar} opacidad={opacidadCarta} onOpacidad={cambiarOpacidad} onCerrar={() => setMenuCapas(false)} />}
    </div>,
    document.body
  );
}

function Dato({ etiqueta, valor, unidad }: { etiqueta: string; valor: string; unidad?: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-black/20 border border-zinc-200 dark:border-white/10 px-2 py-1.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{etiqueta}</p>
      <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-white leading-tight">
        {valor}
        {unidad && <span className="text-[11px] font-medium text-zinc-500 ml-0.5">{unidad}</span>}
      </p>
    </div>
  );
}

/** El código de un punto de corredor para la ruta, salvo los que son una ATZ (se escriben con su designador). */
function puntosCodigo(nombre: string): string {
  return /^ATZ\b/.test(nombre) ? "" : codigoVfr(nombre);
}

/** "ATZ SAN FERNANDO (I)" → "ATZ San Fernando (I)": las siglas y los números romanos quedan. */
function nombreLindo(t: string): string {
  return t
    .split(" ")
    .map((w) => (/^(CTR|ATZ|TMA|FIR|VFR|Nº|\(?[IV]+\)?|·)$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ")
    .replace(/\bDe\b|\bDel\b|\bLa\b|\bLos\b/g, (m) => m.toLowerCase());
}

function DependenciaFila({ d, grande = false }: { d: Dependencia; grande?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`${grande ? "text-base" : "text-sm"} font-semibold text-zinc-900 dark:text-white leading-snug`}>{d.distintivo}</p>
      {d.mhz.length > 0 && <p className={`${grande ? "text-sm" : "text-xs"} tabular-nums text-zinc-700 dark:text-zinc-300`}>{d.mhz.join(" · ")}</p>}
      <p className="text-[11px] text-zinc-500 leading-snug">{nombreLindo(d.donde)}</p>
      {d.nota && <p className="text-[11px] text-zinc-500 leading-snug">{d.nota}</p>}
    </div>
  );
}

function ListaEspacios({ espacios }: { espacios: EspacioAereo[] }) {
  return (
    <ul className="space-y-1">
      {espacios.map((e) => (
        <li key={e.id} className="flex items-start gap-2">
          <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${COLOR_TIPO[e.tipo]}`}>{e.tipo}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">
              {e.nombre.replace(/^(CTR|ATZ|TMA)\s+/, "")}
              {e.clase && <span className="font-normal text-zinc-500"> · Clase {e.clase}</span>}
            </p>
            <p className="text-[11px] text-zinc-500 leading-snug">
              {e.limites}
              {e.aproximado ? " · contorno aproximado" : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
