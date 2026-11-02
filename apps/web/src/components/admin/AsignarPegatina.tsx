"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { asignarPegatina } from "@/actions/pegatinas";

/** Dónde quedó pegada. Es lo que ve el admin al escanear una pegatina sin asignar. */
export default function AsignarPegatina({ codigo, etiqueta }: { codigo: string; etiqueta: string | null }) {
  const [valor, setValor] = useState(etiqueta ?? "");
  const [guardada, setGuardada] = useState(etiqueta);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    empezar(async () => {
      setError(null);
      const r = await asignarPegatina(codigo, valor);
      if (r.error) setError(r.error);
      else setGuardada(valor.trim() || null);
    });
  };

  return (
    <form onSubmit={guardar} className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-4">
      <div>
        <h3 className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
          {guardada ? "Dónde está pegada" : "¿Dónde la pegaste?"}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {guardada ? "Cambiala si la moviste." : "Así sabés cuántos llegan desde cada lugar."}
        </p>
      </div>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        maxLength={80}
        autoFocus={!guardada}
        placeholder="Cartelera del aeroclub de San Fernando"
        className="w-full h-12 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-black px-4 text-base"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendiente || (valor.trim() || null) === guardada}
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full bg-aviation-blue text-white hover:bg-aviation-blue-dark disabled:opacity-50"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
        </button>
        {!pendiente && guardada && (valor.trim() || null) === guardada && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <Check className="w-4 h-4" /> Guardado
          </span>
        )}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}
