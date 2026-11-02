"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import type { AperturaPPA, Logbook } from "@/types";
import { createLogbook, updateLogbook } from "@/actions/logbook";
import { APERTURA_PPA_VACIA, aperturaDelAlumno, revisarAperturaPPA } from "@/lib/apertura-alumno";
import AperturaAlumnoFields from "./AperturaAlumnoFields";

/**
 * Las horas de antes del alumno, en el Hangar: las mismas del alta, para corregirlas. El
 * alumno no ve los libros (`lib/licencias.ts`), así que se guardan en el suyo por defecto, o
 * en uno nuevo si todavía no tiene.
 */
export default function HorasDeAntesAlumno({ logbooks }: { logbooks: Logbook[] }) {
  const libro = logbooks.find((l) => l.is_default) ?? logbooks[0] ?? null;
  const [valor, setValor] = useState<AperturaPPA>(() => (libro ? aperturaDelAlumno([libro]) : APERTURA_PPA_VACIA));
  const [estado, setEstado] = useState<{ ok?: boolean; error?: string }>({});
  const [pendiente, startTransition] = useTransition();

  const guardar = () => {
    const malo = revisarAperturaPPA(valor);
    if (malo) return setEstado({ error: malo });
    startTransition(async () => {
      const r = libro
        ? await updateLogbook(libro.id, { apertura_ppa: valor })
        : await createLogbook({ name: "Mi libro", apertura_ppa: valor });
      setEstado("error" in r && r.error ? { error: String(r.error) } : { ok: true });
    });
  };

  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 md:p-6 space-y-5">
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Lo que volaste antes de usar Vector. Se suma a tus vuelos en el camino a la PPA, cada parte en su requisito.
      </p>
      <AperturaAlumnoFields valor={valor} onChange={(a) => (setValor(a), setEstado({}))} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-50"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
        </button>
        {estado.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" /> Guardado
          </span>
        )}
        {estado.error && <span className="text-sm font-semibold text-red-600 dark:text-red-400">{estado.error}</span>}
      </div>
    </div>
  );
}
