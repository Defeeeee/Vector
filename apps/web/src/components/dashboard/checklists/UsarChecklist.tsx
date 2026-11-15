"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { claveDeItem, itemsTildables, parsearChecklist, partirPaso } from "@/lib/checklist";

/**
 * Una checklist para usar en cabina (3.39.0): el teléfono en la pierna, letra grande, filas altas,
 * tocar la fila entera tilda y destilda. Es lo que cargó el piloto, tal cual: **Vector no inventa
 * ni completa procedimientos**.
 *
 * Los tildes viven en el `localStorage` (con el id de la checklist) y se reinician solos si pasan
 * más de 12 h desde el último: es un vuelo nuevo. `Date.now()` sólo decide eso, nunca se muestra
 * una fecha (invariante 1).
 */

const DOCE_HORAS_MS = 12 * 60 * 60 * 1000;
const clave = (id: string) => `vector-checklist:${id}`;
const letra = (i: number) => String.fromCharCode(65 + (i % 26));

function leerTildes(id: string, validas: Set<string>): Set<string> {
  try {
    const crudo = window.localStorage.getItem(clave(id));
    if (!crudo) return new Set();
    const g = JSON.parse(crudo) as { t?: number; claves?: string[] };
    if (typeof g.t !== "number" || Date.now() - g.t > DOCE_HORAS_MS || !Array.isArray(g.claves)) return new Set();
    return new Set(g.claves.filter((c) => validas.has(c)));
  } catch {
    return new Set();
  }
}

function guardarTildes(id: string, tildes: Set<string>) {
  try {
    if (tildes.size === 0) window.localStorage.removeItem(clave(id));
    else window.localStorage.setItem(clave(id), JSON.stringify({ t: Date.now(), claves: [...tildes] }));
  } catch {
    /* sin almacenamiento, los tildes duran lo que la pantalla */
  }
}

interface Props {
  /** El id de la checklist: la clave de los tildes guardados. */
  id: string;
  texto: string;
  /** Dentro de una hoja de pantalla completa: el índice y el progreso quedan pegados arriba. */
  pegajoso?: boolean;
  /** La vista previa del editor: los tildes no se guardan ni se leen. */
  vistaPrevia?: boolean;
}

