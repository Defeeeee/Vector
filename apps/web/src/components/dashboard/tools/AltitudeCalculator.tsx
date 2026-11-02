"use client";

import { useState } from "react";
import { computeAltitude } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, num } from "./ToolPrimitives";

export default function AltitudeCalculator() {
  const [elevation, setElevation] = useState("79");
  const [qnh, setQnh] = useState("1013");
  const [oat, setOat] = useState("30");

  const r = computeAltitude({
    elevationFt: num(elevation),
    qnhHpa: num(qnh, 1013.25),
    oatC: num(oat),
  });

  // Density altitude well above the field is the number that quietly stretches
  // the takeoff run, so it gets the warning treatment rather than a bare figure.
  const daExcess = r.densityAltitude - num(elevation);
  const daTone = daExcess > 3000 ? "bad" : daExcess > 1500 ? "warn" : "neutral";

  return (
    <ToolLayout
      inputs={
        <>
          <NumberField label="Elevación del aeródromo" value={elevation} onChange={setElevation} suffix="ft" />
          <NumberField label="QNH" value={qnh} onChange={setQnh} suffix="hPa" />
          <NumberField label="Temperatura exterior (OAT)" value={oat} onChange={setOat} suffix="°C" />

          <ToolNote>
            Referencias rápidas: SADM 79 ft, SAEZ 67 ft, SACO 1604 ft, SAME 2310 ft, SASA 4088 ft.
          </ToolNote>
        </>
      }
      results={
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label="Altitud de presión"
              value={fmt(r.pressureAltitude, 0)}
              unit="ft"
              hint="La que marca el altímetro con 1013 puesto"
              large
            />
            <ResultTile
              label="Altitud de densidad"
              value={fmt(r.densityAltitude, 0)}
              unit="ft"
              tone={daTone}
              hint={`${daExcess >= 0 ? "+" : "−"}${fmt(Math.abs(daExcess), 0)} ft sobre la elevación real`}
              large
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ResultTile label="Temperatura ISA" value={fmt(r.isaTemp, 1)} unit="°C" hint="A la altitud de presión" />
            <ResultTile
              label="Desvío ISA"
              value={`${r.isaDeviation >= 0 ? "+" : "−"}${fmt(Math.abs(r.isaDeviation), 1)}`}
              unit="°C"
              tone={r.isaDeviation > 15 ? "warn" : "neutral"}
            />
          </div>

          {daExcess > 1500 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Performance degradada</p>
              <p className="mt-1 text-xs font-medium text-amber-700/80 dark:text-amber-400/70">
                El avión va a rendir como si estuviera a {fmt(r.densityAltitude, 0)} ft. Verificá carrera
                de despegue y régimen de ascenso en las tablas del POH para esa altitud de densidad,
                no para la elevación del aeródromo.
              </p>
            </div>
          )}

          <ToolNote>
            Se usan las aproximaciones estándar: 30 ft por hPa de desvío respecto de 1013,25 y
            118,8 ft de altitud de densidad por cada °C sobre ISA. Coinciden con lo que da el E6B.
          </ToolNote>
        </>
      }
    />
  );
}
