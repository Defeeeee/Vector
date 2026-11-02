"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ANAC_STEP } from "@/hooks/useAnacBreakdown";
import { AnacBreakdown } from "@/hooks/useAnacBreakdown";

export interface TimeCategory {
  /** Matches the form field name the backend already expects. */
  key: string;
  label: string;
}

/**
 * A category row: name, live value, on/off switch, and — only once it's on —
 * a slider that physically cannot go past the time still available.
 */
function AllocatorRow({
  category,
  breakdown,
  isRemainder,
}: {
  category: TimeCategory;
  breakdown: AnacBreakdown;
  isRemainder: boolean;
}) {
  const value = breakdown.values[category.key] ?? 0;
  const on = breakdown.active[category.key] ?? false;
  const max = breakdown.maxFor(category.key);

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        on
          ? "border-aviation-blue/30 dark:border-aviation-cyan/25 bg-aviation-blue/[0.04] dark:bg-aviation-cyan/[0.06]"
          : "border-zinc-200 dark:border-white/10"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`text-sm font-semibold flex-1 truncate transition-colors ${
            on ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {category.label}
        </span>

        {isRemainder && on && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/10 px-2 py-0.5 rounded-full">
            Resto
          </span>
        )}

        <span
          className={`text-base font-bold data w-10 text-right transition-colors ${
            on ? "text-zinc-900 dark:text-white" : "text-zinc-300 dark:text-zinc-600"
          }`}
        >
          {value.toFixed(1)}
        </span>

        <Switch
          on={on}
          onClick={() => breakdown.toggle(category.key)}
          label={category.label}
        />
      </div>

      <AnimatePresence initial={false}>
        {on && !isRemainder && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">
              <input
                type="range"
                min={0}
                max={max}
                step={ANAC_STEP}
                value={value}
                aria-label={`Horas de ${category.label}`}
                onChange={(e) => breakdown.setValue(category.key, Number(e.target.value))}
                className="anac-slider w-full"
                style={{
                  // Fill the track up to the thumb so the assigned share reads
                  // at a glance without a second element.
                  ["--fill" as string]: `${max > 0 ? (value / max) * 100 : 0}%`,
                }}
              />
              <div className="flex justify-between mt-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 data">
                <span>0.0</span>
                <span>máx {max.toFixed(1)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The backend still reads plain numeric fields, so every category posts
          one regardless of whether its row is expanded. */}
      <input type="hidden" name={category.key} value={value > 0 ? value.toFixed(1) : ""} />
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${
        on ? "bg-aviation-blue" : "bg-zinc-200 dark:bg-white/10"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm ${on ? "left-5" : "left-1"}`}
      />
    </button>
  );
}

export default function TimeAllocator({
  categories,
  breakdown,
  remainderKey = null,
  columns = 2,
}: {
  categories: TimeCategory[];
  breakdown: AnacBreakdown;
  remainderKey?: string | null;
  columns?: 1 | 2;
}) {
  return (
    // items-start: an expanded row must not stretch its collapsed neighbour to
    // match, which would leave a tall empty card sitting next to it.
    <div className={`grid gap-3 items-start ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {categories.map((category) => (
        <AllocatorRow
          key={category.key}
          category={category}
          breakdown={breakdown}
          isRemainder={category.key === remainderKey}
        />
      ))}
    </div>
  );
}
