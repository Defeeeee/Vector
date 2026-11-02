"use client";

import { useState } from "react";
import { windTriangle } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, num } from "./ToolPrimitives";

/**
 * Wind triangle + runway components.
 *
 * The two questions share one set of inputs on purpose: on a real approach the
 * pilot asks "what do I steer" en route and "how much crosswind" on final, and
 * both come off the same wind. Splitting them into two tools would mean typing
 * the wind twice.
 */
export default function WindCalculator() {
  const [course, setCourse] = useState("360");
  const [tas, setTas] = useState("110");
  const [windDir, setWindDir] = useState("310");
  const [windSpeed, setWindSpeed] = useState("18");
  const [maxCrosswind, setMaxCrosswind] = useState("15");

  const courseVal = num(course);
  const r = windTriangle({
    course: courseVal,
    tas: num(tas),
    windDir: num(windDir),
    windSpeed: num(windSpeed),
  });

  const limit = num(maxCrosswind);
  const absCross = Math.abs(r.crosswind);
  const crossTone = limit > 0 ? (absCross > limit ? "bad" : absCross > limit * 0.8 ? "warn" : "good") : "neutral";

  return (
    <ToolLayout
      inputs={
        <>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Rumbo / pista" value={course} onChange={setCourse} suffix="°" min={0} max={360} />
            <NumberField label="TAS" value={tas} onChange={setTas} suffix="kt" min={0} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Viento de" value={windDir} onChange={setWindDir} suffix="°" min={0} max={360} />
            <NumberField label="Intensidad" value={windSpeed} onChange={setWindSpeed} suffix="kt" min={0} />
          </div>

          <NumberField
            label="Crosswind máximo demostrado"
            value={maxCrosswind}
            onChange={setMaxCrosswind}
            suffix="kt"
            min={0}
          />

          <WindRose course={courseVal} windDir={num(windDir)} heading={r.heading} />
        </>
      }
      results={
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label={r.headwind >= 0 ? "Viento de frente" : "Viento de cola"}
              value={fmt(Math.abs(r.headwind), 1)}
              unit="kt"
              tone={r.headwind < 0 ? "warn" : "neutral"}
              hint={r.headwind >= 0 ? "Acorta la carrera de despegue" : "Alarga la carrera y el aterrizaje"}
              large
            />
            <ResultTile
              label={`Crosswind ${r.crosswind >= 0 ? "por derecha" : "por izquierda"}`}
              value={fmt(absCross, 1)}
              unit="kt"
              tone={crossTone}
              hint={
                limit > 0
                  ? absCross > limit
                    ? `Supera el máximo de ${fmt(limit, 0)} kt`
                    : `Dentro del máximo de ${fmt(limit, 0)} kt`
                  : undefined
              }
              large
            />
          </div>

          {r.impossible ? (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-red-700 dark:text-red-400">El viento supera a la TAS</p>
              <p className="mt-1 text-xs font-medium text-red-600/80 dark:text-red-400/70">
                Con este viento no se puede sostener el rumbo pedido: no hay corrección de deriva
                posible o la velocidad de suelo sería nula o negativa.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <ResultTile
                label="Corrección"
                value={`${r.wca >= 0 ? "+" : "−"}${fmt(Math.abs(r.wca), 1)}`}
                unit="°"
                hint={r.wca >= 0 ? "A la derecha" : "A la izquierda"}
              />
              <ResultTile label="Rumbo a volar" value={fmt(r.heading, 0)} unit="°" hint="Para mantener la derrota" />
              <ResultTile
                label="Vel. de suelo"
                value={fmt(r.groundSpeed, 0)}
                unit="kt"
                tone={r.groundSpeed < num(tas) ? "warn" : "good"}
              />
            </div>
          )}

          <ToolNote>
            Rumbos y vientos en la misma referencia: si cargás la pista en magnético, el viento de
            la torre también es magnético; el del METAR viene en verdadero.
          </ToolNote>
        </>
      }
    />
  );
}

/**
 * Compass rose with the course, the wind and the crabbed heading.
 *
 * Drawn as an SVG rather than a canvas so it inherits `currentColor` and scales
 * with the layout — it has to read the same in light and dark without a second
 * code path.
 */
function WindRose({ course, windDir, heading }: { course: number; windDir: number; heading: number }) {
  const size = 180;
  const c = size / 2;
  const r = c - 22;

  // Screen coordinates from a compass bearing: 0° points up, angles run clockwise.
  const point = (bearing: number, radius: number) => {
    const rad = ((bearing - 90) * Math.PI) / 180;
    return { x: c + radius * Math.cos(rad), y: c + radius * Math.sin(rad) };
  };

  const courseEnd = point(course, r);
  const headingEnd = point(heading, r - 6);
  // The wind blows FROM windDir, so the arrow points at the centre.
  const windStart = point(windDir, r);
  const windEnd = point(windDir, 26);

  return (
    <div className="flex justify-center pt-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={c} cy={c} r={r} className="fill-none stroke-zinc-200 dark:stroke-white/10" strokeWidth={1.5} />

        {[0, 90, 180, 270].map((deg) => {
          const tick = point(deg, r);
          const label = point(deg, r + 12);
          return (
            <g key={deg}>
              <line
                x1={point(deg, r - 6).x}
                y1={point(deg, r - 6).y}
                x2={tick.x}
                y2={tick.y}
                className="stroke-zinc-300 dark:stroke-white/20"
                strokeWidth={1.5}
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-zinc-400 dark:fill-zinc-500 text-[9px] font-bold"
              >
                {["N", "E", "S", "O"][deg / 90]}
              </text>
            </g>
          );
        })}

        <defs>
          <marker id="wind-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-aviation-blue dark:fill-aviation-cyan" />
          </marker>
        </defs>

        {/* Desired course */}
        <line
          x1={c}
          y1={c}
          x2={courseEnd.x}
          y2={courseEnd.y}
          className="stroke-zinc-900 dark:stroke-white"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Heading actually flown, dashed to read as the correction */}
        <line
          x1={c}
          y1={c}
          x2={headingEnd.x}
          y2={headingEnd.y}
          className="stroke-emerald-500"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {/* Wind, pointing inward from where it blows from */}
        <line
          x1={windStart.x}
          y1={windStart.y}
          x2={windEnd.x}
          y2={windEnd.y}
          className="stroke-aviation-blue dark:stroke-aviation-cyan"
          strokeWidth={2.5}
          markerEnd="url(#wind-arrow)"
        />

        <circle cx={c} cy={c} r={3} className="fill-zinc-900 dark:fill-white" />
      </svg>
    </div>
  );
}
