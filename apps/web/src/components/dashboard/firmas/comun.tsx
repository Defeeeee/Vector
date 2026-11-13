import type { ReactNode } from "react";
import { AUTORIDADES_CAD } from "@/lib/cad";

/** Las piezas que comparten las partes de «Firmas del libro». */

export const campo =
  "w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 min-h-12 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-aviation-cyan/20 focus:border-zinc-900 dark:focus:border-aviation-cyan/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600";
export const rotulo = "text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1";
export const principal =
  "inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-aviation-cyan text-noche font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity";
export const secundario =
  "inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-aviation-cyan/40 text-aviation-cyan text-sm font-semibold disabled:opacity-40";
export const enlace = "min-h-11 text-sm font-semibold text-aviation-cyan text-left";
export const peligro = "min-h-11 px-3 text-sm font-semibold text-red-500 disabled:opacity-40";
export const unaFila = "divide-y divide-white/10 border-y border-white/10";
export const ayuda = "text-xs text-zinc-500 dark:text-zinc-400";
export const subtitulo = "font-mono text-[11px] uppercase tracking-[0.14em] text-aviation-cyan";

/** Una imagen sobre fondo claro, para que la tinta se vea en el tema oscuro. */
export function Miniatura({ png, alto = "h-12" }: { png: string; alto?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={png} alt="" className={`${alto} w-auto max-w-[9rem] object-contain rounded-lg bg-zinc-100 p-1`} />
  );
}

/** El encabezado de cada parte de la pantalla, con su ancla. */
export function Parte({ id, titulo, children, explicacion }: { id: string; titulo: string; explicacion: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="space-y-6 border-t border-white/10 pt-8 scroll-mt-24">
      <div className="space-y-1.5 max-w-3xl">
        <h3 className="text-xl md:text-2xl lg:text-[30px] font-bold lg:font-extrabold font-display tracking-tight lg:tracking-[-0.03em] text-zinc-900 dark:text-white">{titulo}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{explicacion}</p>
      </div>
      {children}
    </section>
  );
}

/** El selector del cargo del CAD (`AUTORIDADES_CAD`). */
export function SelectorCargo({ id, valor, alCambiar, vacio }: { id: string; valor: string; alCambiar: (v: string) => void; vacio: string }) {
  return (
    <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className={campo}>
      <option value="">{vacio}</option>
      {AUTORIDADES_CAD.map((a) => (
        <option key={a.id} value={a.id}>{a.nombre}</option>
      ))}
    </select>
  );
}

export const nombreDeCargo = (id: number | null | undefined) => (id ? AUTORIDADES_CAD.find((a) => a.id === id)?.nombre ?? null : null);

export const cuenta = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
