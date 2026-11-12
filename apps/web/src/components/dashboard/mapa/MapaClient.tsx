"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Layers, ChevronDown, ChevronLeft, ChevronRight, CloudSun, Crosshair, Download, Loader2, MapPin, Minus, Navigation, NotebookPen, Plus, Radio, Square, Trash2, Undo2, X } from "lucide-react";
import type { PuntoResuelto } from "@/lib/resolucion-puntos";
import type { EspacioAereo } from "@/lib/espacios-aereos";
import { aMagnetico } from "@/lib/navegacion";
import { avisoDeEspacios, minutosCorto, nmCorto, sostenerAviso, type AvisoEspacio, type EstadoAviso } from "@/lib/aviso-espacios";
import { dependenciasDeRuta, dependenciasEn, type Dependencia, type RadioDeAerodromo } from "@/lib/firs";
import { codigoVfr, corredoresCerca, etiquetaCorredor, puntosVfr } from "@/lib/corredores-vfr";
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
import type { ApiMapa, CapasMapa, Posicion } from "./MapaLeaflet";
import { CLAVE_TRACK, fechaArgentina, gpxDelTrack, leerTrack, nombreDelGpx, resumenTrack, sigueElTrack, sumarPunto, type TrackVuelo } from "@/lib/track-vuelo";
import MenuCapas from "./MenuCapas";
import { alternarCapa, CAPAS_POR_DEFECTO, CLAVE_CAPAS, leerCapas, OPACIDAD_CARTA_POR_DEFECTO, type IdCapa } from "@/lib/capas-mapa";
import BriefingRuta from "../BriefingRuta";
import { SECCIONES } from "@/lib/secciones";
import type { Aircraft } from "@/types";
import type { PilotoParaPlan } from "@/lib/formulario-plan";
import type { RutaGuardada } from "@/lib/rutas-guardadas";
import RutaAcciones from "./RutaAcciones";
import { textoDeVistas } from "@/lib/seguimiento";
import { distanciaNmPrecisa } from "@/lib/distance";
import { useSeguimientoEnVivo, type SeguimientoEnVivo } from "./useSeguimientoEnVivo";
import CompartirSeguimiento, { mandarLink } from "./CompartirSeguimiento";
import { avisoDeSalteados, type PlanParaElMapa } from "@/lib/plan-al-mapa";
import type { SeguimientoDelPlan } from "@/actions/seguimiento";
import HojaDirectoA, { type PuntoRestante } from "./HojaDirectoA";
import {
  aerodromosMasCercanos,
  deshacerCambio,
  esTokenDeCoordenada,
  historiaCon,
  proximoTrasCambio,
  rutaConAlFinal,
  rutaDelTrack,
  rutaDirectoA,
  tokenDelProximo,
} from "@/lib/ruta-en-vuelo";

