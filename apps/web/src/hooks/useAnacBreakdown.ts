"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Shared allocation logic for every "part of the flight time" control in the
 * logbook form — the PIC/SIC breakdown and the conditions/simulator block.
 *
 * The whole idea is that a category's slider can never reach a value that would
 * push the total over the flight time. There is nothing to validate after the
 * fact because the invalid state isn't reachable, which is what makes the
 * FlightDeck version feel like it's helping rather than scolding.
 *
 * Two modes:
 *
 * - `pooled` (the PIC/SIC breakdown): the categories partition the flight, so
 *   they draw from one shared pool. One category is the `remainderKey` — it
 *   silently holds whatever is left over, which preserves Vector's existing
 *   "pre-fill PIC Día with the whole flight" shortcut while still letting you
 *   move time out of it just by sliding another category up.
 *
 * - not pooled (conditions/simulator): IMC, hood and sim time overlap each
 *   other and the flight rather than partitioning it, so each one is capped at
 *   the total independently instead of sharing a pool.
 */

/** Hours are logged in ANAC tenths. */
const STEP = 0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AnacBreakdown {
  /** Effective hours per category, remainder included. */
  values: Record<string, number>;
  /** Which rows are expanded (i.e. contributing). */
  active: Record<string, boolean>;
  /** Sum of every active category. In pooled mode this is what's on the books. */
  assigned: number;
  /** Pooled mode only: flight time not attributed to any category. */
  unassigned: number;
  /** Highest value this category's slider may reach right now. */
  maxFor: (key: string) => number;
  toggle: (key: string) => void;
  setValue: (key: string, hours: number) => void;
  /** Last category the pilot switched on — used for the "1.5 PIC Día" feedback chip. */
  lastTouched: string | null;
}

export function useAnacBreakdown({
  total,
  keys,
  pooled = true,
  remainderKey = null,
}: {
  total: number;
  keys: string[];
  pooled?: boolean;
  remainderKey?: string | null;
}): AnacBreakdown {
  /** Only explicitly-set categories live in state; the remainder is derived. */
  const [manual, setManual] = useState<Record<string, number>>({});
  const [activeSet, setActiveSet] = useState<string[]>([]);
  const [remainderOff, setRemainderOff] = useState(false);
  const [lastTouched, setLastTouched] = useState<string | null>(null);

  // When the flight time shrinks (the pilot corrected a takeoff time), pull any
  // category that no longer fits back down rather than leaving an impossible
  // value behind.
  useEffect(() => {
    setManual((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      let budget = total;
      for (const key of keys) {
        const value = prev[key];
        if (value === undefined) continue;
        const capped = pooled
          ? round1(Math.min(value, Math.max(0, budget)))
          : round1(Math.min(value, total));
        if (capped !== value) changed = true;
        next[key] = capped;
        if (pooled) budget = round1(budget - capped);
      }
      return changed ? next : prev;
    });
  }, [total, keys, pooled]);

  const manualSum = useMemo(
    () =>
      round1(
        activeSet
          .filter((k) => k !== remainderKey)
          .reduce((sum, k) => sum + (manual[k] ?? 0), 0)
      ),
    [activeSet, manual, remainderKey]
  );

  /** What the remainder bucket is currently holding. */
  const remainderValue =
    pooled && remainderKey && !remainderOff
      ? Math.max(0, round1(total - manualSum))
      : 0;

  const values = useMemo(() => {
    const out: Record<string, number> = {};
    for (const key of keys) {
      if (key === remainderKey && pooled) out[key] = remainderValue;
      else out[key] = activeSet.includes(key) ? (manual[key] ?? 0) : 0;
    }
    return out;
  }, [keys, manual, activeSet, remainderKey, pooled, remainderValue]);

  const active = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const key of keys) {
      out[key] =
        key === remainderKey && pooled
          ? !remainderOff && remainderValue > 0
          : activeSet.includes(key);
    }
    return out;
  }, [keys, activeSet, remainderKey, pooled, remainderOff, remainderValue]);

  const assigned = useMemo(
    () => round1(Object.values(values).reduce((a, b) => a + b, 0)),
    [values]
  );

  const unassigned = pooled ? Math.max(0, round1(total - assigned)) : 0;

  const maxFor = useCallback(
    (key: string) => {
      if (!pooled) return total;
      if (key === remainderKey) return total;
      // Own value plus everything not spoken for by the *other* manual
      // categories. The remainder bucket gives its time up freely.
      return Math.max(0, round1(total - manualSum + (manual[key] ?? 0)));
    },
    [pooled, total, remainderKey, manualSum, manual]
  );

  const setValue = useCallback(
    (key: string, hours: number) => {
      if (key === remainderKey && pooled) return; // derived, not settable
      setManual((prev) => {
        const otherSum = round1(
          activeSet
            .filter((k) => k !== key && k !== remainderKey)
            .reduce((sum, k) => sum + (prev[k] ?? 0), 0)
        );
        const ceiling = pooled ? Math.max(0, round1(total - otherSum)) : total;
        return { ...prev, [key]: round1(Math.min(Math.max(0, hours), ceiling)) };
      });
      setLastTouched(key);
    },
    [remainderKey, pooled, activeSet, total]
  );

  const toggle = useCallback(
    (key: string) => {
      if (key === remainderKey && pooled) {
        setRemainderOff((off) => !off);
        setLastTouched(key);
        return;
      }
      setActiveSet((prev) => {
        if (prev.includes(key)) {
          setManual((m) => ({ ...m, [key]: 0 }));
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
      setLastTouched(key);
    },
    [remainderKey, pooled]
  );

  return { values, active, assigned, unassigned, maxFor, toggle, setValue, lastTouched };
}

export { STEP as ANAC_STEP, round1 as roundToTenth };
