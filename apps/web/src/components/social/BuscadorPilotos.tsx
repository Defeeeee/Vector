"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import FilaPiloto from "./FilaPiloto";
import BotonSeguir from "./BotonSeguir";
import { buscarPilotos } from "@/actions/social";
import type { PilotoResumen } from "@/types";

/**
 * Buscar pilotos por @ o por nombre.
 *
 * Con espera de 300 ms entre teclas y descartando las respuestas viejas: si "fe" tarda
 * más que "fed", la lista no puede terminar mostrando los resultados de "fe".
 */
export default function BuscadorPilotos({ tieneHandle }: { tieneHandle: boolean }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<PilotoResumen[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const ultimo = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    const id = ++ultimo.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarPilotos(texto);
      if (id !== ultimo.current) return;
      setResultados(r);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-8 space-y-4">
      <label className="relative block">
        <span className="sr-only">Buscar pilotos</span>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por @ o por nombre"
          autoComplete="off"
          className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 pl-11 pr-11 py-3.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
        />
        {buscando && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />}
      </label>

      {resultados !== null &&
        (resultados.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 px-1">
            Nadie con ese @ o ese nombre todavía.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/10">
            {resultados.map((p) => (
              <FilaPiloto
                key={p.handle}
                piloto={p}
                accion={
                  <BotonSeguir
                    handle={p.handle}
                    relacion={p.relacion}
                    visibilidad={p.visibilidad}
                    tieneHandle={tieneHandle}
                    compacto
                  />
                }
              />
            ))}
          </div>
        ))}
    </section>
  );
}
