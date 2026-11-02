"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Loader2,
  Mountain,
  MapPin,
  Globe,
  Plane,
  Navigation,
  Ticket,
  Radio,
  FileText,
  Phone,
  Fuel,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Compass,
  Lock,
} from "lucide-react";
import { AirportRef } from "@/types";

export interface NotamItem {
  code: string;
  from: string;
  to: string;
  textRaw: string;
  textEsp: string;
}

export interface MadhelFull {
  name: string;
  fullName: string;
  state: string;
  fir: string;
  elevation: number;
  condition: string;
  control: string;
  traffic: string;
  status: string;
  runways: string[];
  radio: string[];
  localization: string;
  fuel: string;
  telephone: string[];
  particularNorms: string;
  generalNorms: string;
  /**
   * De dónde salieron las pistas, las frecuencias y el combustible cuando MADHEL no los
   * publica, y **de cuándo son**. `null` si todo vino de MADHEL.
   */
  aip: { edicion: string; vigenteDesde: string; url: string } | null;
  /** Las cartas oficiales del AIP. Vacío si el aeródromo no tiene ninguna publicada. */
  cartas: { letra: string; titulo: string; edicion: string; vigenteDesde: string; url: string }[];
}

/** What the pilot has flown at this aerodrome, precomputed on the server. */
export interface AirportHistory {
  visits: number;
  hours: number;
  landings: number;
  /** Already formatted on the server — see the hydration note in AGENTS.md. */
  lastVisit: string | null;
  asOrigin: number;
  asDestination: number;
}

interface Weather {
  metar: string;
  category: string;
  temp: number | null;
  windSpeed: number | null;
  windDir: string | number | null;
  nearestStation?: {
    icao: string;
    name: string;
    distanceNm: number;
  } | null;
}

const SIZE_LABEL: Record<string, string> = {
  L: "Grande",
  M: "Mediano",
  S: "Pequeño",
  H: "Helipuerto",
};

const CATEGORY_TONE: Record<string, string> = {
  VFR: "bg-green-500/10 text-green-600 dark:text-green-500",
  MVFR: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  IFR: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
  LIFR: "bg-red-500/10 text-red-600 dark:text-red-500",
};

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
        {icon}
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="data text-base font-bold text-zinc-900 dark:text-white mt-1.5 truncate">{value}</p>
    </div>
  );
}

export interface CartaJeppesen {
  categoria: string;
  archivo: string;
}

