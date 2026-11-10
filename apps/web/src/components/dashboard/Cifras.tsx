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
      <span className="font-display text-[60px] md:text-8xl lg:text-[112px] font-bold lg:font-extrabold tracking-[-0.05em] lg:tracking-[-0.055em] tabular-nums text-white leading-none">
        {whole}
      </span>
      <span className="font-display text-[60px] md:text-8xl lg:text-[112px] font-bold lg:font-extrabold tracking-[-0.05em] lg:tracking-[-0.055em] tabular-nums text-aviation-cyan leading-none">
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
    <div className="border-t border-white/10 pt-3 lg:pt-4 min-w-0">
      <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
        {icon}
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-display text-[28px] md:text-3xl lg:text-[40px] font-bold lg:font-extrabold tracking-[-0.03em] lg:tracking-[-0.04em] text-white leading-none mt-2 lg:mt-3 tabular-nums">{value}</p>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">{caption}</p>
    </div>
  );
}
