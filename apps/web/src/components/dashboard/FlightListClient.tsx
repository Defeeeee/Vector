"use client";

import { useMemo, useState } from "react";
import { Flight, Aircraft } from "@/types";
import { Search, Plane, Plus, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import FlightCard from "@/components/dashboard/FlightCard";
import { pesos } from "@/lib/costos";
import { filtrarVuelos, hayFiltros, type FiltrosVuelo } from "@/lib/busqueda-vuelos";
import { AnimatePresence, motion } from "framer-motion";

interface FlightListClientProps {
  flights: Flight[];
  aircraft: Aircraft[];
  /** Lo cobrado por vuelo, por `flight_id`. Vacío en modo `packs`. Ver `lib/costos.ts`. */
  costos?: Map<string, number>;
  alumno?: boolean;
  fechaPpa?: string | null;
  /** El id de un vuelo para abrir en edición (`?editar=`, desde Pasar al CAD). */
  editar?: string;
  /** El id de un vuelo para abrir (`?ver=`, desde el buscador). */
  ver?: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function FlightListClient({ flights, aircraft, costos = new Map(), alumno = false, fechaPpa = null, editar, ver }: FlightListClientProps) {
  const [filtros, setFiltros] = useState<FiltrosVuelo>({});
  const [abierto, setAbierto] = useState(false);

  const aircraftMap = new Map(aircraft.map(a => [a.id, a]));

  // La lógica vive en `lib/busqueda-vuelos.ts` y está testeada: un filtro que se
  // equivoca esconde vuelos sin avisar, que en un registro regulatorio es la peor
  // forma de fallar.
  const filteredFlights = useMemo(
    () => filtrarVuelos(flights, aircraft, filtros),
    [flights, aircraft, filtros]
  );

  /** Los propósitos que este piloto usa de verdad, no los 23 del catálogo. */
  const propositosUsados = useMemo(
    () => Array.from(new Set(flights.map(f => f.purpose).filter(Boolean))).sort(),
    [flights]
  );

  const setFiltro = (k: keyof FiltrosVuelo, v: string) =>
    setFiltros(prev => ({ ...prev, [k]: v || undefined }));

  const filtrado = hayFiltros(filtros);

  // Si hay que abrir uno en edición, la lista llega por lo menos hasta él.
  const [limit, setLimit] = useState(() => Math.max(30, editar || ver ? flights.findIndex((f) => f.id === (editar || ver)) + 1 : 0));

  // Group into ledger pages by calendar month, but ONLY for the visible ones
  const visibleFlights = useMemo(() => filteredFlights.slice(0, limit), [filteredFlights, limit]);

  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; flights: Flight[]; hours: number; pesos: number }>();
    for (const f of visibleFlights) {
      const d = new Date(f.date + 'T00:00:00');
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!groups.has(key)) {
        groups.set(key, { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, flights: [], hours: 0, pesos: 0 });
      }
      const g = groups.get(key)!;
      g.flights.push(f);
      g.hours += f.duration;
      g.pesos += costos.get(f.id) ?? 0;
    }
    return Array.from(groups.values());
  }, [visibleFlights, costos]);

  return (
    <div className="space-y-6 md:space-y-8 w-full">
      {/*
        El texto siempre a la vista; el resto detrás de un botón.

        Cuatro campos permanentes arriba del libro serían cuatro campos vacíos el
        99% de las veces. El texto es lo que se usa siempre; fecha, aeronave y
        propósito son para cuando ya sabés que el vuelo está y no lo encontrás.
      */}
      <div className="space-y-3 max-w-3xl">
        <div className="flex gap-2">
          <div className="relative group flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
            <input
              value={filtros.texto ?? ""}
              onChange={(e) => setFiltro("texto", e.target.value)}
              placeholder="Buscar ruta, matrícula u observaciones..."
              className="w-full bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 md:py-5 pl-14 pr-6 outline-none focus:border-aviation-blue dark:focus:border-aviation-cyan transition-all text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label="Más filtros"
            aria-expanded={abierto}
            className={`shrink-0 px-4 rounded-2xl border transition-colors ${
              abierto || filtrado
                ? "border-aviation-blue dark:border-aviation-cyan text-aviation-blue dark:text-aviation-cyan bg-aviation-blue/5"
                : "border-zinc-200 dark:border-white/10 text-zinc-400 dark:text-zinc-500 bg-white dark:bg-white/[0.03]"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {abierto && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
            <Campo label="Desde">
              <input type="date" value={filtros.desde ?? ""} onChange={(e) => setFiltro("desde", e.target.value)} className={INPUT} />
            </Campo>
            <Campo label="Hasta">
              <input type="date" value={filtros.hasta ?? ""} onChange={(e) => setFiltro("hasta", e.target.value)} className={INPUT} />
            </Campo>
            <Campo label="Aeronave">
              <select value={filtros.aeronaveId ?? ""} onChange={(e) => setFiltro("aeronaveId", e.target.value)} className={INPUT}>
                <option value="">Todas</option>
                {aircraft.map((a) => (
                  <option key={a.id} value={a.id}>{a.registration}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Propósito">
              <select value={filtros.proposito ?? ""} onChange={(e) => setFiltro("proposito", e.target.value)} className={INPUT}>
                <option value="">Todos</option>
                {propositosUsados.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Campo>
          </div>
        )}

        {filtrado && (
          <div className="flex items-center gap-3 text-[13px] text-zinc-500 dark:text-zinc-400">
            <span>
              <span className="data font-bold text-zinc-900 dark:text-white">{filteredFlights.length}</span>{" "}
              de <span className="data">{flights.length}</span> vuelos
            </span>
            <button
              type="button"
              onClick={() => setFiltros({})}
              className="inline-flex items-center gap-1 font-semibold hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>
        )}
      </div>

      {monthGroups.length > 0 ? (
        <div className="space-y-8">
          <AnimatePresence mode="popLayout">
            {monthGroups.map((group) => (
              <motion.div
                key={group.label}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {/* Ledger page header */}
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-white tracking-tight capitalize">{group.label}</h3>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold font-display text-aviation-blue-dark dark:text-aviation-cyan">{group.hours.toFixed(1)}</span>
                    <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      hs · {group.flights.length} {group.flights.length === 1 ? "vuelo" : "vuelos"}
                      {/* El total del mes, sólo si hubo cobros. Un "$ 0" en la
                          cabecera de cada mes sería ruido para quien usa packs. */}
                      {group.pesos > 0 && <> · <span className="data">{pesos(group.pesos)}</span></>}
                    </span>
                  </div>
                </div>

                {/* Ledger table */}
                <div className="bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl md:rounded-[2rem] shadow-sm dark:shadow-none overflow-hidden">
                  {/* Column labels (desktop only) */}
                  <div className="hidden md:grid grid-cols-[80px_130px_1fr_100px_72px] gap-4 px-6 py-2.5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/60 dark:bg-white/[0.02] text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                    <span>Fecha</span>
                    <span>Ruta</span>
                    <span>Aeronave</span>
                    <span className="text-right">Horas</span>
                    <span />
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-white/5">
                    {group.flights.map(flight => (
                      <FlightCard
                        key={flight.id}
                        flight={flight}
                        aircraft={flight.aircraft_id ? aircraftMap.get(flight.aircraft_id) : undefined}
                        allAircraft={aircraft}
                        costo={costos.get(flight.id) ?? null}
                        alumno={alumno}
                        fechaPpa={fechaPpa}
                        editarAlAbrir={flight.id === editar}
                        verAlAbrir={flight.id === ver}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {limit < filteredFlights.length && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => setLimit((l) => l + 50)}
                className="px-6 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors shadow-sm dark:shadow-none"
              >
                Cargar más vuelos
              </button>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-10 md:p-20 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 border-dashed rounded-[2rem] md:rounded-[3rem] text-center space-y-6 shadow-sm dark:shadow-none"
        >
          <div className="w-16 h-16 bg-zinc-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto border border-zinc-100 dark:border-white/10">
            <Plane className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Sin registros</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
              {filtrado
                ? "Ningún vuelo coincide con los filtros"
                : "Todavía no cargaste ningún vuelo"}
            </p>
          </div>
          {/* El atajo para cargar sólo si el libro está vacío de verdad. Con
              filtros puestos, lo que falta no es un vuelo: es sacar un filtro. */}
          {!filtrado && (
            <Link href="/dashboard/log-flight" className="inline-flex items-center space-x-3 text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/20 pb-1 text-sm font-semibold hover:border-zinc-900 dark:hover:border-white transition-colors">
              <span>Registrar ahora</span>
              <Plus className="w-3 h-3" />
            </Link>
          )}
        </motion.div>
      )}
    </div>
  );
}

const INPUT =
  "w-full bg-transparent border-b border-zinc-200 dark:border-white/10 py-1.5 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors [color-scheme:light] dark:[color-scheme:dark]";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
