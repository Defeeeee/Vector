"use client";

import { ReactNode } from "react";

/**
 * Shared bits for the operational calculators.
 *
 * Every calculator in Vector is live: inputs are held as strings and parsed on
 * each render, never committed on blur or behind a "Calcular" button. Keeping
 * the raw string in state is what makes that work — a `number` state would fight
 * the user over half-typed values like "1." or "-", clearing the field mid-entry.
 */

/** Parses a field, tolerating the comma decimal separator used locally. */
export function num(value: string, fallback = 0): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Formats a result, hiding the noise of floating point. Blank when unusable. */
export function fmt(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Decimal hours as "H:MM", the way endurance is briefed. */
export function hoursToHm(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "—";
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder = "0",
  step = "any",
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
        {label}
      </span>
      <div className="flex items-baseline gap-2 border-b-2 border-zinc-200 dark:border-white/10 focus-within:border-zinc-900 dark:focus-within:border-white transition-colors">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 text-lg font-bold data text-zinc-900 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="shrink-0 text-xs font-bold text-zinc-400 dark:text-zinc-500">{suffix}</span>
        )}
      </div>
    </label>
  );
}

/** A headline number. `tone` carries the operational verdict, not decoration. */
export function ResultTile({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  large = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  large?: boolean;
}) {
  const toneClasses = {
    neutral: "text-zinc-900 dark:text-white",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
  }[tone];

  return (
    <div className="bg-zinc-50 dark:bg-white/[0.03] rounded-2xl p-4 border border-zinc-100 dark:border-white/5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className={`mt-1 font-bold data leading-none ${large ? "text-3xl md:text-4xl" : "text-2xl"} ${toneClasses}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-bold text-zinc-400 dark:text-zinc-500">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

/** The input column / result column split every calculator shares. */
export function ToolLayout({ inputs, results }: { inputs: ReactNode; results: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 md:gap-10">
      <div className="space-y-5">{inputs}</div>
      <div className="space-y-4">{results}</div>
    </div>
  );
}

/** Explanatory footnote — the assumption behind a number, stated in the UI. */
export function ToolNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed font-medium text-zinc-400 dark:text-zinc-500 border-l-2 border-zinc-200 dark:border-white/10 pl-3">
      {children}
    </p>
  );
}
