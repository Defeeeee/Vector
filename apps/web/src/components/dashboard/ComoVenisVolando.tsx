import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import type { Flight } from "@/types";
import { compararConElPromedio, racha } from "@/lib/actividad";

/**
 * Qué tan seguido volás, dicho en palabras.
 *
 * El heatmap de más abajo ya dibuja la actividad, pero dibujarla no es decirla: un
 * piloto mira una grilla de cuadraditos y no sabe si viene mejor o peor que en
 * marzo. Estas dos frases salen de los mismos vuelos y contestan lo que la grilla
 * deja implícito.
 *
 * `todayIso` baja resuelto del server, como en el resto del dashboard: el server
 * corre en UTC y el navegador en UTC−3, y una cuenta que empiece en `new Date()`
 * puede caer en semanas distintas de los dos lados.
 */
export default function ComoVenisVolando({
  flights,
  todayIso,
}: {
  flights: Flight[];
  todayIso: string;
}) {
  const r = racha(flights, todayIso);
  const c = compararConElPromedio(flights, todayIso);

  // Sin racha viva ni historia con qué comparar no hay nada que decir, y una
  // tarjeta que dice "0 semanas" es un reproche, no un dato.
  if (r.semanas === 0 && c.meses === 0) return null;

  const mejor = c.diferencia > 0;
  const Icono = mejor ? TrendingUp : TrendingDown;

  return (
    <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
      {r.semanas > 0 && (
        <div className="rounded-[1.75rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="data text-2xl font-bold text-zinc-900 dark:text-white leading-none">
              {r.semanas}
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              {r.semanas === 1 ? "semana seguida volando" : "semanas seguidas volando"}
              {/* Es martes y todavía no volaste: la racha sigue viva, quedan días.
                  Decirlo evita que el número se lea como si ya se hubiera cortado. */}
              {!r.incluyeEstaSemana && (
                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Esta semana todavía no volaste.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {c.meses > 0 && (
        <div className="rounded-[1.75rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              mejor ? "bg-emerald-500/10" : "bg-zinc-100 dark:bg-white/10"
            }`}
          >
            <Icono
              className={`w-4 h-4 ${
                mejor ? "text-emerald-600 dark:text-emerald-500" : "text-zinc-500 dark:text-zinc-400"
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="data text-2xl font-bold text-zinc-900 dark:text-white leading-none">
              {c.horas.toFixed(1)}
              <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500 ml-1">hs</span>
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              este mes · tu promedio de {c.meses} es{" "}
              <span className="data">{c.promedio.toFixed(1)}</span> hs
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
