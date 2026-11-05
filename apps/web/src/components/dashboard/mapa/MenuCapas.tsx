"use client";

import { X } from "lucide-react";
import { GRUPOS_CAPAS, type CapaDelMenu, type IdCapa } from "@/lib/capas-mapa";

interface Props {
  visibles: IdCapa[];
  onAlternar: (id: IdCapa) => void;
  opacidad: number;
  onOpacidad: (v: number) => void;
  onCerrar: () => void;
}

/**
 * El menú de capas del Mapa (3.9.0, `lib/capas-mapa.ts`): en el teléfono, una hoja desde abajo;
 * en la compu, un panel al lado de la tarjeta de la ruta.
 */
export default function MenuCapas({ visibles, onAlternar, opacidad, onOpacidad, onCerrar }: Props) {
  const hayCarta = visibles.some((v) => v.startsWith("carta-"));
  return (
    <>
      <button type="button" aria-label="Cerrar las capas" onClick={onCerrar} className="lg:hidden absolute inset-0 z-20 bg-black/20" />
      <div
        role="dialog"
        aria-label="Capas del mapa"
        data-sin-tirar
        className="absolute z-30 inset-x-0 bottom-0 max-h-[78%] rounded-t-3xl pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:bottom-auto lg:top-4 lg:left-[calc(380px+2rem)] lg:w-[320px] lg:max-h-[calc(100%-2rem)] lg:rounded-3xl lg:pb-0 flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-black/10"
      >
        <div className="lg:hidden flex justify-center pt-2" aria-hidden="true">
          <span className="w-9 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 lg:pt-4 pb-2 shrink-0">
          <p className="text-base font-bold text-zinc-900 dark:text-white">Capas</p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 -mr-2 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar px-3 pb-4 space-y-4">
          {GRUPOS_CAPAS.map((g) => (
            <section key={g.titulo}>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{g.titulo}</p>
              <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] divide-y divide-zinc-200/70 dark:divide-white/5">
                {g.capas.map((c) => (
                  <Fila key={c.id} capa={c} prendida={visibles.includes(c.id)} onAlternar={() => onAlternar(c.id)} />
                ))}
              </div>
              {g.titulo === "Cartas del AIP" && hayCarta && (
                <label className="flex items-center gap-3 px-2 pt-3 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="shrink-0">Transparencia</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={opacidad}
                    onChange={(e) => onOpacidad(Number(e.target.value))}
                    className="flex-1 accent-aviation-blue"
                    aria-label="Cuánto se ve la carta"
                  />
                  <span className="w-9 text-right tabular-nums">{Math.round(opacidad * 100)}%</span>
                </label>
              )}
              {g.nota && <p className="px-2 pt-2 text-[11px] leading-snug text-zinc-500">{g.nota}</p>}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function Fila({ capa, prendida, onAlternar }: { capa: CapaDelMenu; prendida: boolean; onAlternar: () => void }) {
  const m = capa.muestra;
  return (
    <button type="button" role="switch" aria-checked={prendida} onClick={onAlternar} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
      <span
        aria-hidden="true"
        className={`shrink-0 ${m.punto ? "w-3 h-3 rounded-full mx-1.5 dark:ring-1 dark:ring-white/50" : "w-6 h-4 rounded-[5px]"}`}
        style={{ border: `1.5px ${m.punteada ? "dashed" : "solid"} ${m.borde}`, background: m.relleno ?? "transparent" }}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white leading-tight">{capa.nombre}</span>
        <span className="block text-[11px] text-zinc-500 leading-snug truncate">{capa.detalle}</span>
      </span>
      <span className={`shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${prendida ? "bg-aviation-blue" : "bg-zinc-300 dark:bg-white/15"}`}>
        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${prendida ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