/**
 * **El Mapa** (3.0.0): todo es mapa, con la tarjeta de la ruta flotando arriba a la izquierda.
 *
 * - **Planificar:** se escribe la ruta (aeródromos, radioayudas, puntos, aerovías, como en el
 *   Planificador) o se tocan aeródromos en el mapa, y se dibuja al instante con sus tramos,
 *   los espacios aéreos que cruza y, a pedido, la meteo y los NOTAM.
 * - **Volar** (3.16.0, después de que Federico salió a navegar con la 3.15): el mapa ocupa la
 *   pantalla entre dos bandas, la de arriba con el próximo punto y los instrumentos y la de abajo
 *   con quién hablás; al costado, norte o nariz arriba, seguir, zoom y capas. Mientras vuela graba
 *   el track (`lib/track-vuelo.ts`) y lo dibuja como una estela; al terminar se baja como GPX o se
 *   va a Registrar vuelo. Mantiene la pantalla prendida. Es una ayuda VFR y lo dice: no reemplaza
 *   la carta ni el instrumental.
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
const CLAVE_ORIENTACION = "vector-mapa-orientacion";
const CLAVE_SONIDO_AVISO = "vector-mapa-aviso-sonido";
/** Un mismo espacio no vuelve a sonar antes de esto (el aviso que se va y vuelve con el ruido del GPS). */
const REAVISO_MS = 120_000;
const ROTULO = "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";
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
  planes,
  planActual,
  seguimientoDelPlan,
}: {
  rutaInicial: string;
  aeronaves: Aircraft[];
  aeronaveInicial: string;
  piloto: PilotoParaPlan;
  rutasGuardadas: RutaGuardada[] | null;
  /** "Tus planes": los que salen pronto. `null` = no se pudieron leer (no se muestra la sección). */
  planes: PlanParaElMapa[] | null;
  /** El plan con el que se abrió el Mapa (`?plan=`), si existe y es del piloto. */
  planActual: { id: string; titulo: string; salteados: string[] } | null;
  /** El link compartido de ese plan, si sigue activo: el Mapa lo usa en vez de crear otro. */
  seguimientoDelPlan: SeguimientoDelPlan | null;
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
    // El plan se queda en la URL: sin él, un refresco cambiaría la `key` del Mapa y lo armaría de nuevo.
    const partes = [planActual ? `plan=${encodeURIComponent(planActual.id)}` : "", tokens.length ? `ruta=${encodeURIComponent(tokens.join("-"))}` : ""].filter(Boolean);
    window.history.replaceState(null, "", partes.length ? `?${partes.join("&")}` : window.location.pathname);
  }, [tokens, planActual]);

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
  // Que la familia siga el vuelo (3.20.0): vive acá y no en la pantalla de vuelo, porque al
  // terminar (`volando` en false) es el hook el que cierra el link.
  // Si el Mapa se abrió desde un plan que ya se compartía, ése es el link: no se crea otro.
  const adoptar = useMemo(
    () =>
      seguimientoDelPlan
        ? { id: seguimientoDelPlan.id, token: seguimientoDelPlan.token, venceAt: seguimientoDelPlan.venceAt, mostrarMatricula: seguimientoDelPlan.mostrarMatricula }
        : null,
    [seguimientoDelPlan]
  );
  const seguimiento = useSeguimientoEnVivo({ lectura, volando, ruta: tokens.join(" "), puntos, rutaLista: !buscando, aeronave, adoptar });
  const [avisoLink, setAvisoLink] = useState<"copiado" | "manual" | null>(null);
  const mandarLinkDelPlan = async () => {
    if (!seguimiento.url) return;
    const r = await mandarLink(seguimiento.url);
    setAvisoLink(r === "copiado" || r === "manual" ? r : null);
  };
  // Lo que el Mapa no pudo cargar del plan: se avisa hasta que el piloto lo cierra.
  const [salteadosDelPlan, setSalteadosDelPlan] = useState<string[]>(planActual?.salteados ?? []);
  const cargarPlan = (p: PlanParaElMapa) => {
    setTexto(p.ruta);
    setTextoFirme(p.ruta);
    if (p.aircraftId && aeronaves.some((a) => a.id === p.aircraftId)) elegirAvion(p.aircraftId);
    setSalteadosDelPlan(p.salteados);
  };

  // El track (`lib/track-vuelo.ts`): en el teléfono. Se lee al montar (para mostrar el último
  // vuelo grabado) y se guarda cada 10 s mientras se vuela, al esconder la app y al terminar.
  const [track, setTrack] = useState<TrackVuelo | null>(null);
  const ultimoGuardado = useRef(0);
  const guardarTrack = useCallback((t: TrackVuelo | null) => {
    ultimoGuardado.current = Date.now();
    try {
      if (t) localStorage.setItem(CLAVE_TRACK, JSON.stringify(t));
      else localStorage.removeItem(CLAVE_TRACK);
    } catch {}
  }, []);
  useEffect(() => {
    let texto: string | null = null;
    try {
      texto = localStorage.getItem(CLAVE_TRACK);
    } catch {}
    setTrack(leerTrack(texto));
  }, []);
  useEffect(() => {
    if (volando && track && Date.now() - ultimoGuardado.current > 10_000) guardarTrack(track);
  }, [volando, track, guardarTrack]);
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(() => {
    if (!volando) return;
    const alEsconder = () => document.visibilityState === "hidden" && guardarTrack(trackRef.current);
    document.addEventListener("visibilitychange", alEsconder);
    window.addEventListener("pagehide", alEsconder);
    return () => {
      document.removeEventListener("visibilitychange", alEsconder);
      window.removeEventListener("pagehide", alEsconder);
    };
  }, [volando, guardarTrack]);

  useEffect(() => {
    if (!volando) return;
    setErrorGps(null);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const l = lecturaGps(p.coords);
        setLectura(l);
        setTrack((t) => {
          if (!t) return t;
          const puntos = sumarPunto(t.puntos, l, p.timestamp || Date.now());
          return puntos === t.puntos ? t : { ...t, puntos };
        });
      },
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

  // Cambiar la ruta en vuelo (3.23.0). `recalcular` pide elegir el próximo punto con la ruta nueva
  // cuando termine de resolverse (`proximoTrasCambio`): un índice viejo no vale en otra ruta.
  const recalcular = useRef(false);
  useEffect(() => {
    // Con puntos todavía sin resolver la ruta está a medias: elegir el próximo ahora saltearía alguno.
    if (!volando || !lectura || puntos.length === 0 || buscando) return;
    if (recalcular.current) {
      recalcular.current = false;
      setProximo(proximoPunto(puntos, lectura, proximoTrasCambio(puntos, lectura)));
      return;
    }
    setProximo((prev) => proximoPunto(puntos, lectura, prev));
  }, [volando, lectura, puntos, buscando]);

  const [historia, setHistoria] = useState<string[]>([]);
  const [hoja, setHoja] = useState<{ toque: { codigo: string; nombre: string } | null } | null>(null);
  /**
   * Pone la ruta nueva en vuelo: la guarda para deshacer, la escribe (y firme, sin esperar el
   * debounce), recalcula el próximo punto y le cambia la ruta al track. **El track sigue**: no se
   * corta ni se reinicia, es el mismo vuelo; sólo su `ruta` pasa a ser la salida original más el
   * destino de ahora (`rutaDelTrack`), que es lo que lee el nombre del GPX y "Registrar el vuelo".
   */
  const cambiarRutaEnVuelo = (nuevos: string[], opciones: { guardar?: boolean; recalcularProximo?: boolean } = {}) => {
    const { guardar = true, recalcularProximo = true } = opciones;
    const nuevoTexto = nuevos.join(" ");
    if (nuevoTexto === tokens.join(" ")) return;
    if (guardar) setHistoria((h) => historiaCon(h, tokens.join(" "), nuevoTexto));
    setTexto(nuevoTexto);
    setTextoFirme(nuevoTexto);
    if (recalcularProximo) recalcular.current = true;
    setTrack((t) => (t ? { ...t, ruta: rutaDelTrack(t.ruta, nuevos) } : t));
    setHoja(null);
  };
  const directoA = (codigo: string) => {
    if (!lectura) return;
    const desde = Math.max(0, tokenDelProximo(tokens, puntos.map((x) => x.codigo), proximo));
    cambiarRutaEnVuelo(rutaDirectoA(tokens, lectura, codigo, desde));
  };
  const deshacerEnVuelo = () => {
    const d = deshacerCambio(historia);
    if (!d) return;
    setHistoria(d.historia);
    cambiarRutaEnVuelo(tokensDeRuta(d.ruta), { guardar: false });
  };
  // Un toque en un aeródromo o una radioayuda del mapa: planificando lo suma a la ruta; volando
  // ya no, en silencio: abre la hoja con "Directo a" y "Agregar al final".
  const alTocar = (codigo: string) => {
    const a = capas?.aerodromos.find((x) => x[0] === codigo || x[1] === codigo);
    const r = a ? null : capas?.radioayudas.find((x) => x[0] === codigo);
    setHoja({ toque: { codigo, nombre: a ? a[2] : r ? `${r[1]} ${r[2]}` : "" } });
  };
  const cercanos = useMemo(
    () => (hoja && lectura && capas ? aerodromosMasCercanos(lectura, capas.aerodromos, 6, variacion) : []),
    // La hoja se arma al abrirla y con cada lectura mientras está abierta (la distancia cambia).
    [hoja, lectura, capas, variacion]
  );
  const restantes = useMemo((): PuntoRestante[] => {
    if (!hoja) return [];
    const desde = Math.max(0, tokenDelProximo(tokens, puntos.map((x) => x.codigo), proximo));
    return tokens.slice(desde).flatMap((t) => {
      const x = puntos.find((q) => q.codigo === t && q.clase !== "aerovia");
      return x ? [{ codigo: t, label: x.label, distanciaNm: lectura ? distanciaNmPrecisa(lectura.lat, lectura.lon, x.lat, x.lon) : null }] : [];
    });
  }, [hoja, tokens, puntos, proximo, lectura]);

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

  // El aviso de "estás por entrar a…": se proyecta el track con cada lectura y `sostenerAviso`
  // evita que parpadee con el ruido del GPS. Vibra (y suena, si el piloto lo prendió) una vez por
  // espacio nuevo. Ayuda VFR: no es una instrucción de control.
  const [aviso, setAviso] = useState<AvisoEspacio | null>(null);
  const estadoAviso = useRef<EstadoAviso | null>(null);
  const avisados = useRef(new Map<string, number>());
  const [sonidoAviso, setSonidoAviso] = useState(false);
  const sonidoRef = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE_SONIDO_AVISO) === "1";
      setSonidoAviso(v);
      sonidoRef.current = v;
    } catch {}
  }, []);
  const pitar = useCallback(() => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = audio.current ?? (audio.current = new AC());
      void ctx.resume();
      // Dos pitidos cortos y agudos.
      [0, 0.22].forEach((retraso) => {
        const osc = ctx.createOscillator();
        const gan = ctx.createGain();
        const t0 = ctx.currentTime + retraso;
        osc.frequency.value = 880;
        gan.gain.setValueAtTime(0.0001, t0);
        gan.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gan.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(gan).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      });
    } catch {}
  }, []);
  const alternarSonidoAviso = () => {
    const v = !sonidoRef.current;
    sonidoRef.current = v;
    setSonidoAviso(v);
    try {
      localStorage.setItem(CLAVE_SONIDO_AVISO, v ? "1" : "0");
    } catch {}
    // Se prende con un toque: ahí el navegador deja crear el audio, y de paso suena de muestra.
    if (v) pitar();
  };
  useEffect(() => {
    if (!volando) {
      estadoAviso.current = null;
      setAviso(null);
      return;
    }
    if (!lectura || !capas) return;
    const ahoraMs = Date.now();
    const nuevo = avisoDeEspacios(lectura, capas.espacios, capas.firs ?? []);
    const estado = sostenerAviso(estadoAviso.current, nuevo, lectura, ahoraMs);
    const id = estado?.aviso.espacio.id ?? null;
    if (id && id !== estadoAviso.current?.aviso.espacio.id && ahoraMs - (avisados.current.get(id) ?? -Infinity) > REAVISO_MS) {
      avisados.current.set(id, ahoraMs);
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      if (sonidoRef.current) pitar();
    }
    estadoAviso.current = estado;
    setAviso(estado?.aviso ?? null);
  }, [volando, lectura, capas, pitar]);

  // Norte o nariz arriba: se recuerda en el teléfono. Con la nariz arriba el mapa gira con el
  // track del GPS, y en el suelo (menos de 15 kt, el track no sirve) se queda donde estaba.
  const [narizArriba, setNarizArriba] = useState(false);
  useEffect(() => {
    try {
      setNarizArriba(localStorage.getItem(CLAVE_ORIENTACION) === "nariz");
    } catch {}
  }, []);
  const alternarOrientacion = () => {
    setNarizArriba((v) => {
      try {
        localStorage.setItem(CLAVE_ORIENTACION, v ? "norte" : "nariz");
      } catch {}
      return !v;
    });
  };
  const ultimoTrackValido = useRef<number | null>(null);
  if (posicion?.trackT != null) ultimoTrackValido.current = posicion.trackT;
  const rumboMapa = volando && narizArriba && ultimoTrackValido.current !== null ? (360 - ultimoTrackValido.current) % 360 : 0;

  // Lo que tapan las bandas de vuelo: el avión se centra en lo que queda a la vista.
  const [margenes, setMargenes] = useState({ arriba: 0, abajo: 0 });
  const apiMapa = useRef<ApiMapa | null>(null);

  const empezar = () => {
    setHistoria([]);
    setHoja(null);
    setProximo(0);
    setSeguir(true);
    setLectura(null);
    setVolando(true);
    setPlegada(false);
    // Si iOS cerró la app en vuelo y se vuelve a "Volar" enseguida, sigue el mismo track.
    const ahora = Date.now();
    const anterior = trackRef.current;
    setTrack(sigueElTrack(anterior, ahora) && anterior ? { ...anterior, terminado: null } : { inicio: ahora, puntos: [], ruta: tokens.join(" "), terminado: null });
  };

  const terminar = () => {
    setVolando(false);
    setHoja(null);
    setDetallesVuelo(false);
    const t = trackRef.current;
    if (!t) return;
    const final = t.puntos.length > 1 ? { ...t, terminado: Date.now() } : null;
    setTrack(final);
    guardarTrack(final);
  };
  const [detallesVuelo, setDetallesVuelo] = useState(false);

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

  const tarjeta = (
    <div
      className={`absolute z-10 top-3 left-3 right-3 lg:top-4 lg:left-4 lg:right-auto lg:w-[380px] max-h-[calc(100%-7.5rem-env(safe-area-inset-bottom))] lg:max-h-[calc(100%-2rem)] flex flex-col rounded-3xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-black/10 overflow-hidden`}
    >
      {/* Encabezado: el modo y, en el teléfono, plegar para ver el mapa entero. */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Ruta</p>
          {plegada && <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{tokens.join(" ") || "Sin ruta"}</p>}
        </div>
          <button
            onClick={empezar}
            disabled={!puedeGps}
            title={puedeGps ? "Seguir la ruta con el GPS del teléfono" : "Este navegador no tiene GPS"}
            className="inline-flex items-center gap-1.5 rounded-full bg-aviation-blue text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40"
          >
            <Navigation className="w-3.5 h-3.5" /> Volar
          </button>
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
        {track && track.puntos.length > 1 && <VueloGrabado track={track} avionId={avionId} onBorrar={() => {
          setTrack(null);
          guardarTrack(null);
        }} />}

        {planActual && (
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Del plan de vuelo</p>
              <Link href={`/dashboard/plan-de-vuelo/${planActual.id}`} className="text-xs font-semibold text-aviation-blue hover:underline">
                Ver el plan
              </Link>
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{planActual.titulo}</p>
            {avisoDeSalteados(salteadosDelPlan) && (
              <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <span className="flex-1">{avisoDeSalteados(salteadosDelPlan)}</span>
                <button type="button" onClick={() => setSalteadosDelPlan([])} aria-label="Cerrar el aviso" className="shrink-0 text-amber-600/70 hover:text-amber-500 dark:text-amber-400/70">
                  <X className="w-3.5 h-3.5" />
                </button>
              </p>
            )}
            {seguimiento.delPlan && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  Tu familia ya tiene el link de este vuelo.
                  <span className="block text-[11px] text-zinc-500">Al tocar Volar, el GPS del teléfono se suma en ese mismo link.</span>
                </p>
                <button type="button" onClick={() => void mandarLinkDelPlan()} className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-aviation-blue hover:underline">
                  Copiar link
                </button>
              </div>
            )}
            {avisoLink === "copiado" && <p className="text-xs text-zinc-500">Link copiado.</p>}
            {avisoLink === "manual" && seguimiento.url && (
              <input readOnly value={seguimiento.url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-2 py-1.5 font-mono text-xs text-zinc-700 dark:text-white/80" />
            )}
          </section>
        )}

        <section className="space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.toUpperCase())}
            rows={2}
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="SADF DCT SADM · con aerovías: SADF UGIMI W18 BCA SAZB · por un corredor VFR: SADF BENAVIDEZ SAAK"
            className="w-full resize-none rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-aviation-blue/40"
          />
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
          <p className="text-[11px] text-zinc-500">Aeródromos, radioayudas, puntos, aerovías y puntos VFR, como en el Planificador. Tocar un aeródromo en el mapa lo suma a la ruta.</p>
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
                    className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
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

          <RutaAcciones
            tokens={tokens}
            // Para el briefing en PDF: sin capas no se calcularon (`null`), no es que no cruce ninguno.
            espacios={capas ? cruzados.map((e) => ({ tipo: e.tipo, nombre: e.nombre, clase: e.clase ?? null, limites: e.limites, aproximado: !!e.aproximado })) : null}
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
            planes={planes}
            planActualId={planActual?.id ?? null}
            onCargarPlan={cargarPlan}
            puntosRuta={puntos.map((p) => ({ lat: p.lat, lon: p.lon }))}
            piernera={{
              ruta: tokens.join(" "),
              avion: aeronave ? [aeronave.registration, aeronave.icao || aeronave.type].filter(Boolean).join(" ") : null,
              tasKt: tasNum,
              altitudFt: altitudNum,
              consumoLh: aeronave?.fuel_burn_lph ?? null,
              tramos: tramos.map((t) => ({ desde: t.desde.codigo, hasta: t.hasta.codigo, distanciaNm: t.distanciaNm, rumboM: t.rumboM, rumboT: t.rumboT })),
              cambios: cambios.map((c) => ({ desdeNm: c.desdeNm, donde: c.dependencia.donde, distintivo: c.dependencia.distintivo, mhz: c.dependencia.mhz })),
            }}
          />

        {cambios.length > 0 && (
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
                  <span key={`${c.zona ?? "baires"}-${c.numero}`}>
                    {i > 0 && " o "}el {etiquetaCorredor(c)} ({c.puntos.map((n) => nombreLindo(n.replace(/^ESTACI[ÓO]N\s+/i, ""))).join(" – ")})
                  </span>
                ))}{" "}
                {sugerencia.corredores[0]?.zona === "cordoba"
                  ? "es clase G, del suelo a 1.500 ft sobre el terreno."
                  : "es clase G hasta 1.000 ft dentro de la CTR."}{" "}
                Ruta por el corredor:{" "}
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
      className={`fixed inset-x-0 bottom-0 ${volando ? "top-0" : "top-[101px] app:top-[calc(max(58px,calc(env(safe-area-inset-top)+0.75rem))+5.5rem+1px)]"} lg:top-0 lg:left-20 z-[35]`}
    >
      <MapaLeaflet
        capas={capas}
        puntos={puntos}
        proximo={volando ? proximo : null}
        posicion={posicion}
        seguir={volando && seguir}
        volando={volando}
        onAgregar={volando ? alTocar : agregar}
        onArrastre={() => setSeguir(false)}
        agregando={agregando && !volando}
        onPuntoLibre={agregarCoordenada}
        margenIzquierdo={escritorio ? ANCHO_TARJETA : 0}
        visibles={visibles}
        opacidadCarta={opacidadCarta}
        rumbo={rumboMapa}
        margenes={volando ? margenes : undefined}
        narizArriba={volando && narizArriba}
        estela={track?.puntos ?? null}
        onMapa={(api) => (apiMapa.current = api)}
      />
      {volando ? (
        <PantallaDeVuelo
          lectura={lectura}
          errorGps={errorGps}
          destino={destino}
          hacia={hacia}
          proximo={proximo}
          totalPuntos={puntos.length}
          onProximo={(i) => setProximo(Math.max(0, Math.min(puntos.length - 1, i)))}
          variacion={variacion}
          ahora={ahora}
          despues={despues}
          aviso={aviso}
          sonidoAviso={sonidoAviso}
          onSonidoAviso={alternarSonidoAviso}
          seguimiento={seguimiento}
          dentro={dentro}
          puntos={puntos}
          track={track}
          narizArriba={narizArriba}
          rumboMapa={rumboMapa}
          onOrientacion={alternarOrientacion}
          seguir={seguir}
          onSeguir={() => setSeguir(true)}
          onAcercar={() => apiMapa.current?.acercar()}
          onAlejar={() => apiMapa.current?.alejar()}
          menuCapas={menuCapas}
          onCapas={() => setMenuCapas((v) => !v)}
          detalles={detallesVuelo}
          onDetalles={() => setDetallesVuelo((v) => !v)}
          onTerminar={terminar}
          onMargenes={setMargenes}
          rutaTexto={tokens.join(" ")}
          sinUbicar={sinUbicar}
          buscandoRuta={buscando}
          onAplicarRuta={(t) => cambiarRutaEnVuelo(tokensDeRuta(t))}
          puedeDeshacer={historia.length > 0}
          onDeshacer={deshacerEnVuelo}
          onDirecto={() => setHoja({ toque: null })}
        />
      ) : (
        tarjeta
      )}
      {volando && hoja && (
        <HojaDirectoA
          toque={hoja.toque}
          restantes={restantes}
          cercanos={cercanos}
          hayPosicion={Boolean(lectura)}
          onDirecto={directoA}
          onAlFinal={(c) => cambiarRutaEnVuelo(rutaConAlFinal(tokens, c), { recalcularProximo: false })}
          onCancelar={() => setHoja(null)}
        />
      )}
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

/* ------------------------------------------------------------ la pantalla de vuelo --- */

/**
 * En vuelo (3.16.0): el mapa entre dos bandas de borde a borde, sin tarjetas flotando. Arriba lo
 * que se mira cada minuto (el próximo punto y los instrumentos); abajo con quién hablás, "Más" y
 * Terminar; al costado, los botones del mapa, grandes para el dedo con turbulencia.
 */
function PantallaDeVuelo(p: {
  seguimiento: SeguimientoEnVivo;
  lectura: Lectura | null;
  errorGps: string | null;
  destino: { codigo: string; label: string } | null;
  hacia: { distanciaNm: number; rumboT: number; eteMin: number | null } | null;
  proximo: number;
  totalPuntos: number;
  onProximo: (i: number) => void;
  variacion: number | null;
  ahora: Dependencia | null;
  despues: { desdeNm: number; dependencia: Dependencia } | null;
  aviso: AvisoEspacio | null;
  sonidoAviso: boolean;
  onSonidoAviso: () => void;
  dentro: EspacioAereo[];
  puntos: { codigo: string; label: string }[];
  track: TrackVuelo | null;
  narizArriba: boolean;
  rumboMapa: number;
  onOrientacion: () => void;
  seguir: boolean;
  onSeguir: () => void;
  onAcercar: () => void;
  onAlejar: () => void;
  menuCapas: boolean;
  onCapas: () => void;
  detalles: boolean;
  onDetalles: () => void;
  onTerminar: () => void;
  onMargenes: (m: { arriba: number; abajo: number }) => void;
  /** La ruta como texto, para editarla en los detalles. */
  rutaTexto: string;
  sinUbicar: string[];
  buscandoRuta: boolean;
  onAplicarRuta: (texto: string) => void;
  puedeDeshacer: boolean;
  onDeshacer: () => void;
  onDirecto: () => void;
}) {
  // Lo que se está escribiendo en la ruta; `null` es "nada pendiente" y se muestra la ruta de ahora
  // (así un directo o un deshacer actualiza el campo, y lo escrito a medias no se pisa).
  const [borrador, setBorrador] = useState<string | null>(null);
  const arriba = useRef<HTMLDivElement>(null);
  const abajo = useRef<HTMLDivElement>(null);
  const { onMargenes } = p;
  useEffect(() => {
    const medir = () => onMargenes({ arriba: arriba.current?.offsetHeight ?? 0, abajo: abajo.current?.offsetHeight ?? 0 });
    medir();
    const ro = new ResizeObserver(medir);
    if (arriba.current) ro.observe(arriba.current);
    if (abajo.current) ro.observe(abajo.current);
    return () => {
      ro.disconnect();
      onMargenes({ arriba: 0, abajo: 0 });
    };
  }, [onMargenes]);

  const l = p.lectura;
  const magnetico = (t: number) => grados(p.variacion !== null ? aMagnetico(t, p.variacion) : t);
  const unidadRumbo = p.variacion !== null ? "°M" : "°V";
  const trackValido = l && l.trackT !== null && (l.gsKt ?? 0) > 15;
  const grabado = p.track && p.track.puntos.length > 1 ? resumenTrack(p.track.puntos) : null;
  const boton = "pointer-events-auto w-12 h-12 rounded-full flex items-center justify-center bg-noche/90 backdrop-blur-xl border border-white/15 text-white shadow-lg shadow-black/40";

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
      {/* Arriba: el próximo punto y los instrumentos. */}
      <div ref={arriba} className="pointer-events-auto bg-noche/90 backdrop-blur-xl border-b border-white/10 pt-[max(env(safe-area-inset-top),0.5rem)]">
        {!l ? (
          <div className="px-4 py-3 space-y-1.5">
            {p.errorGps ? (
              <p className="text-sm text-amber-400">{p.errorGps}</p>
            ) : (
              <p className="text-sm text-zinc-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando el GPS…
              </p>
            )}
            <p className="text-[11px] leading-snug text-zinc-500">
              Ayuda VFR con el GPS del teléfono: no reemplaza la carta ni la navegación. La altura es la del GPS, no la del altímetro.
            </p>
          </div>
        ) : (
          <>
            {p.destino && p.hacia ? (
              <div className="flex items-center gap-1 px-1.5 pt-1">
                <button
                  onClick={() => p.onProximo(p.proximo - 1)}
                  disabled={p.proximo === 0}
                  aria-label="Punto anterior"
                  className="w-10 h-12 shrink-0 flex items-center justify-center text-zinc-400 disabled:opacity-25"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={ROTULO}>
                    Próximo · {p.proximo + 1} de {p.totalPuntos}
                  </p>
                  <p className="truncate leading-tight">
                    <span className="font-display text-[26px] font-bold tracking-tight text-white">{p.destino.codigo}</span>{" "}
                    <span className="text-sm text-zinc-400">{p.destino.label !== p.destino.codigo ? p.destino.label : ""}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={ROTULO}>Distancia</p>
                  <p className="font-display text-[26px] font-bold leading-tight tabular-nums text-aviation-cyan">
                    {p.hacia.distanciaNm.toFixed(1)}
                    <span className="ml-0.5 text-xs font-semibold text-zinc-400">NM</span>
                  </p>
                </div>
                <button
                  onClick={() => p.onProximo(p.proximo + 1)}
                  disabled={p.proximo >= p.totalPuntos - 1}
                  aria-label="Punto siguiente"
                  className="w-10 h-12 shrink-0 flex items-center justify-center text-zinc-400 disabled:opacity-25"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <p className="px-4 pt-2 text-sm text-zinc-400">Sin ruta: tu posición y el track.</p>
            )}
            <div className={`grid ${p.hacia ? "grid-cols-5" : "grid-cols-3"} divide-x divide-white/10 py-2`}>
              {p.hacia && (
                <>
                  <Instrumento rotulo="Rumbo" valor={magnetico(p.hacia.rumboT)} unidad={unidadRumbo} />
                  <Instrumento rotulo="ETE" valor={p.hacia.eteMin !== null ? duracionCorta(p.hacia.eteMin).replace(" min", "′").replace(" h ", ":") : "—"} />
                </>
              )}
              <Instrumento rotulo="GS" valor={l.gsKt !== null ? Math.round(l.gsKt).toString() : "—"} unidad="kt" />
              <Instrumento rotulo="Track" valor={trackValido ? magnetico(l.trackT!) : "—"} unidad={unidadRumbo} />
              <Instrumento rotulo="Alt GPS" valor={l.altitudFt !== null ? miles(l.altitudFt) : "—"} unidad="ft" />
            </div>
          </>
        )}
        {/* Aviso de espacio aéreo: va adentro de la banda de arriba, así `onMargenes` la mide sola. */}
        {l && p.aviso && (
          <div role="status" aria-live="polite" className="border-t border-amber-400/40 bg-amber-400/15 px-4 py-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
              Por entrar · {p.aviso.espacio.tipo} · {nmCorto(p.aviso.distanciaNm)} NM · {minutosCorto(p.aviso.minutos)}
            </p>
            <p className="text-sm font-semibold leading-snug text-amber-100">
              {p.aviso.espacio.nombre}
              {p.aviso.dependencia && (
                <span className="tabular-nums text-amber-300">
                  {" · "}
                  {p.aviso.dependencia.distintivo}
                  {p.aviso.dependencia.mhz.length ? ` ${p.aviso.dependencia.mhz.join(" · ")}` : ""}
                </span>
              )}
            </p>
            {p.aviso.condicionVertical && <p className="text-[11px] leading-snug text-amber-200/80">{p.aviso.condicionVertical.replace(/^si/, "Si")}.</p>}
          </div>
        )}
      </div>

      {/* El medio es el mapa: sólo los botones y el estado del track. */}
      <div className="relative flex-1">
        <div className="absolute right-3 bottom-8 flex flex-col gap-2">
          <button
            onClick={p.onOrientacion}
            aria-label={p.narizArriba ? "Nariz arriba: tocá para poner el norte arriba" : "Norte arriba: tocá para poner la nariz arriba"}
            title={p.narizArriba ? "Nariz arriba" : "Norte arriba"}
            className={`${boton} flex-col gap-0 ${p.narizArriba ? "!border-aviation-cyan" : ""}`}
          >
            {/* La flecha apunta al norte de la pantalla: con la nariz arriba, gira con el mapa. */}
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${p.rumboMapa}deg)` }} aria-hidden="true">
              <path d="M9 1 L13 11 L9 9 L5 11 Z" fill="#f87171" />
              <path d="M9 17 L13 11 L9 9 L5 11 Z" fill="#a1a1aa" />
            </svg>
            <span className="font-mono text-[9px] font-bold leading-none">{p.narizArriba ? "NARIZ" : "N"}</span>
          </button>
          <button onClick={p.onSeguir} aria-label="Seguir al avión" className={`${boton} ${p.seguir ? "" : "!bg-aviation-cyan !text-noche !border-aviation-cyan"}`}>
            <Crosshair className="w-5 h-5" />
          </button>
          {/* Con los detalles abiertos el mapa queda bajo y los cinco botones se subían encima de los
              instrumentos: el zoom se va (queda pellizcar) y quedan orientación, seguir y capas. */}
          {!p.detalles && (
            <>
              <button onClick={p.onAcercar} aria-label="Acercar" className={boton}>
                <Plus className="w-5 h-5" />
              </button>
              <button onClick={p.onAlejar} aria-label="Alejar" className={boton}>
                <Minus className="w-5 h-5" />
              </button>
            </>
          )}
          <button onClick={p.onCapas} aria-label="Capas del mapa" aria-expanded={p.menuCapas} className={`${boton} ${p.menuCapas ? "!border-aviation-cyan" : ""}`}>
            <Layers className="w-5 h-5" />
          </button>
        </div>
        {!p.detalles && (
          <button
            onClick={p.onDirecto}
            disabled={!p.lectura}
            aria-label="Directo a…: cambiar la ruta sin terminar el vuelo"
            className="pointer-events-auto absolute left-3 bottom-[5.25rem] h-12 pl-3.5 pr-5 rounded-full bg-aviation-cyan text-noche text-base font-bold inline-flex items-center gap-2 shadow-lg shadow-black/50 disabled:opacity-40"
          >
            <Navigation className="w-5 h-5" /> Directo a
          </button>
        )}
        {p.track && (
          <p className="absolute left-3 bottom-8 rounded-full bg-noche/80 backdrop-blur px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Grabando
            {grabado && grabado.minutos >= 1 ? ` · ${duracionCorta(grabado.minutos)} · ${grabado.distanciaNm.toFixed(0)} NM` : ""}
            {p.seguimiento.estado === "compartiendo" && (
              <span className={p.seguimiento.sinSenal ? "text-amber-300" : "text-aviation-cyan"}>
                {" "}· {p.seguimiento.sinSenal ? "Compartiendo, sin señal" : "Compartiendo"}
                {textoDeVistas(p.seguimiento.vistas) && (
                  <>
                    {" "}·{" "}
                    {p.seguimiento.vistas && p.seguimiento.vistas.mirandoAhora > 0 && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-aviation-cyan align-middle animate-pulse" />}
                    {textoDeVistas(p.seguimiento.vistas)}
                  </>
                )}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Abajo: con quién hablás, los detalles y Terminar. */}
      <div ref={abajo} className="pointer-events-auto bg-noche/90 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        {p.detalles && (
          <div className="max-h-[36vh] overflow-y-auto custom-scrollbar px-4 pt-4 pb-2 space-y-4 border-b border-white/10">
            <CompartirSeguimiento seguimiento={p.seguimiento} />
            <div>
              <p className={`${ROTULO} mb-1.5`}>Estás dentro de</p>
              {p.dentro.length ? <ListaEspacios espacios={p.dentro} /> : <p className="text-sm text-zinc-400">Ningún espacio controlado de los que dibuja el mapa.</p>}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className={ROTULO}>La ruta</p>
                <button onClick={p.onDirecto} disabled={!p.lectura} className="h-10 px-4 rounded-full bg-aviation-cyan text-noche text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                  <Navigation className="w-4 h-4" /> Directo a…
                </button>
              </div>
              {p.puntos.length > 0 && (
                <ol className="space-y-1 mb-3">
                  {p.puntos.map((x, i) => (
                    <li key={`${x.codigo}-${i}`}>
                      <button onClick={() => p.onProximo(i)} className={`w-full text-left flex items-center gap-2.5 py-1 text-sm ${i === p.proximo ? "text-aviation-cyan font-semibold" : "text-zinc-300"}`}>
                        <span className="w-5 font-mono text-[11px] text-zinc-500">{i + 1}</span>
                        {x.codigo} <span className="truncate text-zinc-500 font-normal">{x.label !== x.codigo && !esTokenDeCoordenada(x.codigo) ? x.label : ""}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <label htmlFor="ruta-en-vuelo" className={`${ROTULO} block mb-1`}>
                Escribir la ruta
              </label>
              <textarea
                id="ruta-en-vuelo"
                value={borrador ?? p.rutaTexto}
                onChange={(e) => setBorrador(e.target.value.toUpperCase())}
                rows={2}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="SADF BENAVIDEZ SADM"
                className="w-full resize-none rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-base font-semibold tracking-wide text-white placeholder:text-zinc-600 focus:outline-none focus:border-aviation-cyan"
              />
              {p.sinUbicar.length > 0 && borrador === null && <p className="mt-1 text-xs text-amber-400">No ubiqué: {p.sinUbicar.join(", ")}.</p>}
              {p.buscandoRuta && borrador === null && <p className="mt-1 text-xs text-zinc-500">Buscando los puntos…</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {borrador !== null && (
                  <>
                    <button
                      onClick={() => {
                        p.onAplicarRuta(borrador);
                        setBorrador(null);
                      }}
                      className="h-11 px-6 rounded-full bg-aviation-cyan text-noche text-sm font-bold"
                    >
                      Listo
                    </button>
                    <button onClick={() => setBorrador(null)} className="h-11 px-4 rounded-full border border-white/15 text-sm font-semibold text-zinc-200">
                      Descartar
                    </button>
                  </>
                )}
                <button
                  onClick={p.onDeshacer}
                  disabled={!p.puedeDeshacer}
                  className="h-11 px-4 rounded-full border border-white/15 text-sm font-semibold text-zinc-200 inline-flex items-center gap-1.5 disabled:opacity-35"
                >
                  <Undo2 className="w-4 h-4" /> Deshacer el último cambio
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">Cambiar la ruta no corta el vuelo: el track sigue grabando y, si compartís el vuelo, la familia ve la ruta nueva.</p>
            </div>
            <button
              onClick={p.onSonidoAviso}
              role="switch"
              aria-checked={p.sonidoAviso}
              className="w-full flex items-center justify-between gap-3 py-1 text-left"
            >
              <span>
                <span className="block text-sm text-zinc-200">Pitido antes de entrar a un espacio</span>
                <span className="block text-[11px] text-zinc-500">El aviso siempre vibra si el teléfono puede; el sonido es aparte.</span>
              </span>
              <span className={`shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider ${p.sonidoAviso ? "text-aviation-cyan" : "text-zinc-500"}`}>
                {p.sonidoAviso ? "Prendido" : "Apagado"}
              </span>
            </button>
            {l && (
              <p className="text-[11px] text-zinc-500">
                Precisión ±{Math.round(l.precisionM)} m{l.precisionM > 100 ? " · señal débil" : ""}. El track se graba en el teléfono mientras la pantalla está prendida.
              </p>
            )}
            <p className="text-[11px] leading-snug text-zinc-500 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Ayuda VFR con el GPS del teléfono: no reemplaza la carta ni la navegación. La altura es la del GPS, no la del altímetro.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="flex-1 min-w-0">
            {p.ahora ? (
              <>
                <p className={`${ROTULO} flex items-center gap-1.5 min-w-0`}>
                  <Radio className="w-3 h-3 shrink-0" /> <span className="truncate">Hablás con {p.ahora.distintivo}</span>
                </p>
                {/* Las frecuencias enteras, en su línea: es lo que se marca en la radio. Un centro con
                    sectores trae varias, y se parten en dos renglones antes que cortarse. */}
                {p.ahora.mhz.length > 0 && (
                  <p className={`${p.ahora.mhz.length > 2 ? "text-[15px]" : "text-lg"} font-bold tabular-nums leading-snug text-aviation-cyan`}>{p.ahora.mhz.join(" · ")}</p>
                )}
                {p.despues && (
                  <p className="truncate text-xs text-zinc-400">
                    En {p.despues.desdeNm.toFixed(0)} NM: {p.despues.dependencia.distintivo} {p.despues.dependencia.mhz.join(" · ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-400">{l ? "Con quién hablás aparece con las capas del mapa." : "Esperando el GPS."}</p>
            )}
          </div>
          <button
            onClick={p.onDetalles}
            aria-expanded={p.detalles}
            aria-label={p.detalles ? "Menos detalles" : "Más detalles: espacios, ruta, precisión"}
            className="shrink-0 w-10 h-10 rounded-full border border-white/15 text-zinc-200 inline-flex items-center justify-center"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${p.detalles ? "" : "rotate-180"}`} />
          </button>
          <button onClick={p.onTerminar} className="shrink-0 h-10 px-4 rounded-full bg-aviation-cyan text-noche text-xs font-semibold inline-flex items-center gap-1.5">
            <Square className="w-3 h-3" fill="currentColor" /> Terminar
          </button>
        </div>
      </div>
    </div>
  );
}

