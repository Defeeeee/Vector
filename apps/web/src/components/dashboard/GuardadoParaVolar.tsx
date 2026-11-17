"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { leerGuardado, pedirGuardado, type Guardado } from "@/lib/sin-senal-cliente";
import { resumenGuardado } from "@/lib/sin-senal";

/**
 * "Guardado para volar sin señal: la app, 7 pantallas y 741 aeródromos (versión 3.44.0)" y el botón
 * "Actualizar ahora" (Hangar, 3.44.0). Lo que dice sale de lo que el service worker anotó al
 * guardarlo, leído del Cache API: si no hay nada, dice que no hay nada, no que "está todo".
 */
export default function GuardadoParaVolar({ usuarioId }: { usuarioId: string | null }) {
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const leer = useCallback(async () => setGuardado(await leerGuardado()), []);
  useEffect(() => {
    void leer();
  }, [leer]);

  async function actualizar() {
    setOcupado(true);
    setAviso(null);
    const r = await pedirGuardado({ usuario: usuarioId, forzar: true });
    await leer();
    setOcupado(false);
    setAviso(
      !r
        ? "No se pudo: este navegador no tiene el guardado para volar (o no contestó). Probá con la app instalada."
        : r.error
          ? "No se pudo guardar. Probá de nuevo con mejor señal."
          : "Listo: lo guardado está al día."
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm leading-relaxed">
        {guardado ? resumenGuardado(guardado.app, guardado.pantallas) : "Leyendo lo guardado…"} Se guarda solo al abrir Vector con buena
        conexión. Sin señal, las pantallas que ves son la última copia, con su hora arriba.
      </p>
      <button
        type="button"
        onClick={actualizar}
        disabled={ocupado || !usuarioId}
        className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-60"
      >
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
        <span>{ocupado ? "Guardando…" : "Actualizar ahora"}</span>
      </button>
      {aviso && (
        <p role="status" className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
          {aviso}
        </p>
      )}
    </div>
  );
}
