"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";

/**
 * Cockpit kneeboard: scratch notes plus a set of chronometers.
 *
 * Everything lives in localStorage, never on the backend. Two reasons: the pad
 * is for clearances and ATIS copied mid-flight, which is throwaway by nature and
 * would only pollute the logbook, and — more importantly — it has to survive
 * losing signal in the air, which a server round-trip would not.
 *
 * A running chronometer is persisted as `startedAt` (an epoch timestamp) plus
 * the milliseconds already banked, rather than as an elapsed counter. That way
 * closing the tab, locking the phone or reloading mid-flight keeps counting from
 * the wall clock instead of silently freezing the timer.
 */

const STORAGE_KEY = "vector:kneeboard:v1";

interface Chrono {
  id: string;
  label: string;
  accumulatedMs: number;
  /** Epoch ms when it was last started, or null when stopped. */
  startedAt: number | null;
}

interface KneeboardState {
  notes: string;
  chronos: Chrono[];
}

const DEFAULT_STATE: KneeboardState = {
  notes: "",
  chronos: [
    { id: "motor", label: "Motor", accumulatedMs: 0, startedAt: null },
    { id: "vuelo", label: "Vuelo", accumulatedMs: 0, startedAt: null },
  ],
};

function elapsedOf(chrono: Chrono, now: number): number {
  return chrono.accumulatedMs + (chrono.startedAt !== null ? now - chrono.startedAt : 0);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Elapsed time as the decimal hours the logbook wants. */
function toDecimalHours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

export default function Kneeboard() {
  const [state, setState] = useState<KneeboardState>(DEFAULT_STATE);
  // localStorage is unavailable during SSR, so the first paint has to be the
  // default state and the stored one is swapped in after mount. Rendering the
  // real values before this flag flips would mismatch the server HTML.
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<KneeboardState>;
        setState({
          notes: typeof parsed.notes === "string" ? parsed.notes : "",
          chronos: Array.isArray(parsed.chronos) && parsed.chronos.length > 0 ? parsed.chronos : DEFAULT_STATE.chronos,
        });
      }
    } catch {
      // A corrupt or unreadable entry shouldn't cost the pilot the whole tool.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or private-mode failures are non-fatal: the session keeps working.
    }
  }, [state, hydrated]);

  // Only tick while something is actually running — an idle kneeboard left open
  // on the yoke mount shouldn't wake the phone twice a second.
  const anyRunning = state.chronos.some((c) => c.startedAt !== null);
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [anyRunning]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1200);
  }, []);

  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  const toggle = (id: string) => {
    const stamp = Date.now();
    setNow(stamp);
    setState((s) => ({
      ...s,
      chronos: s.chronos.map((c) =>
        c.id !== id
          ? c
          : c.startedAt === null
            ? { ...c, startedAt: stamp }
            : { ...c, accumulatedMs: c.accumulatedMs + (stamp - c.startedAt), startedAt: null }
      ),
    }));
  };

  const reset = (id: string) =>
    setState((s) => ({
      ...s,
      chronos: s.chronos.map((c) => (c.id === id ? { ...c, accumulatedMs: 0, startedAt: null } : c)),
    }));

  const remove = (id: string) =>
    setState((s) => ({ ...s, chronos: s.chronos.filter((c) => c.id !== id) }));

  const rename = (id: string, label: string) =>
    setState((s) => ({ ...s, chronos: s.chronos.map((c) => (c.id === id ? { ...c, label } : c)) }));

  const add = () =>
    setState((s) => ({
      ...s,
      chronos: [
        ...s.chronos,
        { id: `c${Date.now()}`, label: `Cronómetro ${s.chronos.length + 1}`, accumulatedMs: 0, startedAt: null },
      ],
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Cronómetros</h4>
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 text-xs font-bold text-aviation-blue dark:text-aviation-cyan hover:opacity-70 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>

        <div className="space-y-3">
          {state.chronos.length === 0 && (
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 py-6 text-center border border-dashed border-zinc-200 dark:border-white/10 rounded-2xl">
              No quedan cronómetros. Agregá uno para empezar.
            </p>
          )}

          {state.chronos.map((chrono) => {
            const running = chrono.startedAt !== null;
            const ms = hydrated ? elapsedOf(chrono, now) : 0;
            return (
              <div
                key={chrono.id}
                className={`rounded-2xl p-4 border transition-colors ${
                  running
                    ? "bg-aviation-blue/5 dark:bg-aviation-cyan/10 border-aviation-blue/30 dark:border-aviation-cyan/30"
                    : "bg-zinc-50 dark:bg-white/[0.03] border-zinc-100 dark:border-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={chrono.label}
                    onChange={(e) => rename(chrono.id, e.target.value)}
                    aria-label="Nombre del cronómetro"
                    className="flex-1 min-w-0 bg-transparent text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 outline-none focus:text-zinc-900 dark:focus:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => remove(chrono.id)}
                    aria-label={`Eliminar ${chrono.label}`}
                    className="shrink-0 text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="mt-1 text-3xl font-bold data text-zinc-900 dark:text-white leading-none">
                  {formatElapsed(ms)}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(chrono.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      running
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                        : "bg-aviation-blue text-white hover:bg-aviation-blue-dark"
                    }`}
                  >
                    {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {running ? "Parar" : "Arrancar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => reset(chrono.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Cero
                  </button>

                  <span className="ml-auto text-[11px] font-bold data text-zinc-400 dark:text-zinc-500">
                    {toDecimalHours(ms)} h
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] leading-relaxed font-medium text-zinc-400 dark:text-zinc-500 border-l-2 border-zinc-200 dark:border-white/10 pl-3">
          Los cronómetros siguen corriendo con la pantalla apagada o la pestaña cerrada: se guarda la
          hora de arranque, no el conteo. El valor en horas decimales está redondeado a un decimal
          para copiarlo directo a la bitácora.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Bloc de notas</h4>
          <span
            className={`flex items-center gap-1 text-[11px] font-bold transition-opacity ${
              savedFlash ? "opacity-100 text-emerald-600 dark:text-emerald-400" : "opacity-0"
            }`}
          >
            <Check className="w-3 h-3" />
            Guardado
          </span>
        </div>

        <textarea
          value={state.notes}
          onChange={(e) => {
            setState((s) => ({ ...s, notes: e.target.value }));
            flashSaved();
          }}
          placeholder={"Autorizaciones, ATIS, frecuencias...\n\nSADM ATIS INFO B\nQNH 1013 · PISTA 05\nTWR 118.5 · APP 124.7"}
          rows={16}
          className="w-full bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5 rounded-2xl p-4 text-sm font-medium leading-relaxed text-zinc-900 dark:text-white outline-none focus:border-zinc-300 dark:focus:border-white/20 transition-colors resize-y placeholder:text-zinc-300 dark:placeholder:text-zinc-700 custom-scrollbar"
        />

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {state.notes.length} caracteres · guardado en este dispositivo
          </span>
          {state.notes.length > 0 && (
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, notes: "" }))}
              className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Vaciar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
