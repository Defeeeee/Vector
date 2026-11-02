"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { OpeningBalanceInput } from "@/actions/logbook";

/**
 * Las horas que el piloto trae de su libro de papel, compartidas entre el alta y el Hangar.
 *
 * **Se cargan como se leen en la hoja.** La fila "Totales a la página siguiente" del libro
 * (Adjunto A de la Res. ANAC 147/2013, `docs/normativa/libro-de-vuelo-anac.md`) trae
 * "Tiempos de vuelo" sobre aeródromo y de travesía, de día y de noche, como piloto y como
 * copiloto: las mismas ocho columnas que guarda Vector (`opening_*`, y `valoresDeApertura`
 * en `lib/libro-anac.ts`). Antes era una lista de 11 siglas ("PIC Día Local", "SIC Noche
 * Travesía") y nadie la usó: el 2026-10-20, 0 de 7 libros tenían horas de apertura. Ahora
 * se copia casillero por casillero, con los nombres del papel.
 *
 * La discriminación (instrumentos y capota) va aparte y no suma al total: ya está adentro de
 * los tiempos de vuelo, como dice la nota del punto 5.
 */

type Clave = keyof OpeningBalanceInput;

/** Las ocho columnas de "Tiempos de vuelo", en el orden de la hoja. */
const BLOQUES: { titulo: string; filas: { momento: string; piloto: Clave; copiloto: Clave }[] }[] = [
  {
    titulo: "Sobre aeródromo",
    filas: [
      { momento: "Día", piloto: "pic_day_loc", copiloto: "sic_day_loc" },
      { momento: "Noche", piloto: "pic_night_loc", copiloto: "sic_night_loc" },
    ],
  },
  {
    titulo: "Travesía",
    filas: [
      { momento: "Día", piloto: "pic_day_tra", copiloto: "sic_day_tra" },
      { momento: "Noche", piloto: "pic_night_tra", copiloto: "sic_night_tra" },
    ],
  },
];

const DISCRIMINACION: { key: Clave; label: string }[] = [
  { key: "imc_pil", label: "Instrumentos piloto" },
  { key: "imc_cop", label: "Instrumentos copiloto" },
  { key: "capota", label: "Capota" },
];

/** Sólo los tiempos de vuelo: instrumentos y capota ya están adentro, no se suman. */
export const TOTAL_KEYS: Clave[] = BLOQUES.flatMap((b) => b.filas.flatMap((f) => [f.piloto, f.copiloto]));

export function openingTotal(opening: OpeningBalanceInput): number {
  return TOTAL_KEYS.reduce((acc, k) => acc + (Number(opening[k]) || 0), 0);
}

const INPUT_CLASS =
  "w-full data bg-transparent border-b border-zinc-200 dark:border-white/10 py-1.5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const LABEL = "block font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

function Numero({
  label,
  valor,
  onChange,
  entero,
}: {
  label: string;
  valor: number | undefined;
  onChange: (raw: string) => void;
  entero?: boolean;
}) {
  return (
    <label className="space-y-1 min-w-0">
      <span className={LABEL}>{label}</span>
      <input
        type="number"
        min="0"
        step={entero ? "1" : "0.1"}
        inputMode={entero ? "numeric" : "decimal"}
        placeholder={entero ? "0" : "0.0"}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  );
}

export default function OpeningBalanceFields({
  opening,
  setField,
  descripcion,
  compacto = false,
}: {
  opening: OpeningBalanceInput;
  setField: (key: Clave, raw: string) => void;
  descripcion?: string;
  /** En el alta: instrumentos y capota plegados, para que lo primero sean las ocho horas. */
  compacto?: boolean;
}) {
  const total = openingTotal(opening);
  const conDiscriminacion = DISCRIMINACION.some((d) => Number(opening[d.key]) > 0);
  const [verDiscriminacion, setVerDiscriminacion] = useState(!compacto || conDiscriminacion);

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {descripcion ??
          "Copiá la fila \"Totales a la página siguiente\" de la última hoja de tu libro, casillero por casillero. Así el desglose ANAC y el seguimiento de licencia siguen siendo correctos sin cargar vuelo por vuelo."}
      </p>

      <div className="flex items-center justify-between rounded-2xl bg-zinc-900 dark:bg-white/5 px-4 py-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/50">Total de horas</span>
        <span className="data text-base font-bold text-white">{total.toFixed(1)} hs</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BLOQUES.map((b) => (
          <fieldset key={b.titulo} className="rounded-2xl border border-zinc-200 dark:border-white/10 px-4 pt-3 pb-4 space-y-3 min-w-0">
            <legend className="px-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-200">{b.titulo}</legend>
            {b.filas.map((f) => (
              <div key={f.momento} className="grid grid-cols-[3.25rem_1fr_1fr] items-end gap-3">
                <span className="pb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{f.momento}</span>
                <Numero label="Piloto" valor={opening[f.piloto]} onChange={(v) => setField(f.piloto, v)} />
                <Numero label="Copiloto" valor={opening[f.copiloto]} onChange={(v) => setField(f.copiloto, v)} />
              </div>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Numero label="Aterrizajes" valor={opening.landings} onChange={(v) => setField("landings", v)} entero />
      </div>

      {verDiscriminacion ? (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Discriminación: no suma al total, ya está adentro de los tiempos de vuelo.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DISCRIMINACION.map((d) => (
              <Numero key={d.key} label={d.label} valor={opening[d.key]} onChange={(v) => setField(d.key, v)} />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setVerDiscriminacion(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <ChevronDown className="w-3.5 h-3.5" /> Instrumentos y capota
        </button>
      )}
    </div>
  );
}
