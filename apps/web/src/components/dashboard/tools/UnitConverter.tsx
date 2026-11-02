"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import StyledSelect from "@/components/dashboard/StyledSelect";
import { UNITS, UnitCategory, convertUnit } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, num } from "./ToolPrimitives";

const CATEGORY_OPTIONS = (Object.keys(UNITS) as UnitCategory[]).map((id) => ({
  value: id,
  label: UNITS[id].label,
}));

/** Sensible default pair per category, so the tool opens on a useful conversion. */
const DEFAULT_PAIR: Record<UnitCategory, [string, string]> = {
  distance: ["nm", "km"],
  speed: ["kt", "kmh"],
  altitude: ["ft", "m"],
  weight: ["lb", "kg"],
  volume: ["galus", "l"],
  pressure: ["inhg", "hpa"],
  temperature: ["f", "c"],
};

export default function UnitConverter() {
  const [category, setCategory] = useState<UnitCategory>("distance");
  const [from, setFrom] = useState(DEFAULT_PAIR.distance[0]);
  const [to, setTo] = useState(DEFAULT_PAIR.distance[1]);
  const [value, setValue] = useState("100");

  const unitOptions = useMemo(
    () => UNITS[category].units.map((u) => ({ value: u.id, label: u.label })),
    [category]
  );

  const pickCategory = (next: string) => {
    const cat = next as UnitCategory;
    setCategory(cat);
    // The old unit ids don't exist in the new category, so reset the pair too.
    setFrom(DEFAULT_PAIR[cat][0]);
    setTo(DEFAULT_PAIR[cat][1]);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const input = num(value);
  const result = convertUnit(input, category, from, to);
  const decimals = category === "temperature" || Math.abs(result) >= 100 ? 1 : 3;

  const fromLabel = UNITS[category].units.find((u) => u.id === from)?.label ?? "";
  const toLabel = UNITS[category].units.find((u) => u.id === to)?.label ?? "";

  return (
    <ToolLayout
      inputs={
        <>
          <div>
            <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
              Magnitud
            </span>
            <StyledSelect name="unit-category" value={category} onChange={pickCategory} options={CATEGORY_OPTIONS} />
          </div>

          <NumberField label="Valor" value={value} onChange={setValue} />

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                De
              </span>
              <StyledSelect name="unit-from" value={from} onChange={setFrom} options={unitOptions} />
            </div>

            <button
              type="button"
              onClick={swap}
              aria-label="Invertir unidades"
              className="mb-1 w-9 h-9 shrink-0 rounded-xl border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <div>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                A
              </span>
              <StyledSelect name="unit-to" value={to} onChange={setTo} options={unitOptions} />
            </div>
          </div>
        </>
      }
      results={
        <>
          <ResultTile
            label="Resultado"
            value={fmt(result, decimals)}
            hint={`${fmt(input, decimals)} ${fromLabel} = ${fmt(result, decimals)} ${toLabel}`}
            large
          />

          {category === "volume" && (
            <ToolNote>
              Las equivalencias en peso usan avgas 100LL a 15 °C (0,72 kg/L). Para jet A1 o
              temperaturas muy distintas, la densidad cambia y conviene tomar la del despacho.
            </ToolNote>
          )}
        </>
      }
    />
  );
}
