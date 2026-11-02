"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AirportRef } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

/**
 * A single ICAO field that resolves itself while you type: big centered chip,
 * the aerodrome's short name appearing underneath as soon as the code is valid,
 * and a suggestion list you can drive from the keyboard.
 *
 * The point is that the pilot never has to confirm anything — seeing "Morón"
 * appear under SADM is the confirmation.
 */

const DEBOUNCE_MS = 150;

/**
 * The typed code identifies an aerodrome by either of its names.
 *
 * ANAC gives Argentine aerodromes a three-letter designator alongside the ICAO
 * indicator — General Rodríguez is GEZ *and* SRDR — and pilots here overwhelmingly
 * use the short one. Matching only on `icao` left "GEZ" showing nothing at all
 * under the field, which is precisely the confirmation this control exists to give.
 */
function exactMatch(results: AirportRef[], query: string): AirportRef | null {
  return results.find((a) => a.icao === query || a.local === query) ?? null;
}

/** Query -> results, kept for the life of the page. Codes are typed and
 *  retyped constantly (SADM out, SADM back), so re-fetching is pure latency. */
const cache = new Map<string, AirportRef[]>();

export default function AirportResolver({
  value,
  onChange,
  onResolve,
  label,
  placeholder = "SADM",
  autoFocus = false,
  name,
  lad = false,
}: {
  value: string;
  onChange: (icao: string) => void;
  /** Fires with the matched aerodrome, or null when the code doesn't resolve. */
  onResolve?: (airport: AirportRef | null) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Optional hidden-input name, so the chip can participate in a plain form. */
  name?: string;
  /**
   * También busca los LAD de ANAC, por número o por nombre ("2013" → LAD2013). Sólo en
   * Registrar vuelo: un vuelo desde un LAD se declara en el CAD con su número.
   */
  lad?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AirportRef[]>([]);
  const [resolved, setResolved] = useState<AirportRef | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Held in a ref so callers can pass an inline arrow without turning the
  // resolve effect below into a re-fetch on every render.
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const notify = useCallback((airport: AirportRef | null) => {
    setResolved((prev) => (prev?.icao === airport?.icao ? prev : airport));
    onResolveRef.current?.(airport);
  }, []);

  useEffect(() => {
    const query = value.trim().toUpperCase();

    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      notify(null);
      return;
    }

    const clave = lad ? `lad:${query}` : query;
    const cached = cache.get(clave);
    if (cached) {
      setSuggestions(cached);
      notify(exactMatch(cached, query));
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(query)}${lad ? "&lad=1" : ""}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const results: AirportRef[] = data.results ?? [];
        cache.set(clave, results);
        setSuggestions(results);
        notify(exactMatch(results, query));
      } catch {
        // Aborted or offline — leave the last good state alone rather than
        // flashing an error at someone who is mid-keystroke.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, notify, lad]);

  // Close the suggestion list on an outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = (airport: AirportRef) => {
    onChange(airport.icao);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      // Only swallow Enter when a suggestion is actually being chosen —
      // otherwise it should still submit the form.
      e.preventDefault();
      pick(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // "2013" a medio camino de elegir el LAD2013 no es un código desconocido.
  const isComplete = value.trim().length === 4 && !(lad && /^\d+$/.test(value.trim()));
  const unknown = isComplete && !resolved && !loading;

  return (
    <div ref={containerRef} className="relative">
      <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide block mb-1.5">
        {label}
      </label>

      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={lad ? 12 : 4}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase().replace(lad ? /[^A-Z0-9 ]/g : /[^A-Z0-9]/g, ""));
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`w-full text-center text-2xl font-bold tracking-[0.15em] rounded-2xl py-3 outline-none transition-colors border-2 bg-zinc-50 dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-300 dark:placeholder:text-zinc-700 placeholder:tracking-[0.15em] ${
          unknown
            ? "border-amber-400 dark:border-amber-500/60"
            : resolved
              ? "border-aviation-blue/40 dark:border-aviation-cyan/40 focus:border-aviation-blue dark:focus:border-aviation-cyan"
              : "border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white"
        }`}
      />
      {/* Posts the canonical code, not the keystrokes: someone who typed GEZ has
          to end up storing the same aerodrome as someone who typed SRDR. */}
      {name && <input type="hidden" name={name} value={resolved?.icao ?? value} />}

      {/* Resolved name — the whole point of the control. Reserve the line so
          the layout doesn't jump as codes resolve and un-resolve. */}
      <div className="h-4 mt-1.5 text-center overflow-hidden">
        <AnimatePresence mode="wait">
          {resolved ? (
            <motion.p
              key={resolved.icao}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate"
              title={resolved.name}
            >
              {resolved.label}
            </motion.p>
          ) : unknown ? (
            <motion.p
              key="unknown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium text-amber-600 dark:text-amber-500"
            >
              Código desconocido
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && suggestions.length > 0 && !(resolved && suggestions.length === 1) && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-2xl py-1"
          >
            {suggestions.map((airport, i) => (
              <li key={airport.icao}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(airport)}
                  className={`w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors ${
                    i === highlight ? "bg-zinc-100 dark:bg-white/10" : ""
                  }`}
                >
                  <span className="text-sm font-bold tracking-wider text-zinc-900 dark:text-white">
                    {airport.icao}
                  </span>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
                    {airport.label}
                  </span>
                  {/* The ANAC designator takes the country's slot rather than a
                      slot of its own. Only Argentine aerodromes have one, so "AR"
                      next to "GEZ" is saying the same thing twice — and in the
                      two-column form these rows are ~130 px wide, narrow enough
                      that one extra chip truncated "General Rodríguez" to "G.". */}
                  <span className="ml-auto text-[10px] font-semibold text-zinc-300 dark:text-zinc-600 shrink-0">
                    {airport.local && airport.local !== airport.icao ? airport.local : airport.country}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
