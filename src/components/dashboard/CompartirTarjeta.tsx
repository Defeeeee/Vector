"use client";

import { useEffect, useState } from "react";
import { Share2, X, Download, Loader2 } from "lucide-react";
import { compartirImagen } from "@/components/dashboard/compartir-imagen";
import { MAX_TILES, TILES, TILES_POR_DEFECTO, serializeTiles, type TileId } from "@/lib/share-card";

/**
 * El panel para armar la tarjeta y compartirla.
 *
 * **Este componente no toca ni un vuelo.** Importa la lista de fichas y nada más:
 * los números los calcula `/api/share-card` en el servidor, a partir de la sesión.
 * Por lo tanto la UI de compartir no puede discrepar con la imagen que se comparte,
 * porque no sabe sumar.
 *
 * Y el preview **es literalmente la imagen final**: el mismo endpoint, los mismos
 * bytes. La alternativa —dibujar una vista previa en HTML— sería una segunda
 * implementación del mismo diseño sin nada que las mantenga sincronizadas, que es
 * el problema que este repo tuvo con el par página/modal de Nuevo Vuelo. Y acá
 * sería peor: no hay harness de tests de componentes que lo pueda atrapar.
 */

const DEBOUNCE_MS = 250;

export default function CompartirTarjeta() {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<TileId[]>(TILES_POR_DEFECTO);
  const [src, setSrc] = useState(() => url(TILES_POR_DEFECTO));
  const [cargando, setCargando] = useState(true);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cada toque vuelve a pedir ~200 KB de PNG y medio segundo de render. Sin esto,
  // elegir cuatro fichas dispara cuatro renders completos.
  useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true);
      setSrc(url(seleccion));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [seleccion]);

  function alternar(id: TileId) {
    setSeleccion((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TILES) return prev;
      // El orden en que las toca es el orden en que salen en la imagen.
      return [...prev, id];
    });
  }

  async function compartir() {
    setAviso(null);
    setCompartiendo(true);
    try {
      const res = await fetch(url(seleccion));
      if (!res.ok) throw new Error("No se pudo generar la tarjeta");
      await compartirImagen(await res.blob(), "vector.png");
    } catch (e: any) {
      setAviso(e?.message || "No se pudo generar la tarjeta");
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-bold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Compartir
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6">
          <div className="w-full sm:max-w-lg bg-white dark:bg-[#111111] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-zinc-200 dark:border-white/10 p-6 md:p-8 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Tu carrera, en una imagen</p>
                <h3 className="text-2xl font-display font-bold text-zinc-900 dark:text-white">
                  Compartir
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* El preview es la imagen final, no una maqueta. */}
            <div className="relative rounded-[2rem] overflow-hidden bg-[#111111] aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="Vista previa de la tarjeta"
                width={1080}
                height={1080}
                onLoad={() => setCargando(false)}
                onError={() => setCargando(false)}
                className={`w-full h-full transition-opacity duration-300 ${cargando ? "opacity-40" : "opacity-100"}`}
              />
              {cargando && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Qué mostrar</p>
                <span className="data text-xs text-zinc-400 dark:text-zinc-500">
                  {seleccion.length} de {MAX_TILES}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TILES.map((t) => {
                  const activa = seleccion.includes(t.id);
                  const lleno = !activa && seleccion.length >= MAX_TILES;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={lleno}
                      onClick={() => alternar(t.id)}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                        activa
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                          : lleno
                            ? "border border-zinc-200 dark:border-white/10 text-zinc-300 dark:text-zinc-700"
                            : "border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {/* La matrícula identifica a su dueño, y una tarjeta no se
                  des-comparte. Por eso ninguna ficha identificante viene puesta. */}
              <p className="text-xs text-zinc-400 dark:text-zinc-500 pt-1">
                "Más volada" muestra tu matrícula, que es pública y se puede vincular
                con el titular. Elegila sólo si querés que se vea.
              </p>
            </div>

            {aviso && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
                {aviso}
              </div>
            )}

            <button
              type="button"
              onClick={compartir}
              disabled={compartiendo}
              className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-aviation-blue text-white text-sm font-bold disabled:opacity-50"
            >
              {compartiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {compartiendo ? "Preparando…" : "Compartir"}
            </button>
            <p className="text-xs text-center text-zinc-400 dark:text-zinc-500 flex items-center justify-center gap-1.5">
              <Download className="w-3 h-3" />
              En computadora se descarga; en el teléfono se abre WhatsApp.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function url(ids: TileId[]): string {
  return `/api/share-card?tiles=${serializeTiles(ids)}`;
}
