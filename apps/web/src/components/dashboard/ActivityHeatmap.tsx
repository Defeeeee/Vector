"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { HeatmapData, HeatmapDay } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Square side and gutter in px — the grid is absolutely positioned off these. */
const CELL = 15;
const GAP = 4;
const PITCH = CELL + GAP;

const LEVELS = [
  "bg-zinc-100 dark:bg-white/[0.06]",
  "bg-aviation-blue/25 dark:bg-aviation-cyan/20",
  "bg-aviation-blue/50 dark:bg-aviation-cyan/40",
  "bg-aviation-blue/75 dark:bg-aviation-cyan/65",
  "bg-aviation-blue dark:bg-aviation-cyan",
];

/**
 * Intensity is relative to the pilot's own busiest day, but the reference is
 * capped at 4 h: without the cap a single ferry flight would flatten a year of
 * ordinary 1.2 h instruction into the palest shade.
 */
function levelFor(hours: number, max: number): number {
  if (hours <= 0) return 0;
  const scale = Math.min(Math.max(max, 1), 4);
  return Math.min(4, Math.max(1, Math.ceil((hours / scale) * 4)));
}

function describe(day: HeatmapDay): string {
  const [y, m, d] = day.date.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export default function ActivityHeatmap({ data }: { data: HeatmapData }) {
  const [hover, setHover] = useState<{ day: HeatmapDay; left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { weeks, months, max, totalDays, totalHours } = data;

  // Streak, counted in *weeks* rather than in days.
  //
  // FlightDeck's equivalent badge counts consecutive days, which for general
  // aviation reads 0 for essentially everybody — nobody flies 365 days a year,
  // so the metric only ever says "no". Weeks is the cadence pilots actually fly
  // at, so the number carries information.
  //
  // The most recent week is allowed to be empty without breaking the streak:
  // it is usually still in progress, and a streak that resets every Monday
  // morning would be noise.
  const weekStreak = (() => {
    const active = weeks.map((w) => w.some((d) => d && d.hours > 0));
    let i = active.length - 1;
    if (i >= 0 && !active[i]) i--; // grace for the week in progress
    let n = 0;
    for (; i >= 0 && active[i]; i--) n++;
    return n;
  })();

  // On a phone only a third of the year fits. Start at the right edge: the
  // question a pilot opens this to answer is about recent weeks, not about
  // last August.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Anchored to the card, not to the grid: the grid scrolls horizontally, and
  // an overflow container clips on both axes — a tooltip drawn inside it would
  // be sliced off above the top row.
  const showTip = (day: HeatmapDay, cell: HTMLElement) => {
    const card = cardRef.current;
    if (!card) return;
    const c = cell.getBoundingClientRect();
    const base = card.getBoundingClientRect();
    const centre = c.left - base.left + CELL / 2;
    // Half of the widest tooltip, so the first and last columns don't hang off
    // the card edge.
    const inset = 80;
    setHover({
      day,
      left: Math.min(Math.max(centre, inset), Math.max(inset, base.width - inset)),
      top: c.top - base.top,
    });
  };

  return (
    <div
      ref={cardRef}
      className="relative p-8 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] shadow-cal dark:shadow-none"
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div className="flex flex-col space-y-1">
          <h3 className="text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">
            Actividad
          </h3>
          <p className="eyebrow">
            Últimos 12 meses
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {weekStreak > 0 && (
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300">
              {weekStreak} {weekStreak === 1 ? "semana seguida" : "semanas seguidas"}
            </span>
          )}
          <CalendarDays className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>
            <span className="font-bold text-zinc-900 dark:text-white data">{totalDays}</span>{" "}
            {totalDays === 1 ? "día volado" : "días volados"} ·{" "}
            <span className="font-bold text-zinc-900 dark:text-white data">{totalHours.toFixed(1)}</span> hs
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Weekday gutter — outside the scroller so it stays put on a phone,
            and only alternate rows are labelled, like a calendar. */}
        <div
          className="shrink-0 pt-4"
          style={{ display: "grid", gap: GAP, gridTemplateRows: `repeat(7, ${CELL}px)` }}
        >
          {WEEKDAYS.map((d, i) => (
            <span
              key={i}
              className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-600 leading-none flex items-center"
              style={{ height: CELL }}
            >
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>

        <div ref={scrollRef} className="overflow-x-auto custom-scrollbar pb-2 flex-1">
          <div className="relative min-w-max" onMouseLeave={() => setHover(null)}>
            <div className="relative h-4">
              {months.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute top-0 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 leading-none"
                  style={{ left: m.col * PITCH }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((column, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }}>
                  {column.map((day, d) =>
                    day === null ? (
                      <div key={d} style={{ width: CELL, height: CELL }} />
                    ) : (
                      <div
                        key={d}
                        onMouseEnter={(e) => showTip(day, e.currentTarget)}
                        // Touch has no hover: tap to read a day, tap again to
                        // dismiss it.
                        onClick={(e) =>
                          hover?.day.date === day.date ? setHover(null) : showTip(day, e.currentTarget)
                        }
                        className={`rounded-[3px] transition-transform hover:scale-125 ${LEVELS[levelFor(day.hours, max)]} ${
                          day.hours > 0 ? "cursor-default" : ""
                        }`}
                        style={{ width: CELL, height: CELL }}
                      />
                    )
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-zinc-900 dark:bg-black px-3 py-2 text-white shadow-xl"
          style={{ left: hover.left, top: hover.top - 6 }}
        >
          <p className="text-[10px] font-semibold text-zinc-400 leading-none mb-1">
            {describe(hover.day)}
          </p>
          <p className="text-xs font-bold leading-none">
            {hover.day.flights === 0
              ? "Sin vuelos"
              : `${hover.day.hours.toFixed(1)} hs · ${hover.day.flights} ${
                  hover.day.flights === 1 ? "vuelo" : "vuelos"
                }`}
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600">Menos</span>
        {LEVELS.map((cls, i) => (
          <div key={i} className={`rounded-[3px] ${cls}`} style={{ width: CELL, height: CELL }} />
        ))}
        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600">Más</span>
      </div>
    </div>
  );
}
