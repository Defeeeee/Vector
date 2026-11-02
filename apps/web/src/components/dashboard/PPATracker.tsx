import { Check } from "lucide-react";
import type { Requisito } from "@/lib/pca-progress";
import { HORAS_PPA, horasQueFaltanPPA } from "@/lib/ppa-progress";

/**
 * "¿Cuánto me falta?" para un alumno piloto: el camino a la PPA (RAAC 61.520(a)).
 *
 * Los requisitos llegan armados desde el server (`requisitosPPA`, con la travesía larga
 * ya medida): acá sólo se dibujan. Componente de server, sin estado ni animaciones.
 */
export default function PPATracker({ requisitos }: { requisitos: Requisito[] }) {
  const faltan = horasQueFaltanPPA(requisitos);
  const fmt = (r: Requisito, v: number) => (r.esHoras ? v.toFixed(1) : String(Math.round(v)));
  return (
    <section className="rounded-[1.75rem] border p-5 md:p-6 bg-zinc-900 dark:bg-[#111111] border-zinc-900 dark:border-white/10 shadow-xl text-white">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/50">Camino a la PPA</p>
          <p className="data text-3xl md:text-4xl font-bold leading-none mt-2">
            {faltan.toFixed(1)}
            <span className="text-base font-medium ml-1 text-white/50">hs</span>
          </p>
          <p className="text-[11px] text-white/50 mt-2">te faltan de {HORAS_PPA} · RAAC 61.520(a)</p>
        </div>
      </div>
      <ul className="mt-6 space-y-4">
        {requisitos.map((r) => {
          const listo = r.actual >= r.objetivo;
          const pct = Math.min(100, (100 * r.actual) / r.objetivo);
          return (
            <li key={r.clave}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  {listo && <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} />}
                  {r.label}
                </span>
                <span className={`data text-[13px] ${listo ? "text-emerald-400" : "text-white/70"}`}>
                  {r.esHoras || r.unidad === "atrr" ? `${fmt(r, r.actual)}/${r.objetivo}` : listo ? "Hecha" : "Pendiente"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${listo ? "bg-emerald-400" : "bg-aviation-cyan"}`} style={{ width: `${pct}%` }} />
              </div>
              {r.nota && <p className="text-[11px] text-white/40 mt-1">{r.nota}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-white/40 mt-5 leading-relaxed">
        Doble mando son los vuelos cargados con instructor; vuelo solo, los que hiciste solo. La
        travesía de 150 NM se detecta por los aeródromos del vuelo.
      </p>
    </section>
  );
}
