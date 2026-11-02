"use client";

import { Fragment, useState } from "react";
import { ArrowRight, Loader2, Plus, Type, X } from "lucide-react";
import { nodosDeEntrada, rutaDesdeNodos, type AerodromoForm, type NodoRuta } from "@/lib/formulario-plan";
import { buscarPunto, distanciaTramo, type NodoResuelto } from "./useRutaResuelta";

/**
 * La ruta de la casilla 15 como nodos: salida → puntos → destino. Los DCT son las flechas;
 * una aerovía va sobre la flecha entre su entrada y su salida; cada flecha dice las millas
 * si los dos extremos están ubicados.
 *
 * Los puntos que el directorio no conoce también son nodos, punteados y "sin ubicar": van
 * igual en el plan —la oficina los lee—, pero no suman a la duración sugerida.
 *
 * El texto de la casilla sigue siendo la fuente: los nodos se leen de ahí y se escriben ahí
 * (`rutaDesdeNodos`). Para lo que los nodos no cubren —un cambio de nivel, `ATE/N0090A020`—
 * está "Escribir como texto".
 */

interface Props {
  ruta: string;
  salida: AerodromoForm | null;
  destino: AerodromoForm | null;
  nodos: NodoResuelto[];
  cache: Map<string, unknown>;
  estado?: string;
  onCambio: (ruta: string) => void;
}

/** Un nodo dibujado: los extremos o un punto del medio (las aerovías van en las flechas). */
type Dibujo =
  | { clase: "extremo"; texto: string; etiqueta: string; lat?: number; lon?: number }
  | { clase: "medio"; nodo: NodoResuelto; indice: number };

function Flecha({ etiqueta, nm }: { etiqueta: string; nm: number | null }) {
  return (
    <span className="flex flex-col items-center justify-center px-1 min-w-[44px]">
      <span className="data text-[9px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 leading-none whitespace-nowrap">
        {etiqueta}
        {nm !== null && nm >= 0.5 && <span className="font-medium normal-case"> · {Math.round(nm)} NM</span>}
      </span>
      <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
    </span>
  );
}

