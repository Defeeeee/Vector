"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  /** Optional right-aligned detail, e.g. the aircraft type next to a tail number. */
  hint?: string;
}

/**
 * Listbox replacement for the native <select> in the logbook form. Native
 * selects render as OS chrome and break the rest of the form's styling, and the
 * 22-entry "Finalidad" list is unusable without a filter.
 *
 * Posts through a hidden input so it drops into the existing form action
 * unchanged.
 */
export default function StyledSelect({
  name,
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  searchable = false,
  required = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());

    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, options, value, searchable]);

  const pick = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 bg-transparent border-b-2 py-2 text-left text-sm font-semibold outline-none transition-colors ${
          open
            ? "border-zinc-900 dark:border-white"
            : "border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20"
        } ${selected ? "text-zinc-900 dark:text-white" : "text-zinc-300 dark:text-zinc-700"}`}
      >
        <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Keeps the value in the form payload and lets the browser enforce
          `required` on submit, since the trigger above is a button. */}
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only pointer-events-none absolute bottom-0 left-0"
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute z-40 left-0 right-0 mt-1 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-2xl overflow-hidden"
          >
            {searchable && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-white/10">
                <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  placeholder="Buscar..."
                  className="w-full bg-transparent text-sm font-medium text-zinc-900 dark:text-white outline-none placeholder:text-zinc-400"
                />
              </div>
            )}

            <ul role="listbox" className="max-h-64 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-xs font-medium text-zinc-400 text-center">
                  Sin resultados
                </li>
              )}
              {filtered.map((option, i) => (
                <li key={option.value} role="option" aria-selected={option.value === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(option)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      i === highlight ? "bg-zinc-100 dark:bg-white/10" : ""
                    }`}
                  >
                    <span className="flex-1 text-sm font-medium text-zinc-900 dark:text-white truncate">
                      {option.label}
                    </span>
                    {option.hint && (
                      <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 shrink-0">
                        {option.hint}
                      </span>
                    )}
                    {option.value === value && (
                      <Check className="w-3.5 h-3.5 text-aviation-blue dark:text-aviation-cyan shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
