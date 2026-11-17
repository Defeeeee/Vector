"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CloudOff } from "lucide-react";
import { quitar, rechazados, pendientes, reintentable } from "@/lib/cola-sin-senal";
import { EVENTO_ENVIAR_COLA, guardarCola, leerColaLocal, useColaSinSenal } from "@/lib/cola-sin-senal-cliente";

/** Dónde se muestra: donde se mira el libro (el inicio y la Bitácora). */
const PANTALLAS = ["/dashboard", "/dashboard/history"];

/**
 * "1 vuelo guardado en el teléfono, sin cargar todavía" (2026-11-17).
 *
 * Los vuelos que se registraron sin señal esperan en el teléfono (`lib/cola-sin-senal.ts`) y se
 * mandan solos. Hasta que lleguen **no están en la bitácora**: este aviso lo dice, para que el
 * piloto no los dé por cargados (ni por perdidos). Una banda de borde a borde, sin caja. Con
 * "Cargar ahora" prueba ya; "Descartar" los borra del teléfono, con confirmación.
 */
export default function AvisoColaSinSenal() {
  const cola = useColaSinSenal();
  const ruta = usePathname();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (!PANTALLAS.includes(ruta) || cola.length === 0) return null;
  const esperando = pendientes(cola);
  const conError = rechazados(cola);

  const cargarAhora = () => window.dispatchEvent(new Event(EVENTO_ENVIAR_COLA));
  const descartar = (id: string) => {
    guardarCola(quitar(leerColaLocal(), id));
    setConfirmando(null);
  };

  return (
    <section aria-label="Vuelos guardados en el teléfono" className="mb-6 border-y border-amber-500/30 bg-amber-500/[0.06] -mx-4 md:-mx-8 lg:mx-0 px-4 md:px-8 lg:px-0 py-3 space-y-3">
      {esperando > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <CloudOff className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="flex-1 min-w-[14rem] text-[13.5px] font-semibold text-white">
            {esperando === 1 ? "1 vuelo guardado en el teléfono, sin cargar todavía" : `${esperando} vuelos guardados en el teléfono, sin cargar todavía`}
            <span className="block text-xs font-normal text-zinc-400">Se cargan solos cuando vuelva la señal. Hasta entonces no figuran en tu bitácora.</span>
          </p>
          <button type="button" onClick={cargarAhora} className="text-xs font-bold text-aviation-cyan hover:underline">
            Cargar ahora
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {cola.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="data text-zinc-300">{e.resumen || "Vuelo sin resumen"}</span>
            {e.error && <span className="text-amber-400">No se pudo cargar: {e.error}</span>}
            <span className="ml-auto flex items-center gap-3">
              {e.error && (
                <button type="button" onClick={() => { guardarCola(reintentable(leerColaLocal(), e.id)); cargarAhora(); }} className="font-bold text-aviation-cyan hover:underline">
                  Reintentar
                </button>
              )}
              {confirmando === e.id ? (
                <>
                  <span className="text-zinc-400">¿Descartarlo? No se puede deshacer.</span>
                  <button type="button" onClick={() => descartar(e.id)} className="font-bold text-red-400 hover:underline">Sí, descartar</button>
                  <button type="button" onClick={() => setConfirmando(null)} className="font-bold text-zinc-400 hover:underline">No</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmando(e.id)} className="font-bold text-zinc-400 hover:text-red-400 hover:underline">
                  Descartar
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {conError > 0 && esperando === 0 && <p className="text-xs text-zinc-500">Los que no se pudieron cargar quedan acá hasta que los reintentes o los descartes.</p>}
    </section>
  );
}
