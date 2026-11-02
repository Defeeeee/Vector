"use client";

import { useState } from "react";
import { computeGlide } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, hoursToHm, num } from "./ToolPrimitives";

export default function GlideCalculator() {
  const [height, setHeight] = useState("3000");
  const [ratio, setRatio] = useState("9");
  const [speed, setSpeed] = useState("65");
  const [headwind, setHeadwind] = useState("0");
  const [target, setTarget] = useState("4");

  const r = computeGlide({
    heightAgl: num(height),
    glideRatio: num(ratio),
    glideSpeedKt: num(speed),
    headwindKt: num(headwind),
    targetNm: num(target),
  });

  const windPenalty = r.glideNm - r.glideWithWindNm;

  return (
    <ToolLayout
      inputs={
        <>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Altura sobre el terreno" value={height} onChange={setHeight} suffix="ft" />
            <NumberField label="Relación de planeo" value={ratio} onChange={setRatio} suffix=": 1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Velocidad de planeo" value={speed} onChange={setSpeed} suffix="kt" />
            <NumberField label="Componente de frente" value={headwind} onChange={setHeadwind} suffix="kt" />
          </div>

          <NumberField label="Distancia al campo elegido" value={target} onChange={setTarget} suffix="NM" />

          <ToolNote>
            Relaciones típicas de entrenadores: Cessna 152 ≈ 9:1, Cessna 172 ≈ 9:1, Piper PA-28 ≈ 8:1,
            Tecnam P2002 ≈ 12:1. El valor exacto está en la sección de emergencias del POH. Un valor
            negativo en el viento representa componente de cola.
          </ToolNote>
        </>
      }
      results={
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label="Alcance en aire calmo"
              value={fmt(r.glideNm, 1)}
              unit="NM"
              hint={`Perdés ${fmt(r.lossPerNm, 0)} ft por milla`}
              large
            />
            <ResultTile
              label="Alcance con viento"
              value={fmt(r.glideWithWindNm, 1)}
              unit="NM"
              tone={windPenalty > 0.2 ? "warn" : windPenalty < -0.2 ? "good" : "neutral"}
              hint={
                Math.abs(windPenalty) < 0.05
                  ? "Sin viento cargado"
                  : windPenalty > 0
                    ? `${fmt(windPenalty, 1)} NM menos por el viento de frente`
                    : `${fmt(-windPenalty, 1)} NM más por el viento de cola`
              }
              large
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ResultTile label="Tiempo disponible" value={hoursToHm(r.minutesAloft / 60)} hint="Hasta tocar el terreno" />
            <ResultTile
              label="Relación necesaria"
              value={r.requiredRatio === null ? "—" : `${fmt(r.requiredRatio, 1)} : 1`}
              hint="Para llegar al campo elegido"
            />
          </div>

          {r.reachesTarget !== null && (
            <div
              className={`rounded-2xl p-4 border ${
                r.reachesTarget
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                  : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  r.reachesTarget ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                }`}
              >
                {r.reachesTarget ? "Llegás al campo" : "No llegás al campo"}
              </p>
              <p
                className={`mt-1 text-xs font-medium ${
                  r.reachesTarget ? "text-emerald-700/80 dark:text-emerald-400/70" : "text-red-600/80 dark:text-red-400/70"
                }`}
              >
                {r.reachesTarget
                  ? `Te sobran ${fmt(r.glideWithWindNm - num(target), 1)} NM, sin contar la maniobra de circuito ni el viraje inicial.`
                  : `Te faltan ${fmt(num(target) - r.glideWithWindNm, 1)} NM. Buscá algo más cerca.`}
              </p>
            </div>
          )}

          <ToolNote>
            Números de aire calmo con la aeronave limpia y a velocidad de mejor planeo exacta. No
            descuentan el viraje hacia el campo ni el circuito para alinearse, que en la práctica se
            comen buena parte del margen.
          </ToolNote>
        </>
      }
    />
  );
}
