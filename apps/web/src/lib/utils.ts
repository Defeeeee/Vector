import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Raw block time in minutes (chocks off to chocks on), before the ANAC rounding
 * rule below. Shown next to the rounded decimal so the pilot can tell the two
 * numbers apart instead of wondering why 1:22 logged as 1.4.
 */
export function calculateBlockMinutes(takeoffStr: string, landingStr: string): number {
  if (!takeoffStr || !landingStr) return 0;

  const [tH, tM] = takeoffStr.split(':').map(Number);
  const [lH, lM] = landingStr.split(':').map(Number);
  if ([tH, tM, lH, lM].some(n => Number.isNaN(n))) return 0;

  let totalMinutes = (lH * 60 + lM) - (tH * 60 + tM);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // Crosses midnight
  return totalMinutes;
}

/** Block minutes rendered as "H:MM". */
export function formatBlockTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function calculateFlightDuration(takeoffStr: string, landingStr: string): number {
  if (!takeoffStr || !landingStr) return 0;

  const [tH, tM] = takeoffStr.split(':').map(Number);
  const [lH, lM] = landingStr.split(':').map(Number);
  
  let totalMinutes = (lH * 60 + lM) - (tH * 60 + tM);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // Crosses midnight
  
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  let decimal = 0;
  if (mins >= 3 && mins <= 8) decimal = 0.1;
  else if (mins >= 9 && mins <= 14) decimal = 0.2;
  else if (mins >= 15 && mins <= 20) decimal = 0.3;
  else if (mins >= 21 && mins <= 26) decimal = 0.4;
  else if (mins >= 27 && mins <= 33) decimal = 0.5;
  else if (mins >= 34 && mins <= 39) decimal = 0.6;
  else if (mins >= 40 && mins <= 45) decimal = 0.7;
  else if (mins >= 46 && mins <= 51) decimal = 0.8;
  else if (mins >= 52 && mins <= 57) decimal = 0.9;
  else if (mins >= 58 && mins <= 60) decimal = 1.0;
  
  return hours + decimal;
}

export interface HeatmapDay {
  /** "YYYY-MM-DD" */
  date: string;
  hours: number;
  flights: number;
}

export interface HeatmapData {
  /** One entry per week column, each holding 7 days (Mon→Sun); null = future. */
  weeks: (HeatmapDay | null)[][];
  /** Column index where each month starts, for the labels above the grid. */
  months: { col: number; label: string }[];
  max: number;
  totalDays: number;
  totalHours: number;
}

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY_MS = 86_400_000;

/**
 * Buckets flights into a contribution-grid shape.
 *
 * Built on the server and passed down already laid out: the grid depends on
 * "today", and letting the client recompute it would desync SSR from hydration
 * whenever the browser's timezone puts it on a different calendar day.
 *
 * All arithmetic is in UTC so adding a day is always +86400000 — with local
 * dates the two DST switches a year would silently drop or duplicate a column.
 */
export function buildActivityHeatmap(
  entries: { date: string; duration: number }[],
  weeksBack = 52
): HeatmapData {
  const totals = new Map<string, { hours: number; flights: number }>();
  for (const e of entries) {
    if (!e.date) continue;
    const key = e.date.slice(0, 10);
    const cur = totals.get(key) ?? { hours: 0, flights: 0 };
    cur.hours += e.duration || 0;
    cur.flights += 1;
    totals.set(key, cur);
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  // Monday-first, the way a calendar reads here: Mon = 0 … Sun = 6.
  const weekday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const startMs = todayMs - weekday * DAY_MS - weeksBack * 7 * DAY_MS;

  const weeks: (HeatmapDay | null)[][] = [];
  const months: { col: number; label: string }[] = [];
  let max = 0;
  let totalDays = 0;
  let totalHours = 0;
  let lastMonth = -1;

  for (let w = 0; w <= weeksBack; w++) {
    const column: (HeatmapDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = startMs + (w * 7 + d) * DAY_MS;
      if (ms > todayMs) {
        column.push(null);
        continue;
      }
      const entry = totals.get(new Date(ms).toISOString().slice(0, 10));
      const hours = entry ? entry.hours : 0;
      if (hours > max) max = hours;
      if (entry) {
        totalDays += 1;
        totalHours += entry.hours;
      }
      column.push({
        date: new Date(ms).toISOString().slice(0, 10),
        hours: Number(hours.toFixed(1)),
        flights: entry?.flights ?? 0,
      });
    }
    weeks.push(column);

    const month = new Date(startMs + w * 7 * DAY_MS).getUTCMonth();
    if (month !== lastMonth) {
      months.push({ col: w, label: MONTHS_SHORT[month] });
      lastMonth = month;
    }
  }

  // The first column is usually a stub of the previous month; drop its label if
  // the next one would land on top of it.
  if (months.length > 1 && months[1].col < 3) months.shift();

  return { weeks, months, max, totalDays, totalHours: Number(totalHours.toFixed(1)) };
}

export interface DocumentStatus {
  /** `null` cuando el documento no vence: no hay cuenta regresiva que hacer. */
  daysRemaining: number | null;
  tone: "expired" | "critical" | "warning" | "ok" | "sin_vencimiento";
  label: string;
}

/**
 * How urgent a document's expiry is.
 *
 * Thresholds mirror the 60/30/7 alert ladder in the backend sweep so the colour
 * on screen and the WhatsApp message agree — a card reading "en regla" the same
 * morning a warning arrives would undermine both.
 *
 * Compared in UTC against the date alone: expiries are calendar dates, and
 * running them through local time would flip the count a day either way
 * depending on the pilot's timezone.
 */
export function documentStatus(expiryDate: string | null | undefined, today = new Date()): DocumentStatus {
  // No todo documento caduca: una licencia puede ser de por vida. **Sin fecha es
  // "no vence", no "no sabemos"** — nunca está vencido, nunca bloquea y nunca
  // dispara un aviso.
  //
  // Sin esta guarda el `slice` de abajo explota con null, y como `pilotStatus`
  // llama a esta función por cada documento bloqueante, un solo documento sin
  // fecha tiraba el semáforo entero en vez de degradarlo.
  if (!expiryDate) {
    return { daysRemaining: null, tone: "sin_vencimiento", label: "Sin vencimiento" };
  }

  const expiry = Date.parse(`${expiryDate.slice(0, 10)}T00:00:00Z`);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysRemaining = Math.round((expiry - todayUtc) / DAY_MS);

  if (daysRemaining < 0) {
    const days = Math.abs(daysRemaining);
    return { daysRemaining, tone: "expired", label: `Vencido hace ${days} ${days === 1 ? "día" : "días"}` };
  }
  if (daysRemaining === 0) return { daysRemaining, tone: "expired", label: "Vence hoy" };
  if (daysRemaining <= 7) return { daysRemaining, tone: "critical", label: `Vence en ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}` };
  if (daysRemaining <= 30) return { daysRemaining, tone: "warning", label: `Vence en ${daysRemaining} días` };
  if (daysRemaining <= 60) return { daysRemaining, tone: "warning", label: `Vence en ${daysRemaining} días` };
  return { daysRemaining, tone: "ok", label: `Vence en ${daysRemaining} días` };
}

export function isLocalFlight(route: string): boolean {
  if (!route) return true;
  const parts = route.split(/[ -]/).filter(p => p.trim() !== "");
  if (parts.length < 2) return true;
  return parts[0].toUpperCase() === parts[1].toUpperCase();
}