export default function UsarChecklist({ id, texto, pegajoso = false, vistaPrevia = false }: Props) {
  const { secciones } = useMemo(() => parsearChecklist(texto), [texto]);
  const tildables = useMemo(() => secciones.map((s, i) => itemsTildables(s, i)), [secciones]);
  const total = useMemo(() => tildables.reduce((n, t) => n + t.length, 0), [tildables]);
  const validas = useMemo(() => new Set(tildables.flat()), [tildables]);

  const [tildes, setTildes] = useState<Set<string>>(new Set());
  const [cargado, setCargado] = useState(false);
  // Espejo síncrono de `tildes`: dos toques seguidos, antes de que React dibuje, no se pisan.
  const actuales = useRef<Set<string>>(tildes);
  const titulos = useRef<(HTMLElement | null)[]>([]);

  // Se lee en un efecto, no al dibujar: el server no tiene `localStorage` (invariante 1, mismo motivo).
  useEffect(() => {
    // La vista previa arranca limpia y sigue lo que se escribe: nunca toca el almacenamiento.
    const leidos = vistaPrevia ? new Set<string>() : leerTildes(id, validas);
    actuales.current = leidos;
    setTildes(leidos);
    setCargado(true);
  }, [id, validas, vistaPrevia]);

  const irA = useCallback((i: number) => {
    titulos.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function alternar(k: string, seccion: number) {
    const antes = actuales.current;
    const nuevo = new Set(antes);
    const estabaCompleta = tildables[seccion].length > 0 && tildables[seccion].every((c) => antes.has(c));
    if (nuevo.has(k)) nuevo.delete(k);
    else nuevo.add(k);
    const completa = tildables[seccion].length > 0 && tildables[seccion].every((c) => nuevo.has(c));
    actuales.current = nuevo;
    setTildes(nuevo);
    if (!vistaPrevia) guardarTildes(id, nuevo);
    // Al completar una sección, se baja sola al título de la siguiente.
    if (completa && !estabaCompleta && seccion + 1 < secciones.length) irA(seccion + 1);
  }

  function reiniciar() {
    if (!window.confirm("¿Reiniciar la checklist? Se destildan todos los pasos.")) return;
    actuales.current = new Set();
    setTildes(actuales.current);
    if (!vistaPrevia) guardarTildes(id, actuales.current);
    irA(0);
  }

  if (secciones.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Esta checklist todavía está vacía. Tocá «Editar» para cargarla.</p>;
  }

  const hechos = tildes.size;
  const porcentaje = total ? Math.round((hechos / total) * 100) : 0;
  const completa = (i: number) => tildables[i].length > 0 && tildables[i].every((c) => tildes.has(c));

  return (
    <div className="space-y-6">
      {/* El índice y el progreso. En una hoja de pantalla completa quedan pegados arriba. */}
      <div className={pegajoso ? "sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 bg-noche/95 backdrop-blur border-b border-white/10 space-y-3" : "space-y-3"}>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={hechos}
            aria-label="Avance de la checklist"
            className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"
          >
            <div className="h-full bg-aviation-cyan transition-[width] duration-300" style={{ width: `${cargado ? porcentaje : 0}%` }} />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
            {hechos}/{total}
          </span>
          {hechos > 0 && (
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-1.5 min-h-11 -my-2 pl-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 hover:text-aviation-cyan shrink-0">
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reiniciar
            </button>
          )}
        </div>
        {secciones.length > 1 && (
          <nav aria-label="Secciones" className="-mx-4 px-4 overflow-x-auto custom-scrollbar">
            <ul className="flex items-center gap-2 w-max pb-1">
              {secciones.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => irA(i)}
                    className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                      completa(i) ? "border-aviation-cyan/50 text-aviation-cyan" : "border-white/10 text-zinc-500 dark:text-zinc-400 hover:text-white"
                    }`}
                  >
                    {completa(i) && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-label="Completa" />}
                    {s.titulo || "Introducción"}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {secciones.map((s, si) => {
        let numero = 0;
        return (
          <section key={si} className="space-y-1 border-t border-white/10 pt-5">
            {/* Con el índice pegado arriba, el título se alinea debajo de él al hacer scroll. */}
            <h3
              ref={(el) => {
                titulos.current[si] = el;
              }}
              className={`${pegajoso ? "scroll-mt-32" : "scroll-mt-24"} font-mono text-[11px] uppercase tracking-[0.14em] text-aviation-cyan pb-2`}
            >
              {s.titulo || "Introducción"}
              {completa(si) && <span className="ml-2 text-zinc-500">· completa</span>}
            </h3>
            <ul className="divide-y divide-white/10">
              {s.elementos.map((e, ei) => {
                if (e.tipo === "nota") {
                  return (
                    <li key={ei} className="py-3">
                      <div className="border-l-2 border-amber-400/70 pl-4 space-y-2">
                        <p className="text-base leading-snug text-amber-200">{e.texto}</p>
                        {e.sub.length > 0 && (
                          <ul className="space-y-1.5">
                            {e.sub.map((t, j) => (
                              <li key={j} className="flex gap-3 text-base leading-snug text-amber-100/90">
                                <span className="font-mono text-xs w-5 shrink-0 pt-1 text-amber-300/80">{letra(j)}.</span>
                                <span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                }
                numero += 1;
                const k = claveDeItem(si, ei);
                const hecho = tildes.has(k);
                const { etiqueta, valor } = partirPaso(e.texto);
                return (
                  <li key={ei}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={hecho}
                      onClick={() => alternar(k, si)}
                      className="w-full min-h-14 flex items-center gap-3 py-3 text-left"
                    >
                      <Tilde hecho={hecho} />
                      <span className="font-mono text-xs w-6 shrink-0 text-zinc-500 tabular-nums">{numero}.</span>
                      <span className={`flex-1 min-w-0 text-lg leading-snug break-words ${hecho ? "line-through text-zinc-500" : "text-zinc-900 dark:text-white"}`}>
                        {etiqueta}
                      </span>
                      {valor && (
                        <span className={`font-mono text-base uppercase tracking-wide text-right max-w-[45%] break-words ${hecho ? "line-through text-zinc-600" : "text-aviation-cyan"}`}>
                          {valor}
                        </span>
                      )}
                    </button>
                    {e.sub.length > 0 && (
                      <ul className="pl-12 pb-2 divide-y divide-white/5">
                        {e.sub.map((t, j) => {
                          const ks = claveDeItem(si, ei, j);
                          const hechoSub = tildes.has(ks);
                          return (
                            <li key={j}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={hechoSub}
                                onClick={() => alternar(ks, si)}
                                className="w-full min-h-12 flex items-center gap-3 py-2 text-left"
                              >
                                <Tilde hecho={hechoSub} chico />
                                <span className="font-mono text-xs w-5 shrink-0 text-zinc-500">{letra(j)}.</span>
                                <span className={`flex-1 min-w-0 text-base leading-snug break-words ${hechoSub ? "line-through text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>{t}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Tilde({ hecho, chico = false }: { hecho: boolean; chico?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`${chico ? "w-5 h-5" : "w-7 h-7"} shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
        hecho ? "bg-aviation-cyan border-aviation-cyan text-noche" : "border-zinc-500"
      }`}
    >
      {hecho && <Check className={chico ? "w-3 h-3" : "w-4 h-4"} strokeWidth={3.5} />}
    </span>
  );
}
