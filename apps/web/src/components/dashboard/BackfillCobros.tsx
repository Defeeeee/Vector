"use client";

import { useState, useTransition } from "react";
import { History, Loader2 } from "lucide-react";
import { aplicarBackfillCobros } from "@/actions/balance";
import { pesos } from "@/lib/costos";

/**
 * Incorporar los cobros de los vuelos que quedaron sin registrar.
 *
 * `_sync_flight_transaction` cobra al crear o editar un vuelo. Los vuelos cargados
 * **antes** de pasar a modo saldo nunca generaron transacción, así que la bitácora
 * no puede decir cuánto salió cada uno: en la base de Federico, 39 de 41.
 *
 * **El saldo no se mueve, y la tarjeta lo dice en letras.** Es la primera pregunta
 * que se hace cualquiera al ver un botón que escribe cobros retroactivos, y si la
 * respuesta no está a la vista el botón no se toca. Junto con los cobros se graba
 * una transacción de ajuste por la suma exacta: los cobros son el registro del
 * costo de cada vuelo, no plata nueva saliendo de la cuenta.
 */
export default function BackfillCobros({ vuelos, total }: { vuelos: number; total: number }) {
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sin vuelos por incorporar no hay nada que ofrecer. Tampoco se dibuja después de
  // aplicarlo: `revalidatePath` vuelve a pedir los datos y el conteo llega en cero.
  if (vuelos === 0 && !resultado) return null;

  const aplicar = () => {
    setError(null);
    startTransition(async () => {
      const r = await aplicarBackfillCobros();
      if (!("success" in r)) {
        setError(r.error);
        return;
      }
      setResultado(
        `Listo: ${r.vuelos} ${r.vuelos === 1 ? "vuelo" : "vuelos"} con su costo. Tu saldo quedó igual.`
      );
    });
  };

  return (
    <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center shrink-0">
          <History className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow">Cobros que faltan</p>
          {resultado ? (
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{resultado}</p>
          ) : (
            <>
              <p className="text-sm md:text-base font-bold text-zinc-900 dark:text-white leading-snug mt-0.5">
                <span className="data">{vuelos}</span>{" "}
                {vuelos === 1 ? "vuelo tuyo no tiene" : "vuelos tuyos no tienen"} su costo
                registrado, por <span className="data">{pesos(total)}</span>.
              </p>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-1.5">
                Son vuelos que cargaste antes de usar el modo saldo. Incorporarlos hace
                que la bitácora pueda mostrar cuánto salió cada uno.{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  Tu saldo no cambia:
                </strong>{" "}
                junto con los cobros se graba un ajuste por la misma cifra, porque esto
                es el registro de un gasto que ya ocurrió y no plata saliendo ahora.
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
                El costo se reconstruye con el precio actual de cada aeronave — de esos
                vuelos no existe el precio histórico, porque nunca se registró.
              </p>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}

      {!resultado && (
        <button
          type="button"
          onClick={aplicar}
          disabled={pendiente}
          className="w-full sm:w-auto px-6 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-opacity"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />}
          {pendiente ? "Incorporando…" : "Incorporar los cobros"}
        </button>
      )}
    </div>
  );
}