export default function AirportsClient({
  history,
  initialIcao,
  jeppesenAccess = false,
}: {
  /** ICAO -> what the pilot flew there. Only codes present in their logbook. */
  history: Record<string, AirportHistory>;
  initialIcao: string | null;
  /**
   * Si este piloto tiene `profiles.jeppesen_access`. Resuelto en el server porque
   * el flag vive en un campo que el propio piloto no puede leer de su sesión de
   * otra forma sin exponerlo — y porque así, sin el flag, ni siquiera se intenta
   * el fetch de `/api/charts`.
   */
  jeppesenAccess?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AirportRef[]>([]);
  const [selected, setSelected] = useState<AirportRef | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [notams, setNotams] = useState<NotamItem[]>([]);
  const [madhelFull, setMadhelFull] = useState<MadhelFull | null>(null);
  const [jeppesenCharts, setJeppesenCharts] = useState<CartaJeppesen[]>([]);
  const [loadingWx, setLoadingWx] = useState(false);
  const [loadingNotams, setLoadingNotams] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Open on the pilot's most-flown aerodrome instead of an empty state: the
  // question "what is my home field doing right now" is the common one, and
  // making them type it every visit is a toll on the frequent case.
  useEffect(() => {
    if (initialIcao) void pick(initialIcao, { clearSearch: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIcao]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    // 150 ms matches AirportResolver — the resolver feel is the point, and two
    // different debounces in the same app read as lag in one of them.
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`);
        const body = res.ok ? await res.json() : null;
        setResults(Array.isArray(body?.results) ? body.results : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function pick(icao: string, opts: { clearSearch?: boolean } = {}) {
    const { clearSearch = true } = opts;
    setResults([]);
    if (clearSearch) setQuery("");
    setWeather(null);
    setNotams([]);
    setMadhelFull(null);
    setJeppesenCharts([]);

    const res = await fetch(`/api/airports/search?icao=${icao}`);
    if (!res.ok) return;
    const airport: AirportRef = await res.json();
    setSelected(airport);

    setLoadingWx(true);
    setLoadingNotams(true);

    try {
      const [wxRes, notamRes, chartsRes] = await Promise.all([
        fetch(`/api/weather?icao=${icao}`).catch(() => null),
        fetch(`/api/notams?icao=${icao}`).catch(() => null),
        // Sin `jeppesenAccess` ni se pide: para casi todos los pilotos el pedido
        // volvería `[]` de todas formas (`/api/charts` lo resuelve así a
        // propósito), pero no tiene sentido gastar el round trip en el caso común.
        jeppesenAccess
          ? fetch(`/api/charts?icao=${icao}`).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (wxRes && wxRes.ok) {
        setWeather(await wxRes.json());
      }
      if (notamRes && notamRes.ok) {
        const notamData = await notamRes.json();
        setNotams(notamData.notams || []);
        setMadhelFull(notamData.madhel || null);
      }
      if (chartsRes && chartsRes.ok) {
        const cartas = await chartsRes.json();
        setJeppesenCharts(Array.isArray(cartas) ? cartas : []);
      }
    } catch {
      // Ignore network errors gracefully
    } finally {
      setLoadingWx(false);
      setLoadingNotams(false);
    }
  }

  const mine = selected ? history[selected.icao] : undefined;

  return (
    <div className="space-y-8 w-full">
      <div ref={boxRef} className="relative max-w-xl">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá por ICAO, ciudad o nombre — SADM, Morón…"
          className="w-full bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 pl-14 pr-12 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-600 shadow-cal dark:shadow-none"
        />
        {searching && (
          <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-400" />
        )}

        {results.length > 0 && (
          <ul className="absolute z-20 mt-2 w-full max-h-80 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-xl divide-y divide-zinc-100 dark:divide-white/5">
            {results.map((a) => (
              <li key={a.icao}>
                <button
                  type="button"
                  onClick={() => pick(a.icao)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="data text-sm font-bold text-zinc-900 dark:text-white w-14 shrink-0">
                    {a.icao}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-zinc-700 dark:text-zinc-300 truncate">{a.label}</span>
                    <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{a.name}</span>
                  </span>
                  {history[a.icao] && (
                    <span className="data shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                      {history[a.icao].visits}×
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!selected && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Buscá un aeródromo para ver su ficha, el clima y tu historial ahí.
        </p>
      )}

      {selected && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <h2 className="data text-5xl md:text-7xl font-bold text-zinc-900 dark:text-white leading-none tracking-tight">
              {selected.icao}
            </h2>
            <div className="pb-1 min-w-0 flex-1 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg md:text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                    {selected.label}
                  </p>
                  {selected.local && selected.local !== selected.icao && (
                    <span className="data text-xs font-bold px-2 py-0.5 rounded-md bg-aviation-blue/10 text-aviation-blue border border-aviation-blue/20">
                      ANAC: {selected.local}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate">{selected.name}</p>
              </div>

              {(loadingWx || loadingNotams) && (
                <span className="text-xs font-semibold text-aviation-blue animate-pulse flex items-center gap-2 bg-aviation-blue/10 px-3.5 py-1.5 rounded-full border border-aviation-blue/20">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Obteniendo ficha ANAC MADHEL, NOTAMs y METAR…
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Fact
              icon={<Mountain className="w-3.5 h-3.5" />}
              label="Elevación"
              value={
                selected.elevation !== undefined
                  ? `${selected.elevation} ft${selected.madhel?.elevationM !== undefined ? ` (${selected.madhel.elevationM}m)` : ""}`
                  : "—"
              }
            />
            <Fact
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="Ciudad / Prov"
              value={
                selected.madhel?.province
                  ? `${selected.city || selected.label}, ${selected.madhel.province}`
                  : selected.city || "—"
              }
            />
            <Fact icon={<Globe className="w-3.5 h-3.5" />} label="País" value={selected.country || "—"} />
            <Fact
              icon={<Plane className="w-3.5 h-3.5" />}
              label="Tipo"
              value={selected.madhel?.kind === "HEL" ? "Helipuerto" : SIZE_LABEL[selected.size] || "—"}
            />
            <Fact
              icon={<Ticket className="w-3.5 h-3.5" />}
              label="ANAC / IATA"
              value={[selected.local, selected.iata].filter(Boolean).join(" / ") || "—"}
            />
            <Fact
              icon={<Navigation className="w-3.5 h-3.5" />}
              label="Coords"
              value={
                selected.lat !== undefined && selected.lon !== undefined
                  ? `${selected.lat.toFixed(2)}, ${selected.lon.toFixed(2)}`
                  : "—"
              }
            />
          </div>

          {/*
            La ficha operativa.

            **El rótulo depende de la fuente, y ése era el bug.** Esta tarjeta decía
            siempre "Ficha Operativa Oficial ANAC MADHEL" — también arriba de datos que no
            venían de MADHEL sino de una tabla escrita a mano, y que estaban mal: San
            Fernando con la torre en 118.45 cuando son 119.00 y 120.05. Un piloto no tiene
            forma de dudar de algo rotulado "oficial".

            Ahora, cuando los datos salen del AIP, lo dice, muestra la edición y desde
            cuándo rige, y enlaza el documento para que se pueda contrastar.
          */}
          {(madhelFull || selected.madhel) && (
            <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 dark:border-white/10 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow text-aviation-blue">
                      {madhelFull?.aip ? "Ficha Operativa Oficial ANAC — MADHEL y AIP" : "Ficha Operativa Oficial ANAC MADHEL"}
                    </span>
                    {madhelFull?.status && (
                      <span
                        className={`data text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          madhelFull.status === "OK"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {madhelFull.status}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
                    {madhelFull?.fullName || selected.name}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="data px-3 py-1 rounded-xl bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 font-semibold">
                    {madhelFull?.condition || selected.madhel?.condition || "Público/Privado"}
                  </span>
                  <span className="data px-3 py-1 rounded-xl bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 font-semibold">
                    {madhelFull?.control || (selected.madhel?.controlled ? "Controlado (C)" : "No controlado (NC)")}
                  </span>
                  {madhelFull?.fir && (
                    <span className="data px-3 py-1 rounded-xl bg-aviation-blue/10 text-aviation-blue font-semibold border border-aviation-blue/20">
                      FIR {madhelFull.fir}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Pistas */}
                {madhelFull?.runways && madhelFull.runways.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-aviation-blue" />
                      Pistas de Aterrizaje
                    </p>
                    <div className="space-y-1.5">
                      {madhelFull.runways.map((rwy, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 text-xs font-semibold text-zinc-900 dark:text-white"
                        >
                          {rwy}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Radio Frecuencias */}
                {madhelFull?.radio && madhelFull.radio.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-aviation-blue" />
                      Frecuencias de Radio
                    </p>
                    <div className="space-y-1.5">
                      {madhelFull.radio.map((rad, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 text-xs font-semibold text-zinc-900 dark:text-white flex items-center justify-between"
                        >
                          <span>{rad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Combustibles & Teléfonos */}
                <div className="space-y-4">
                  {madhelFull?.fuel && (
                    <div className="space-y-1.5">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                        <Fuel className="w-3.5 h-3.5 text-aviation-blue" />
                        Combustible Disponible
                      </p>
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 text-xs font-semibold text-zinc-900 dark:text-white">
                        {madhelFull.fuel}
                      </div>
                    </div>
                  )}

                  {madhelFull?.telephone && madhelFull.telephone.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-aviation-blue" />
                        Teléfonos de Contacto
                      </p>
                      <div className="space-y-1">
                        {madhelFull.telephone.map((tel, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                          >
                            {tel}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {madhelFull?.localization && (
                <div className="pt-4 border-t border-zinc-100 dark:border-white/10">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-aviation-blue" />
                    Ubicación y Referencia Terrestre
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {madhelFull.localization}
                  </p>
                </div>
              )}

              {/* Normas Particulares ANAC */}
              {madhelFull?.particularNorms && (
                <div className="pt-4 border-t border-zinc-100 dark:border-white/10 space-y-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Normas Particulares y Reglas de Tránsito ANAC
                  </p>
                  <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-xs font-sans text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {madhelFull.particularNorms}
                  </div>
                </div>
              )}

              {/* Normas Generales AIP */}
              {madhelFull?.generalNorms && (
                <div className="pt-2 space-y-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-aviation-blue" />
                    Normas Generales AIP
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {madhelFull.generalNorms}
                  </p>
                </div>
              )}

              {/*
                Las cartas oficiales.

                **Es lo que hoy se busca en otra pestaña.** El plano de aeródromo y la carta
                de aproximación son las dos hojas que un piloto abre siempre, y estaban a
                tres clicks en el sitio de ANAC. Van con su edición y su fecha de vigencia
                al lado, porque una carta sin fecha no se puede usar: el AIP se enmienda
                cada 28 días y la que tenés descargada puede no ser la que rige.

                Se enlaza, no se copia: son megabytes por hoja y una copia nuestra
                envejecería en silencio.
              */}
              {madhelFull?.cartas && madhelFull.cartas.length > 0 && (
                <div className="pt-4 border-t border-zinc-100 dark:border-white/10 space-y-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-aviation-blue" />
                    Cartas oficiales del AIP
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {madhelFull.cartas.map((carta) => (
                      <a
                        key={carta.letra}
                        href={carta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-baseline gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 hover:border-aviation-blue/40 transition-colors"
                      >
                        <span className="data text-[10px] font-bold text-aviation-blue shrink-0">
                          AD 2.{carta.letra}
                        </span>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white group-hover:underline truncate">
                          {carta.titulo}
                        </span>
                        <span className="ml-auto data text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                          {carta.edicion}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/*
                Cartas Jeppesen — distinto de lo de arriba en las dos cosas que
                importan. Son de pago y viven en un servidor propio, no en el sitio
                de ANAC, así que el link no sale al PDF directo sino al proxy
                autenticado (`/api/charts/download`), que es el único lugar donde el
                token de la sesión puede sumarse al pedido.

                No hay estado de "no tenés acceso": para casi todos los pilotos
                `jeppesenCharts` nunca deja de estar vacío, y una sección que no
                aparece nunca no necesita explicarse.
              */}
              {jeppesenCharts.length > 0 && (
                <div className="pt-4 border-t border-zinc-100 dark:border-white/10 space-y-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-aviation-blue" />
                    Cartas Jeppesen
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {jeppesenCharts.map((carta) => {
                      const href = `/api/charts/download?icao=${encodeURIComponent(selected.icao)}&categoria=${encodeURIComponent(carta.categoria)}&archivo=${encodeURIComponent(carta.archivo)}`;
                      return (
                        <a
                          key={`${carta.categoria}/${carta.archivo}`}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-baseline gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 hover:border-aviation-blue/40 transition-colors"
                        >
                          <span className="data text-[10px] font-bold text-aviation-blue shrink-0 uppercase">
                            {carta.categoria}
                          </span>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white group-hover:underline truncate">
                            {carta.archivo.replace(/\.pdf$/i, "")}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
                De cuándo es el dato.

                **Sin fecha, un dato de navegación obliga al piloto a suponer, y lo que
                suponga va a ser optimista.** El AIP se enmienda cada 28 días (ciclo
                AIRAC), así que la edición y la fecha de vigencia son parte del dato, no
                una nota al pie. El enlace va al PDF de ANAC para poder contrastar.
              */}
              {madhelFull?.aip && (
                <div className="pt-4 border-t border-zinc-100 dark:border-white/10 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Pistas, frecuencias y combustible de este aeródromo controlado salen del{" "}
                    <a
                      href={madhelFull.aip.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-aviation-blue hover:underline"
                    >
                      AIP Argentina AD 2
                    </a>{" "}
                    — MADHEL no los publica. Edición{" "}
                    <span className="data font-semibold text-zinc-700 dark:text-zinc-200">{madhelFull.aip.edicion}</span>,
                    vigente desde{" "}
                    <span className="data font-semibold text-zinc-700 dark:text-zinc-200">{madhelFull.aip.vigenteDesde}</span>.
                    Verificá contra los NOTAM antes de volar.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Meteorología */}
            <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Meteorología</p>
                  <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                    Condiciones ahora
                  </h3>
                </div>
                {weather?.category && weather.category !== "UNK" && (
                  <span
                    className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      CATEGORY_TONE[weather.category] || "bg-zinc-100 dark:bg-white/10 text-zinc-500"
                    }`}
                  >
                    {weather.category}
                  </span>
                )}
              </div>

              {loadingWx ? (
                <p className="text-sm text-zinc-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Consultando…
                </p>
              ) : weather ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Viento
                      </p>
                      <p className="data text-sm font-bold text-zinc-900 dark:text-white mt-1">
                        {weather.windSpeed !== null && weather.windSpeed > 0
                          ? `${weather.windDir !== null ? `${weather.windDir}°` : "VRB"} / ${weather.windSpeed} kt`
                          : "Calma"}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Temp
                      </p>
                      <p className="data text-sm font-bold text-zinc-900 dark:text-white mt-1">
                        {weather.temp !== null ? `${weather.temp} °C` : "—"}
                      </p>
                    </div>
                  </div>
                  {weather.nearestStation && (
                    <div className="rounded-xl bg-aviation-blue/10 border border-aviation-blue/20 px-3 py-2 text-xs font-semibold text-aviation-blue flex items-center gap-2">
                      <Compass className="w-3.5 h-3.5 shrink-0 text-aviation-blue" />
                      <span>
                        METAR de estación cercana: <strong>{weather.nearestStation.name} ({weather.nearestStation.icao})</strong> a {weather.nearestStation.distanceNm} NM
                      </span>
                    </div>
                  )}
                  <div className="rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2.5">
                    <p className="data text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-words">
                      {weather.metar}
                    </p>
                  </div>
                  {/* The METAR is informational — see the Términos page. */}
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                    Informativo. No lo uses como única fuente para una decisión operativa.
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Sin reporte para este aeródromo. La mayoría de los aeródromos chicos no emiten METAR.
                </p>
              )}
            </div>

            {/* NOTAMs en vivo */}
            <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Avisos a los navegantes
                  </p>
                  <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                    NOTAMs en vivo
                  </h3>
                </div>

                {loadingNotams ? (
                  <span className="text-xs text-zinc-400 flex items-center gap-1.5 font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> ANAC...
                  </span>
                ) : notams.length > 0 ? (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {notams.length} {notams.length === 1 ? "NOTAM activo" : "NOTAMs activos"}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Sin NOTAMs
                  </span>
                )}
              </div>

              {loadingNotams ? (
                <p className="text-sm text-zinc-400 flex items-center gap-2 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Obteniendo NOTAMs vigentes desde el servicio ANAC…
                </p>
              ) : notams.length > 0 ? (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {notams.map((item, idx) => (
                    <div
                      key={item.code + idx}
                      className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/10 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">
                          Válido: {item.from.slice(0, 10)} → {item.to.slice(0, 10)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {item.textEsp || item.textRaw}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 py-2">
                  No hay NOTAMs vigentes reportados para este aeródromo.
                </p>
              )}
            </div>

            {/* Tu historial — esto es lo que FlightDeck no puede mostrar. */}
            <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-7 space-y-4">
              <div>
                <p className="eyebrow">Tu historial acá</p>
                <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                  {mine ? "Ya volaste a este aeródromo" : "Todavía no volaste acá"}
                </h3>
              </div>

              {mine ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Veces
                      </p>
                      <p className="data text-2xl font-bold text-zinc-900 dark:text-white mt-1">{mine.visits}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Horas
                      </p>
                      <p className="data text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                        {mine.hours.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Aterrizajes
                      </p>
                      <p className="data text-2xl font-bold text-zinc-900 dark:text-white mt-1">{mine.landings}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-200 dark:border-white/10 space-y-2 text-[13px]">
                    <p className="flex justify-between gap-3">
                      <span className="text-zinc-500 dark:text-zinc-400">Última vez</span>
                      <span className="data font-bold text-zinc-900 dark:text-white">{mine.lastVisit}</span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span className="text-zinc-500 dark:text-zinc-400">Como salida / llegada</span>
                      <span className="data font-bold text-zinc-900 dark:text-white">
                        {mine.asOrigin} / {mine.asDestination}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Cuando registres un vuelo desde o hacia {selected.icao}, vas a ver acá cuántas
                  veces fuiste, cuántas horas y cuándo fue la última.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
