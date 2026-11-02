import { Aircraft, Flight } from "@/types";
import { CustomStat, evaluateStat } from "@/lib/custom-stats";
import { AlertTriangle, Check } from "lucide-react";

/**
 * Las métricas del piloto, en el Resumen.
 *
 * Se evalúan acá y no en el servidor: los vuelos ya están cargados en esta
 * pantalla, así que recalcular del otro lado sería trabajo de más — y el regex
 * que pueda tener una métrica corre en la pestaña de quien lo escribió.
 *
 * Si el piloto no definió ninguna, no se renderiza nada. Un bloque vacío
 * invitando a configurar algo es ruido.
 */
export default function CustomStatsRow({
  stats,
  flights,
  aircraft,
}: {
  stats: CustomStat[];
  flights: Flight[];
  aircraft: Aircraft[];
}) {
  if (stats.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="eyebrow">Tus métricas</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const r = evaluateStat(stat, flights, aircraft);
          const pct = r.target ? Math.min(100, (r.value / r.target) * 100) : null;

          return (
            <div
              key={stat.id}
              className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 leading-tight">
                  {stat.name}
                </p>
                {r.met === true && (
                  <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
                )}
              </div>

              <p className="text-2xl font-bold data text-zinc-900 dark:text-white leading-none">
                {r.value}
                {r.target !== null && (
                  <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
                    {" "}/ {r.target}
                  </span>
                )}
              </p>

              {pct !== null && (
                <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.met ? "bg-emerald-500" : "bg-aviation-blue"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* Un patrón descartado tiene que decirlo: si no, el piloto ve un
                  número que no filtró nada y lo lee como si hubiera filtrado. */}
              {r.regexError && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500 leading-tight">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  {r.regexError}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
