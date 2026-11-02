"use client";

import { useState } from "react";
import StyledSelect from "@/components/dashboard/StyledSelect";
import { computeFuel } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, hoursToHm, num } from "./ToolPrimitives";

const UNIT_OPTIONS = [
  { value: "l", label: "Litros (L)" },
  { value: "gal", label: "Galones US (gal)" },
];

const RESERVE_OPTIONS = [
  { value: "30", label: "30 min — VFR diurno" },
  { value: "45", label: "45 min — VFR nocturno" },
  { value: "60", label: "60 min — IFR / margen propio" },
  { value: "0", label: "Sin reserva" },
];

export default function FuelCalculator() {
  const [unit, setUnit] = useState("l");
  const [fuel, setFuel] = useState("120");
  const [burn, setBurn] = useState("32");
  const [reserve, setReserve] = useState("45");
  const [leg, setLeg] = useState("90");
  const [gs, setGs] = useState("95");

  const unitLabel = unit === "l" ? "L" : "gal";

  const r = computeFuel({
    fuelOnBoard: num(fuel),
    burnRate: num(burn),
    reserveMinutes: num(reserve),
    legMinutes: num(leg),
    groundSpeed: num(gs),
  });

  const legSet = num(leg) > 0;
  const short = legSet && r.remainingAfterLeg < 0;

  return (
    <ToolLayout
      inputs={
        <>
          <div>
            <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
              Unidad de combustible
            </span>
            <StyledSelect name="fuel-unit" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Combustible utilizable" value={fuel} onChange={setFuel} suffix={unitLabel} />
            <NumberField label="Consumo" value={burn} onChange={setBurn} suffix={`${unitLabel}/h`} />
          </div>

          <div>
            <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
              Reserva
            </span>
            <StyledSelect name="fuel-reserve" value={reserve} onChange={setReserve} options={RESERVE_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Tiempo de la etapa" value={leg} onChange={setLeg} suffix="min" />
            <NumberField label="Velocidad de suelo" value={gs} onChange={setGs} suffix="kt" />
          </div>
        </>
      }
      results={
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label="Autonomía total"
              value={hoursToHm(r.enduranceHours)}
              hint={`${fmt(r.enduranceHours, 2)} h de tanque lleno a seco`}
              large
            />
            <ResultTile
              label="Autonomía útil"
              value={hoursToHm(r.usableHours)}
              hint={`Descontada la reserva de ${fmt(r.reserveFuel, 1)} ${unitLabel}`}
              tone={r.usableHours <= 0 ? "bad" : "neutral"}
              large
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ResultTile label="Alcance útil" value={fmt(r.rangeNm, 0)} unit="NM" hint="A la velocidad de suelo indicada" />
            <ResultTile
              label="Necesario para la etapa"
              value={fmt(r.requiredForLeg, 1)}
              unit={unitLabel}
              hint="Etapa + reserva"
            />
          </div>

          {legSet && (
            <ResultTile
              label={short ? "Falta combustible" : "Sobrante al llegar"}
              value={fmt(Math.abs(r.remainingAfterLeg), 1)}
              unit={unitLabel}
              tone={short ? "bad" : r.remainingAfterLeg < num(burn) * 0.25 ? "warn" : "good"}
              hint={
                short
                  ? "La etapa no cierra con la reserva elegida."
                  : `Equivale a ${hoursToHm(r.remainingAfterLeg / (num(burn) || 1))} extra de vuelo.`
              }
              large
            />
          )}

          <ToolNote>
            El cálculo asume consumo constante, sin corregir por régimen, altitud ni mezcla. El
            combustible a cargar es el <em>utilizable</em>: el no utilizable del POH ya queda afuera.
          </ToolNote>
        </>
      }
    />
  );
}
