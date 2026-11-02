"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  CloudFog,
  Glasses,
  Heart,
  Moon,
  Plane,
  Sunrise,
  Trophy,
  Map as MapIcon,
  List as ListIcon, Compass } from "lucide-react";
import { Flight, Aircraft, Logbook } from "@/types";
import FlightMap from "./FlightMap";
import { Odometer, StatTile } from "./Cifras";
import {
  PERIODS,
  Period,
  allAirports,
  allRoutes,
  anacMatrix,
  buildInsights,
  byAircraft,
  filterByPeriod,
  distanceTotals,
  headlineStats,
  openingTotals,
  timeOfDay,
  topAirports,
  topRoutes,
} from "@/lib/summary";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHead({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="space-y-1">
        <h3 className="text-xl md:text-2xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
          {title}
        </h3>
        {subtitle && <p className="eyebrow">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

/**
 * Radial distribution of departures, 00:00 at the top running clockwise so the
 * dial reads like a 24-hour clock face rather than like a pie chart.
 */
function HourDial({ byHour, peakHour }: { byHour: number[]; peakHour: number | null }) {
  const max = Math.max(...byHour, 1);
  const cx = 100;
  const cy = 100;
  const inner = 46;
  const outer = 92;

  const wedge = (hour: number, hours: number) => {
    const r = Number((inner + (outer - inner) * (hours / max)).toFixed(2));
    const half = (360 / 24 / 2 - 1) * (Math.PI / 180);
    const mid = (hour / 24) * 2 * Math.PI;
    const a0 = mid - half;
    const a1 = mid + half;
    // Rounded before it reaches the path string: Math.sin/Math.cos are
    // implementation-defined in ECMAScript, so Node and Chrome disagree in the
    // last few digits and the server/client markup differs — a real hydration
    // mismatch, caught by the dev overlay. Two decimals on a 200-unit viewBox is
    // far below a pixel.
    const pt = (radius: number, a: number) => [
      Number((cx + radius * Math.sin(a)).toFixed(2)),
      Number((cy - radius * Math.cos(a)).toFixed(2)),
    ];
    const [x0, y0] = pt(inner, a0);
    const [x1, y1] = pt(inner, a1);
    const [x2, y2] = pt(r, a1);
    const [x3, y3] = pt(r, a0);
    return `M ${x0} ${y0} A ${inner} ${inner} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 0 ${x3} ${y3} Z`;
  };

  return (
    <div className="relative w-full max-w-[240px] mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-auto">
        <circle cx={cx} cy={cy} r={outer} className="fill-none stroke-zinc-100 dark:stroke-white/5" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={inner} className="fill-none stroke-zinc-100 dark:stroke-white/5" strokeWidth={1} />
        {byHour.map((h, i) =>
          h > 0 ? (
            <path key={i} d={wedge(i, h)} className="fill-aviation-blue dark:fill-aviation-cyan" />
          ) : null
        )}
      </svg>

      {[
        { label: "00:00", style: "top-0 left-1/2 -translate-x-1/2 -translate-y-1" },
        { label: "06:00", style: "top-1/2 right-0 translate-x-2 -translate-y-1/2" },
        { label: "12:00", style: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1" },
        { label: "18:00", style: "top-1/2 left-0 -translate-x-2 -translate-y-1/2" },
      ].map((t) => (
        <span
          key={t.label}
          className={`absolute font-mono text-[9px] font-bold text-zinc-400 dark:text-zinc-500 ${t.style}`}
        >
          {t.label}
        </span>
      ))}

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Peak
        </span>
        <span className="data text-lg font-bold text-zinc-900 dark:text-white leading-none">
          {peakHour === null ? "—" : `${String(peakHour).padStart(2, "0")}:00`}
        </span>
      </div>
    </div>
  );
}

export default function SummaryClient({
  flights,
  aircraft,
  logbooks,
  todayIso,
  airportNames,
  airportDetails = {},
}: {
  flights: Flight[];
  aircraft: Aircraft[];
  logbooks: Logbook[];
  todayIso: string;
  airportNames: Record<string, string>;
  airportDetails?: Record<string, { name: string; label: string; lat?: number; lon?: number; city?: string }>;
}) {
  const [period, setPeriod] = useState<Period>("todo");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const scoped = useMemo(() => filterByPeriod(flights, period, todayIso), [flights, period, todayIso]);

  // Carried-forward hours only apply to "todo". An opening balance has no date,
  // so folding it into "last 28 days" would invent recent flying that never
  // happened — and the odometer would stop matching the matrix.
  const opening = useMemo(
    () => (period === "todo" ? openingTotals(logbooks) : null),
    [logbooks, period]
  );

  // Millas del período. Lo medido y lo estimado se calculan juntos pero se
  // muestran separados: mezclarlos daría un total mitad real y mitad inventado
  // sin que el piloto pueda distinguirlos.
  const millas = useMemo(() => distanceTotals(scoped, airportDetails), [scoped, airportDetails]);

  const stats = useMemo(() => {
    const base = headlineStats(scoped);
    if (!opening) return base;
    return {
      totalHours: base.totalHours + opening.totalHours,
      pic: base.pic + opening.pic,
      imc: base.imc + opening.imc,
      night: base.night + opening.night,
      hood: base.hood + opening.hood,
      landings: base.landings + opening.landings,
      flights: base.flights,
    };
  }, [scoped, opening]);

  const matrix = useMemo(() => {
    const base = anacMatrix(scoped);
    if (!opening) return base;
    const merge = (cells: number[], add: number[]) => cells.map((v, i) => v + add[i]);
    const rows = [
      { ...base.rows[0], cells: merge(base.rows[0].cells, opening.cells.local) },
      { ...base.rows[1], cells: merge(base.rows[1].cells, opening.cells.travesia) },
    ].map((r) => ({ ...r, total: r.cells.reduce((a, b) => a + b, 0) }));
    const extraAdd = [opening.cells.imcPil, opening.cells.imcCop, opening.cells.capota, 0, 0];
    return {
      ...base,
      rows,
      extras: base.extras.map((e, i) => ({ ...e, value: e.value + extraAdd[i] })),
      total: rows.reduce((a, r) => a + r.total, 0),
    };
  }, [scoped, opening]);
  const airports = useMemo(() => topAirports(scoped), [scoped]);
  const routes = useMemo(() => topRoutes(scoped), [scoped]);
  // Counted unsliced: the caption reports how many exist, not how many the
  // top-N list happens to show.
  const airportTotal = useMemo(() => allAirports(scoped).length, [scoped]);
  const routeTotal = useMemo(() => allRoutes(scoped).length, [scoped]);
  const hours = useMemo(() => timeOfDay(scoped), [scoped]);
  const fleet = useMemo(() => byAircraft(scoped, aircraft), [scoped, aircraft]);
  const openingHours = opening?.totalHours ?? 0;
  const insights = useMemo(() => buildInsights(scoped, aircraft), [scoped, aircraft]);

  const maxVisits = Math.max(...airports.map((a) => a.visits), 1);
  const maxBand = Math.max(...hours.bands.map((b) => b.hours), 1);
  const maxFleet = Math.max(...fleet.map((f) => f.total), 1);
  const insightIcons = [CalendarDays, Trophy, Heart];

  return (
    <div className="space-y-8 md:space-y-10 w-full">
      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            aria-pressed={period === p.key}
            className={`font-mono text-[11px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-full transition-colors ${
              period === p.key
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {scoped.length === 0 && openingHours === 0 ? (
        <Card className="text-center py-16">
          <p className="text-lg font-display font-bold text-zinc-900 dark:text-white">
            Sin vuelos en este período
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            Probá con un rango más amplio.
          </p>
        </Card>
      ) : (
        <>
          {/* Odometer */}
          <div className="space-y-3">
            <p className="eyebrow">Horas acumuladas · {period === "todo" ? "carrera total" : "en el período"}</p>
            <Odometer value={stats.totalHours} />
          </div>

          {/* Headline tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile icon={<Clock className="w-3.5 h-3.5" />} label="PIC" value={stats.pic.toFixed(1)} caption="Al mando" />
            <StatTile icon={<CloudFog className="w-3.5 h-3.5" />} label="IMC" value={stats.imc.toFixed(1)} caption="En instrumentos" />
            <StatTile icon={<Moon className="w-3.5 h-3.5" />} label="Noche" value={stats.night.toFixed(1)} caption="Vuelo nocturno" />
            <StatTile icon={<Glasses className="w-3.5 h-3.5" />} label="Capota" value={stats.hood.toFixed(1)} caption="Bajo capota" />
            <StatTile icon={<Sunrise className="w-3.5 h-3.5" />} label="Ater." value={String(stats.landings)} caption="Aterrizajes totales" />
            <StatTile icon={<Plane className="w-3.5 h-3.5" />} label="Vuelos" value={String(stats.flights)} caption="Entradas de log" />
            <StatTile
              icon={<Compass className="w-3.5 h-3.5" />}
              label="Millas"
              value={millas.totalNm.toLocaleString("es-AR")}
              caption={
                millas.estimadasNm > 0
                  ? `NM medidas · ~${millas.estimadasNm.toLocaleString("es-AR")} estimadas en local`
                  : "NM entre aeródromos"
              }
            />
          </div>

          {/* ANAC matrix */}
          <Card>
            <SectionHead
              title="Desglose ANAC"
              subtitle="Local · Travesía × Día · Noche × PIC · SIC"
              aside={
                <span className="data text-sm font-bold text-zinc-900 dark:text-white shrink-0">
                  Σ {matrix.total.toFixed(1)}
                  <span className="text-zinc-400 dark:text-zinc-500 font-medium"> hs</span>
                </span>
              }
            />

            <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <table className="w-full min-w-[520px] border-separate border-spacing-1.5">
                <thead>
                  <tr>
                    <th className="w-24" />
                    {matrix.columns.map((c) => (
                      <th
                        key={c}
                        className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 text-left pb-1"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.label}>
                      <th className="text-left align-middle pr-3">
                        <span className="block text-sm font-bold text-zinc-900 dark:text-white">{row.label}</span>
                        <span className="data block text-[11px] text-zinc-400 dark:text-zinc-500">
                          {row.total.toFixed(1)} hs
                        </span>
                      </th>
                      {row.cells.map((v, i) => (
                        <td key={i}>
                          {/* A filled cell is the point of the grid: it shows at a
                              glance which boxes a pilot's hours actually land in. */}
                          <div
                            className={`rounded-xl px-3 py-2.5 border ${
                              v > 0
                                ? "bg-aviation-blue border-aviation-blue text-white"
                                : "bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/10"
                            }`}
                          >
                            <span
                              className={`data block text-base font-bold leading-none ${
                                v > 0 ? "text-white" : "text-zinc-400 dark:text-zinc-600"
                              }`}
                            >
                              {v.toFixed(1)}
                            </span>
                            <span
                              className={`font-mono block text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                                v > 0 ? "text-white/70" : "text-zinc-300 dark:text-zinc-700"
                              }`}
                            >
                              hs
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-zinc-200 dark:border-white/10">
              {matrix.extras.map((e) => (
                <div key={e.label}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {e.label}
                  </p>
                  <p className="data text-lg font-bold text-zinc-900 dark:text-white mt-1">
                    {e.value.toFixed(1)}
                    <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 ml-1">hs</span>
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {/* Airports + time of day */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <SectionHead
                title="Dónde volaste"
                subtitle={`${airportTotal} ${airportTotal === 1 ? "aeródromo" : "aeródromos"} · ${routeTotal} ${routeTotal === 1 ? "ruta única" : "rutas únicas"}`}
                aside={
                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-white/10 p-1 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode("map")}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
                        viewMode === "map"
                          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <MapIcon className="w-3 h-3" /> Mapa
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
                        viewMode === "list"
                          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <ListIcon className="w-3 h-3" /> Lista
                    </button>
                  </div>
                }
              />

              {viewMode === "map" ? (
                <FlightMap
                  airports={allAirports(scoped)}
                  routes={allRoutes(scoped)}
                  airportDetails={airportDetails}
                />
              ) : (
                <div className="space-y-3">
                  {airports.map((a, i) => (
                    <div key={a.icao} className="flex items-center gap-3">
                      <span className="data text-[11px] text-zinc-300 dark:text-zinc-600 w-5 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="w-16 shrink-0">
                        <span className="data text-sm font-bold text-zinc-900 dark:text-white">{a.icao}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-aviation-blue dark:bg-aviation-cyan"
                            style={{ width: `${(a.visits / maxVisits) * 100}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-1">
                          {airportNames[a.icao] || "—"}
                        </p>
                      </div>
                      <span className="data text-sm font-bold text-zinc-900 dark:text-white shrink-0">{a.visits}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionHead title="Hora del día" subtitle="Distribución por franja (UTC)" />
              <HourDial byHour={hours.byHour} peakHour={hours.peakHour} />
              <div className="mt-6 space-y-2">
                {hours.bands.map((b) => (
                  <div key={b.label} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {b.label}{" "}
                        <span className="data text-[11px] font-normal text-zinc-400 dark:text-zinc-500">{b.range}</span>
                      </span>
                      <span className="data text-sm font-bold text-zinc-900 dark:text-white">
                        {b.hours.toFixed(1)}
                        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">h</span>
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-aviation-blue dark:bg-aviation-cyan"
                        style={{ width: `${(b.hours / maxBand) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Top routes */}
          {routes.length > 0 && (
            <Card>
              <SectionHead title="Top rutas" subtitle="Las más voladas · todas las travesías" />
              <div className="space-y-5">
                {routes.map((r) => (
                  <div key={`${r.origin}-${r.destination}`} className="flex items-center gap-4">
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-aviation-blue dark:bg-aviation-cyan" />
                      <span className="w-10 border-t border-dashed border-zinc-300 dark:border-white/20" />
                      <span className="w-1.5 h-1.5 rounded-full border border-aviation-blue dark:border-aviation-cyan" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="data text-sm font-bold text-zinc-900 dark:text-white">{r.origin}</span>
                        <span className="text-zinc-300 dark:text-zinc-600">→</span>
                        <span className="data text-sm font-bold text-zinc-900 dark:text-white">{r.destination}</span>
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5 uppercase">
                        {(airportNames[r.origin] || r.origin)} → {(airportNames[r.destination] || r.destination)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="data text-sm font-bold text-zinc-900 dark:text-white">{r.times}×</span>
                      <p className="data text-[11px] text-zinc-400 dark:text-zinc-500">{r.hours.toFixed(1)} hs</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-4">
              <p className="eyebrow">Lo que tus datos cuentan</p>
              <div className="grid md:grid-cols-3 gap-4">
                {insights.map((ins, i) => {
                  const Icon = insightIcons[i % insightIcons.length];
                  return (
                    <motion.div
                      key={ins.eyebrow}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.08 }}
                      className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-zinc-900 dark:text-white">
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {ins.eyebrow}
                        </span>
                      </div>
                      <h4 className="text-base md:text-lg font-display font-bold text-zinc-900 dark:text-white leading-snug">
                        {ins.headline}
                      </h4>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{ins.detail}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fleet */}
          <Card>
            <SectionHead
              title="Por aeronave"
              subtitle={`${fleet.length} ${fleet.length === 1 ? "matrícula en el libro" : "matrículas en el libro"}`}
            />
            <div className="space-y-4">
              {fleet.map((r) => (
                <div key={r.registration} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="data text-sm font-bold text-zinc-900 dark:text-white">{r.registration}</span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">· {r.type}</span>
                    </p>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full bg-aviation-blue dark:bg-aviation-cyan"
                        style={{ width: `${(r.total / maxFleet) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 md:gap-6 shrink-0 text-right">
                    {[
                      { k: "Vuelos", v: String(r.flights) },
                      { k: "PIC", v: r.pic.toFixed(1) },
                      { k: "Total", v: r.total.toFixed(1) },
                    ].map((c) => (
                      <div key={c.k}>
                        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {c.k}
                        </p>
                        <p className="data text-sm font-bold text-zinc-900 dark:text-white">{c.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
