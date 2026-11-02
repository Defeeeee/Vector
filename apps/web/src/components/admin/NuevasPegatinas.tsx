"use client";

import { useState, useTransition } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { crearPegatinas } from "@/actions/pegatinas";

const tarjeta = "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8";
const boton = "inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full";

/**
 * Crear un lote de pegatinas e imprimirlo. La hoja se abre con un link y no sola: Safari
 * bloquea una pestaña que se abre después de esperar al servidor.
 */
export default function NuevasPegatinas({ sinAsignar }: { sinAsignar: number }) {
  const [cantidad, setCantidad] = useState(10);
  const [lote, setLote] = useState("");
  const [creadas, setCreadas] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const crear = () =>
    empezar(async () => {
      setError(null);
      const r = await crearPegatinas(cantidad, lote);
      if (r.error) setError(r.error);
      else setCreadas(r.codigos ?? []);
    });

  return (
    <section className={tarjeta}>
      <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">Imprimir pegatinas nuevas</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
        Para mandar a hacer: un PNG por pegatina, a 600 dpi y con el fondo transparente. En la imprenta, sticker de 8 cm y &ldquo;sin fondo&rdquo;. También sale una hoja A4 de diez para imprimir en casa.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="block text-xs font-semibold text-zinc-500">Cuántas</span>
          <select
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-black px-3 text-sm"
          >
            {[10, 20, 30, 40, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 flex-1 min-w-48">
          <span className="block text-xs font-semibold text-zinc-500">Nombre del lote (opcional)</span>
          <input
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            maxLength={40}
            placeholder="Aeroclubes de zona norte"
            className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-black px-3 text-sm"
          />
        </label>
        <button type="button" onClick={crear} disabled={pendiente} className={`${boton} bg-aviation-blue text-white hover:bg-aviation-blue-dark disabled:opacity-60`}>
          {pendiente ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Crear {cantidad}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {creadas && (
        <div className="mt-5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center gap-3">
          <span>Listas {creadas.length}: {creadas.join(", ")}.</span>
          <a href={`/api/admin/pegatinas/archivos?codigos=${creadas.join(",")}`} className={`${boton} bg-emerald-600 text-white`}>
            <Download className="w-4 h-4" /> Bajar los PNG (ZIP)
          </a>
          <a href={`/api/admin/pegatinas/hoja?codigos=${creadas.join(",")}`} target="_blank" rel="noopener" className={`${boton} border border-emerald-600/40`}>
            <Printer className="w-4 h-4" /> Hoja A4 para imprimir
          </a>
        </div>
      )}
      {sinAsignar > 0 && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Las {sinAsignar} sin asignar:{" "}
          <a href="/api/admin/pegatinas/archivos?sin_asignar=1" className="font-semibold text-aviation-blue hover:underline">bajar los PNG</a> o{" "}
          <a href="/api/admin/pegatinas/hoja?sin_asignar=1" target="_blank" rel="noopener" className="font-semibold text-aviation-blue hover:underline">la hoja A4</a>.
        </p>
      )}
    </section>
  );
}
