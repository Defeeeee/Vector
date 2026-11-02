import { Lock, Trophy } from "lucide-react";
import { estadoHitos } from "@/lib/hitos";
import type { HorasPublicas } from "@/types";

/**
 * Las horas de un piloto en su perfil: el total grande, cuatro parciales y el próximo
 * hito. Las usan el perfil público (`/u/...`) y el de adentro de la app.
 */
export default function HorasPiloto({ horas }: { horas: HorasPublicas }) {
  const hitos = estadoHitos(horas.total);
  const [entero, decimal] = horas.total.toFixed(1).split(".");
  const detalle = [
    { label: "PIC", valor: horas.pic },
    { label: "Travesía", valor: horas.travesia },
    { label: "Noche", valor: horas.noche },
    { label: "Instrumentos", valor: horas.instrumentos },
  ];

  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-6">
      <div>
        <p className="eyebrow">Horas de vuelo</p>
        <p className="flex items-end gap-1 mt-2">
          <span className="data text-6xl md:text-7xl font-bold leading-none">{entero}</span>
          <span className="data text-6xl md:text-7xl font-bold leading-none text-zinc-300 dark:text-zinc-700">
            .{decimal}
          </span>
          <span className="data text-lg font-medium text-zinc-400 ml-2 mb-1">hs</span>
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {detalle.map((d) => (
          <div key={d.label} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {d.label}
            </p>
            <p className="data text-2xl font-bold mt-1">{d.valor.toFixed(1)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {hitos.proximo !== null ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">Próximo hito: {hitos.proximo} hs</span>
              <span className="data text-zinc-500 dark:text-zinc-400">faltan {hitos.faltan?.toFixed(1)}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-aviation-blue dark:bg-aviation-cyan"
                style={{ width: `${Math.round(hitos.avance * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold">Pasó las 1000 horas.</p>
        )}
        {hitos.alcanzados.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {hitos.alcanzados.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/10 px-2.5 py-1 text-[12px] font-semibold"
              >
                <Trophy className="w-3 h-3" />
                {h} hs
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
        Horas que el piloto cargó en su bitácora de Vector, sin simuladores y con las que trajo de su libro de papel. No
        es una certificación de ANAC.
      </p>
    </section>
  );
}

/** Lo que se ve en lugar de las horas —y de las publicaciones— de un perfil privado. */
export function PerfilPrivado({ mensaje, titulo = "Perfil privado" }: { mensaje: string; titulo?: string }) {
  return (
    <section className="rounded-[2rem] border border-dashed border-zinc-300 dark:border-white/15 bg-white dark:bg-white/[0.02] p-8 text-center space-y-2">
      <Lock className="w-6 h-6 mx-auto text-zinc-400" />
      <p className="font-display font-bold text-lg text-zinc-900 dark:text-white">{titulo}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{mensaje}</p>
    </section>
  );
}