export default function EditorRuta({ ruta, salida, destino, nodos, cache, estado, onCambio }: Props) {
  const [entrada, setEntrada] = useState("");
  const [texto, setTexto] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const base: NodoRuta[] = nodos.map(({ texto: t, tipo, token, geografico }) => ({ texto: t, tipo, token, geografico }));
  const escribir = (nuevos: NodoRuta[]) => onCambio(rutaDesdeNodos(nuevos));

  const agregar = async () => {
    const t = entrada.trim();
    if (!t) return;
    setAgregando(true);
    // "ATE BAR" son dos puntos si existen los dos; "PUNTA LARA" es un lugar.
    let todas = false;
    if (/\s/.test(t) && !/(^|\s)DCT(\s|$)/i.test(t)) {
      const partes = t.toUpperCase().split(/\s+/);
      const encontrados = await Promise.all(
        partes.map((p) => buscarPunto(cache as Map<string, never>, nodosDeEntrada(p)[0]?.token ?? p))
      );
      todas = encontrados.every(Boolean);
    }
    escribir([...base, ...nodosDeEntrada(t, todas)]);
    setEntrada("");
    setAgregando(false);
  };

  // Los nodos que se dibujan como cajas, con la aerovía que los une si la hay.
  const dibujos: Dibujo[] = [
    { clase: "extremo", texto: salida?.codigo ?? "????", etiqueta: "Salida", lat: salida?.lat, lon: salida?.lon },
    ...nodos.flatMap((n, i): Dibujo[] => (n.tipo === "aerovia" ? [] : [{ clase: "medio", nodo: n, indice: i }])),
    { clase: "extremo", texto: destino?.codigo ?? "????", etiqueta: "Destino", lat: destino?.lat, lon: destino?.lon },
  ];
  const coordenadas = (d: Dibujo) =>
    d.clase === "extremo" ? { lat: d.lat, lon: d.lon } : d.nodo.estado === "ubicado" ? { lat: d.nodo.lat, lon: d.nodo.lon } : null;
  const aeroviaEntre = (a: Dibujo, b: Dibujo): NodoResuelto | null => {
    const desde = a.clase === "medio" ? a.indice + 1 : 0;
    const hasta = b.clase === "medio" ? b.indice : nodos.length;
    return nodos.slice(desde, hasta).find((n) => n.tipo === "aerovia") ?? null;
  };

  const borde = estado === "error" || estado === "falta" ? "border-red-300 dark:border-red-500/40" : "border-zinc-200 dark:border-white/10";

  return (
    <div className={`rounded-2xl border ${borde} bg-white dark:bg-white/[0.02] px-3.5 pt-2 pb-3 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          <span className="data font-bold text-zinc-400 dark:text-zinc-500 mr-1">15</span>Ruta
        </span>
        <button
          type="button"
          onClick={() => setTexto((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <Type className="w-3 h-3" /> {texto ? "Ver como nodos" : "Escribir como texto"}
        </button>
      </div>

      {texto ? (
        <input
          value={ruta}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="DCT ATE DCT"
          className="w-full bg-transparent py-1 text-sm font-bold data text-zinc-900 dark:text-white outline-none uppercase placeholder:normal-case placeholder:text-zinc-300"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-y-2">
          {dibujos.map((d, i) => {
            const flecha =
              i > 0 ? (
                <Flecha
                  etiqueta={aeroviaEntre(dibujos[i - 1], d)?.texto ?? "DCT"}
                  nm={distanciaTramo(coordenadas(dibujos[i - 1]), coordenadas(d), aeroviaEntre(dibujos[i - 1], d))}
                />
              ) : null;
            return (
              <Fragment key={d.clase === "medio" ? `n${d.indice}` : d.etiqueta}>
                {flecha}
                {d.clase === "extremo" ? (
                  <span className="inline-flex flex-col items-start rounded-xl bg-zinc-900 dark:bg-white px-3 py-1.5">
                    <span className="data text-sm font-bold text-white dark:text-zinc-900 leading-tight">{d.texto}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{d.etiqueta}</span>
                  </span>
                ) : (
                  <span
                    title={d.nodo.estado === "sin-ubicar" ? "No lo encontramos en el directorio: va igual en el plan, pero no suma a la duración." : d.nodo.etiqueta}
                    className={`group inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                      d.nodo.estado === "sin-ubicar"
                        ? "border-dashed border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/[0.06]"
                        : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03]"
                    }`}
                  >
                    <span className="flex flex-col items-start">
                      <span className="data text-sm font-bold text-zinc-900 dark:text-white leading-tight">{d.nodo.texto}</span>
                      <span
                        className={`text-[9px] font-semibold uppercase tracking-wide leading-tight max-w-[140px] truncate ${
                          d.nodo.estado === "sin-ubicar" ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {d.nodo.estado === "buscando" ? "Buscando…" : d.nodo.estado === "sin-ubicar" ? "Sin ubicar" : d.nodo.etiqueta ?? "Ubicado"}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Sacar ${d.nodo.texto}`}
                      onClick={() => escribir(base.filter((_, j) => j !== d.indice))}
                      className="p-0.5 rounded text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </Fragment>
            );
          })}
          <span className="ml-3 inline-flex items-center gap-1 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 pl-2 pr-1 py-1.5">
            {agregando ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> : <Plus className="w-3.5 h-3.5 text-zinc-400" />}
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  void agregar();
                }
                if (e.key === "Backspace" && !entrada && base.length) escribir(base.slice(0, -1));
              }}
              onBlur={() => void agregar()}
              placeholder="Agregar punto"
              aria-label="Agregar un punto a la ruta, antes del destino"
              className="w-28 bg-transparent text-xs font-bold data text-zinc-900 dark:text-white outline-none uppercase placeholder:normal-case placeholder:font-medium placeholder:text-zinc-400"
            />
          </span>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        En el plan: <span className="data font-bold text-zinc-600 dark:text-zinc-300">{ruta.trim().toUpperCase() || "DCT"}</span>
      </p>
    </div>
  );
}
