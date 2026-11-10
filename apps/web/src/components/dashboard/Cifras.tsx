import type { ReactNode } from "react";

/**
 * El número grande de horas y las tarjetas de cifras: los del Resumen, compartidos con el
 * inicio para que se vean iguales en los dos lados. Sin estado ni efectos, así sirven en
 * un componente de server (el inicio) y en uno de cliente (`SummaryClient`).
 */

/** El número grande, con los decimales atenuados: las horas enteras son el mensaje. */
export function Odometer({ value }: { value: number }) {
  const [whole, frac] = value.toFixed(1).split(".");
  return (
    <div className="flex items-end gap-1">
      <span className="data text-6xl md:text-8xl lg:text-[112px] font-bold lg:font-display lg:font-extrabold lg:tracking-[-0.055em] text-zinc-900 dark:text-white leading-none tracking-tight">
        {whole}
      </span>
      <span className="data text-6xl md:text-8xl lg:text-[112px] font-bold lg:font-display lg:font-extrabold lg:tracking-[-0.055em] text-zinc-300 lg:dark:text-aviation-cyan dark:text-zinc-700 leading-none tracking-tight">
        .{frac}
      </span>
      <span className="data text-xl md:text-2xl font-medium text-zinc-400 dark:text-zinc-500 ml-2 mb-1 md:mb-2">
        hs
      </span>
    </div>
  );
}

export function StatTile({ icon, label, value, caption }: { icon: ReactNode; label: string; value: string; caption: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon px-4 py-4 md:px-5 md:py-5 lg:rounded-none lg:border-0 lg:border-t lg:dark:border-white/10 lg:bg-transparent lg:dark:bg-transparent lg:px-0 lg:pt-4 lg:pb-0">
      <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
        {icon}
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="data text-2xl md:text-3xl lg:text-[40px] font-bold lg:font-display lg:font-extrabold lg:tracking-[-0.04em] text-zinc-900 dark:text-white leading-none mt-2 lg:mt-3">{value}</p>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">{caption}</p>
    </div>
  );
}