function Instrumento({ rotulo, valor, unidad }: { rotulo: string; valor: string; unidad?: string }) {
  return (
    <div className="px-1 text-center min-w-0">
      <p className={ROTULO}>{rotulo}</p>
      <p className="text-lg font-bold tabular-nums text-white leading-tight truncate">
        {valor}
        {unidad && <span className="ml-0.5 text-[10px] font-semibold text-zinc-500">{unidad}</span>}
      </p>
    </div>
  );
}

/**
 * El último vuelo grabado, en la tarjeta de la ruta: cuánto duró, cuánto se voló, bajarlo como
 * GPX o ir a Registrar vuelo con la ruta, el avión y la fecha (sin horarios: el libro va con las
 * del tacómetro, como con el plan de vuelo).
 */
function VueloGrabado({ track, avionId, onBorrar }: { track: TrackVuelo; avionId: string; onBorrar: () => void }) {
  const r = resumenTrack(track.puntos);
  const bajar = () => {
    const url = URL.createObjectURL(new Blob([gpxDelTrack(track)], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreDelGpx(track);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const ruta = track.ruta.trim().split(/\s+/).filter(Boolean);
  const registrar = new URLSearchParams({ prefill: "true", date: fechaArgentina(track.inicio) });
  if (ruta.length) registrar.set("route", ruta.length > 1 ? `${ruta[0]} ${ruta[ruta.length - 1]}` : ruta[0]);
  if (avionId) registrar.set("aircraft_id", avionId);
  return (
    <section className="border-y border-white/10 -mx-4 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className={`${ROTULO} flex items-center gap-1.5`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" /> {track.terminado ? "Último vuelo grabado" : "Vuelo grabado sin terminar"}
        </p>
        <button
          onClick={() => window.confirm("¿Borrar el track grabado? Queda sólo en este teléfono.") && onBorrar()}
          aria-label="Borrar el track"
          className="-mr-1 w-8 h-8 inline-flex items-center justify-center rounded-full text-zinc-500 hover:text-red-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm text-zinc-900 dark:text-white tabular-nums">
        {track.ruta || "Sin ruta"} · {duracionCorta(r.minutos)} · {r.distanciaNm.toFixed(0)} NM
        {r.altitudMaxFt !== null ? ` · máx ${miles(r.altitudMaxFt)} ft` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/log-flight?${registrar}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-aviation-cyan text-noche px-3 py-1.5 text-xs font-semibold"
        >
          <NotebookPen className="w-3.5 h-3.5" /> Registrar el vuelo
        </Link>
        <button onClick={bajar} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          <Download className="w-3.5 h-3.5" /> Bajar el track (GPX)
        </button>
      </div>
    </section>
  );
}
