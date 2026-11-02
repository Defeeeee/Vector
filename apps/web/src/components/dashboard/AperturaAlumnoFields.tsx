"use client";

import type { AperturaPPA } from "@/types";
import { horasDeAperturaPPA, revisarAperturaPPA } from "@/lib/apertura-alumno";

/**
 * Las horas de antes de un alumno piloto, con el desglose de RAAC 61.520(a)
 * (`lib/apertura-alumno.ts`, migración 028). Las comparten el alta y el Hangar.
 *
 * Son las preguntas que un alumno sabe contestar, con su instructor o su planilla de la
 * escuela al lado: cuántas horas con instructor, cuántas solo, y de esas, cuántas de noche y
 * de travesía. Cada una va a su requisito del tracker de la PPA.
 */

const INPUT =
  "w-full data bg-transparent border-b border-zinc-200 dark:border-white/10 py-1.5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function Numero({ label, nota, valor, onChange, entero }: { label: string; nota?: string; valor: number; onChange: (n: number) => void; entero?: boolean }) {
  return (
    <label className="space-y-1 min-w-0">
      <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</span>
      {nota && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{nota}</span>}
      <input
        type="number"
        min="0"
        step={entero ? "1" : "0.1"}
        inputMode={entero ? "numeric" : "decimal"}
        placeholder={entero ? "0" : "0.0"}
        value={valor || ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={INPUT}
      />
    </label>
  );
}

export default function AperturaAlumnoFields({ valor, onChange }: { valor: AperturaPPA; onChange: (a: AperturaPPA) => void }) {
  const set = (k: keyof AperturaPPA) => (v: number | boolean) => onChange({ ...valor, [k]: v });
  const error = revisarAperturaPPA(valor);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-zinc-900 dark:bg-white/5 px-4 py-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/50">Total de horas</span>
        <span className="data text-base font-bold text-white">{horasDeAperturaPPA(valor).toFixed(1)} hs</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <fieldset className="rounded-2xl border border-zinc-200 dark:border-white/10 px-4 pt-3 pb-4 space-y-3 min-w-0">
          <legend className="px-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">Con instructor</legend>
          <Numero label="Doble mando" valor={valor.doble_mando} onChange={set("doble_mando")} />
          <Numero label="De esas, de noche" valor={valor.instruccion_nocturna} onChange={set("instruccion_nocturna")} />
          <Numero label="Aterrizajes nocturnos" valor={valor.aterrizajes_nocturnos} onChange={set("aterrizajes_nocturnos")} entero />
        </fieldset>
        <fieldset className="rounded-2xl border border-zinc-200 dark:border-white/10 px-4 pt-3 pb-4 space-y-3 min-w-0">
          <legend className="px-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">Solo</legend>
          <Numero label="Vuelo solo, de día" valor={valor.solo} onChange={set("solo")} />
          <Numero label="De esas, de travesía" valor={valor.solo_travesia} onChange={set("solo_travesia")} />
          <label className="flex items-start gap-3 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={valor.travesia_larga}
              onChange={(e) => set("travesia_larga")(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-zinc-900 dark:accent-white"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-200">
              Ya hice la travesía de 150 NM, con aterrizajes en dos aeródromos
            </span>
          </label>
        </fieldset>
      </div>

      {error && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{error}</p>}
    </div>
  );
}
