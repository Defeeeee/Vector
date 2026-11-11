"use client";

import { useRef, useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import type { AerodromoCercano } from "@/lib/ruta-en-vuelo";
import type { PuntoResuelto } from "@/lib/resolucion-puntos";

/**
 * La hoja de "Directo a…" del modo vuelo (3.23.0). Sube desde abajo, tapa el mapa por completo
 * para leerse al sol y con turbulencia, y se cierra con "Cancelar" (o tocando el fondo).
 *
 * - Si viene de tocar un aeródromo en el mapa (`toque`), ese aeródromo va arriba con dos botones:
 *   "Directo a SADM" y "Agregar al final de la ruta". Ya no se suma en silencio.
 * - Lo que queda de la ruta, los aeródromos más cercanos a la posición (desviarse, una
 *   emergencia) y un campo para escribir cualquier código, que se resuelve con el mismo
 *   directorio que la ruta (`/api/puntos`).
 *
 * No arma la ruta: sólo avisa qué se eligió (`onDirecto`, `onAlFinal`).
 */

const ROTULO = "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";
const grados = (n: number) => String(Math.round(n) % 360 || 360).padStart(3, "0");

export interface PuntoRestante {
  codigo: string;
  label: string;
  /** Distancia desde donde estás, si se sabe. */
  distanciaNm: number | null;
}

export default function HojaDirectoA(p: {
  /** El aeródromo (o radioayuda) que se tocó en el mapa, si la hoja se abrió así. */
  toque: { codigo: string; nombre: string } | null;
  restantes: PuntoRestante[];
  cercanos: AerodromoCercano[];
  /** Hay posición de GPS: sin ella no hay "más cercanos" ni de dónde salir. */
  hayPosicion: boolean;
  onDirecto: (codigo: string) => void;
  onAlFinal: (codigo: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const buscar = async () => {
    const q = texto.trim().toUpperCase().replace(/\s+/g, "");
    if (!q || buscando) return;
    setBuscando(true);
    setError(null);
    try {
      const r = await fetch(`/api/puntos?${new URLSearchParams({ q })}`);
      const d = (await r.json().catch(() => null)) as { punto?: PuntoResuelto | null } | null;
      if (!r.ok || !d?.punto || !Number.isFinite(d.punto.lat)) setError(`No encontré "${q}". Probá con el OACI, una radioayuda o un punto.`);
      else if (d.punto.clase === "aerovia") setError("Una aerovía no es un punto: escribí uno de sus puntos.");
      else p.onDirecto(q);
    } catch {
      setError("No pude buscarlo (¿sin señal?). Elegí uno de la lista.");
    } finally {
      setBuscando(false);
    }
  };

  const fila = "w-full min-h-[52px] px-4 py-2 flex items-center gap-3 text-left active:bg-white/10";

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Directo a">
      <button aria-label="Cancelar" tabIndex={-1} onClick={p.onCancelar} className="flex-1 min-h-8 bg-black/60 cursor-default" />
      <div className="max-h-[85%] w-full lg:max-w-xl lg:mx-auto flex flex-col bg-noche border-t lg:border-x border-aviation-cyan/60 shadow-2xl shadow-black animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <p className={`${ROTULO} flex items-center gap-1.5 text-aviation-cyan`}>
            <Navigation className="w-3.5 h-3.5" /> Directo a…
          </p>
          <button onClick={p.onCancelar} className="h-11 -mr-2 px-4 rounded-full text-sm font-semibold text-zinc-200 border border-white/15">
            Cancelar
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {p.toque && (
            <div className="px-4 pb-4 pt-1 border-b border-white/10 space-y-2.5">
              <p className={ROTULO}>Tocaste en el mapa</p>
              <p className="leading-tight">
                <span className="font-display text-3xl font-bold tracking-tight text-white">{p.toque.codigo}</span>{" "}
                <span className="text-sm text-zinc-400">{p.toque.nombre}</span>
              </p>
              <button
                onClick={() => p.onDirecto(p.toque!.codigo)}
                className="w-full h-14 rounded-full bg-aviation-cyan text-noche text-base font-bold inline-flex items-center justify-center gap-2"
              >
                <Navigation className="w-5 h-5" /> Directo a {p.toque.codigo}
              </button>
              <button
                onClick={() => p.onAlFinal(p.toque!.codigo)}
                className="w-full h-12 rounded-full border border-white/20 text-sm font-semibold text-zinc-100"
              >
                Agregar al final de la ruta
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void buscar();
            }}
            className="px-4 py-3 border-b border-white/10"
          >
            <label htmlFor="directo-codigo" className={`${ROTULO} block mb-1.5`}>
              Otro código
            </label>
            <div className="flex gap-2">
              <input
                id="directo-codigo"
                ref={entrada}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="SADM, BAR, UGIMI, BENAVIDEZ"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className="flex-1 min-w-0 h-12 rounded-xl bg-white/5 border border-white/15 px-3 text-base font-semibold tracking-wide text-white placeholder:text-zinc-600 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-aviation-cyan"
              />
              <button
                type="submit"
                disabled={!texto.trim() || buscando}
                className="shrink-0 h-12 px-5 rounded-full bg-aviation-cyan text-noche text-sm font-bold disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Directo
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
          </form>

          {p.restantes.length > 0 && (
            <section>
              <p className={`${ROTULO} px-4 pt-3 pb-1`}>Lo que queda de la ruta</p>
              <ul className="divide-y divide-white/10">
                {p.restantes.map((x, i) => (
                  <li key={`${x.codigo}-${i}`}>
                    <button onClick={() => p.onDirecto(x.codigo)} className={fila}>
                      <span className="w-6 font-mono text-[11px] text-zinc-500">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-lg font-bold text-white">{x.codigo}</span>{" "}
                        <span className="text-sm text-zinc-500 truncate">{x.label !== x.codigo ? x.label : ""}</span>
                      </span>
                      {x.distanciaNm !== null && <span className="font-mono text-sm tabular-nums text-zinc-300">{x.distanciaNm.toFixed(1)} NM</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <p className={`${ROTULO} px-4 pt-3 pb-1`}>Aeródromos más cercanos</p>
            {!p.hayPosicion ? (
              <p className="px-4 pb-3 text-sm text-zinc-400">Hace falta la posición del GPS.</p>
            ) : p.cercanos.length === 0 ? (
              <p className="px-4 pb-3 text-sm text-zinc-400">Cargando los aeródromos del mapa…</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {p.cercanos.map((a) => (
                  <li key={a.codigo}>
                    <button onClick={() => p.onDirecto(a.codigo)} className={fila}>
                      <span className="flex-1 min-w-0">
                        <span className="text-lg font-bold text-white">{a.codigo}</span>{" "}
                        <span className="text-sm text-zinc-500">{a.nombre}</span>
                      </span>
                      <span className="text-right font-mono tabular-nums">
                        <span className="block text-sm font-semibold text-aviation-cyan">{a.distanciaNm.toFixed(1)} NM</span>
                        <span className="block text-xs text-zinc-300">
                          {grados(a.rumbo)}°{a.magnetico ? "M" : "V"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
