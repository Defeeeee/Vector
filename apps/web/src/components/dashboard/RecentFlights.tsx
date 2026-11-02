import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Flight, Aircraft } from "@/types";
import { splitRoute } from "@/lib/route";
import { horasDeLaFila } from "@/lib/simulador";
import { costoDeVuelo, pesos } from "@/lib/costos";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * The last few flights, as a read-only strip on the dashboard.
 *
 * Deliberately not the interactive `FlightCard` used in the logbook: this is a
 * glance-and-go summary, and giving it edit/delete affordances would put
 * destructive actions on the landing screen of the app.
 *
 * Dates are formatted here, in a server component, on purpose — the repo has
 * already paid for two hydration bugs from formatting dates in the client (see
 * the AGENTS.md entry on hydration).
 */
export default function RecentFlights({
  flights,
  aircraft,
  limit = 5,
  costos = new Map(),
}: {
  flights: Flight[];
  aircraft: Aircraft[];
  limit?: number;
  /**
   * Lo cobrado por cada vuelo, por `flight_id`. Ver `src/lib/costos.ts`.
   *
   * Opcional y vacío por defecto: en modo `packs` no hay cobros, y esta tira tiene
   * que verse igual de bien sin la columna de plata.
   */
  costos?: Map<string, number>;
}) {
  if (flights.length === 0) return null;

  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const recent = [...flights]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow">Últimos vuelos</p>
          <h3 className="text-xl md:text-2xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
            Lo último que volaste
          </h3>
        </div>
        <Link
          href="/dashboard/history"
          className="shrink-0 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
        >
          Ver todo
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none divide-y divide-zinc-100 dark:divide-white/5 overflow-hidden">
        {recent.map((f) => {
          const [origin, dest] = splitRoute(f.route, "???");
          const ac = f.aircraft_id ? byId.get(f.aircraft_id) : undefined;
          // Una sesión de simulador no tiene dos extremos: su ruta es una palabra.
          // Pasarla por el par origen→destino la mostraría como "LOCAL → ???".
          const enSimulador = Boolean(ac?.is_simulator);
          // Assembled by hand rather than via toLocaleDateString: the es-AR
          // long form renders "25 de jul de 2026", and the two "de"s eat the
          // width that the route needs. Same reason FlightDeck shows "23 MAR
          // 2026".
          const [yy, mm, dd] = f.date.split("-");
          const when = `${dd} ${MONTHS[Number(mm) - 1]} ${yy}`;
          return (
            <Link
              key={f.id}
              href="/dashboard/history"
              className="grid grid-cols-[1fr_auto] md:grid-cols-[128px_1fr_auto_20px] items-center gap-x-4 gap-y-1 px-5 md:px-6 py-4 hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
            >
              <span className="data text-[11px] uppercase text-zinc-400 dark:text-zinc-500 order-1 md:order-none">
                {when}
              </span>

              <span className="flex items-center gap-2 min-w-0 col-span-2 md:col-span-1 order-3 md:order-none">
                {enSimulador ? (
                  <>
                    <span className="data text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded shrink-0">
                      Sim
                    </span>
                    <span className="data text-sm font-bold text-zinc-900 dark:text-white truncate">{origin}</span>
                  </>
                ) : (
                  <>
                    <span className="data text-sm font-bold text-zinc-900 dark:text-white">{origin}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
                    <span className="data text-sm font-bold text-zinc-900 dark:text-white">{dest}</span>
                  </>
                )}
                {ac?.registration && (
                  <span className="data text-[11px] text-zinc-400 dark:text-zinc-500 truncate ml-1">
                    · {ac.registration}
                  </span>
                )}
              </span>

              {/*
                El costo va debajo de las horas y no en columna propia: una columna
                vacía en cada fila del piloto que usa packs —o que no cargó el precio
                de la aeronave— sería un hueco permanente en la pantalla principal.
              */}
              <span className="text-right order-2 md:order-none">
                <span className="data text-sm font-bold text-zinc-900 dark:text-white block">
                  {horasDeLaFila(f, enSimulador).toFixed(1)}
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 ml-0.5">hs</span>
                </span>
                {costoDeVuelo(f, costos) !== null && (
                  <span className="data text-[11px] font-medium text-zinc-400 dark:text-zinc-500 block mt-0.5 whitespace-nowrap">
                    {pesos(costoDeVuelo(f, costos)!)}
                  </span>
                )}
              </span>

              <ChevronRight className="hidden md:block w-4 h-4 text-zinc-300 dark:text-zinc-600" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
