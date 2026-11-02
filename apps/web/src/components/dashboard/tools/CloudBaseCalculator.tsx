"use client";

import { useState } from "react";
import { computeCloudBase } from "@/lib/aviation";
import { NumberField, ResultTile, ToolLayout, ToolNote, fmt, num } from "./ToolPrimitives";

export default function CloudBaseCalculator() {
  const [temp, setTemp] = useState("24");
  const [dew, setDew] = useState("14");
  const [elevation, setElevation] = useState("79");

  const r = computeCloudBase({
    temperatureC: num(temp),
    dewpointC: num(dew),
    elevationFt: num(elevation),
  });

  const inverted = r.spread < 0;
  // 1000 ft AGL is the VFR ceiling that decides whether the flight happens.
  const tone = inverted || r.baseAgl < 1000 ? "bad" : r.baseAgl < 2000 ? "warn" : "good";

  return (
    <ToolLayout
      inputs={
        <>
          <NumberField label="Temperatura" value={temp} onChange={setTemp} suffix="°C" />
          <NumberField label="Punto de rocío" value={dew} onChange={setDew} suffix="°C" />
          <NumberField label="Elevación del aeródromo" value={elevation} onChange={setElevation} suffix="ft" />

          <ToolNote>
            Los dos primeros valores salen directo del METAR: en <code>SADM 241200Z ... 24/14 Q1013</code>,
            el grupo <code>24/14</code> es temperatura y rocío.
          </ToolNote>
        </>
      }
      results={
        <>
          <ResultTile
            label="Base de nubes sobre el terreno"
            value={inverted ? "—" : fmt(r.baseAgl, 0)}
            unit={inverted ? undefined : "ft AGL"}
            tone={tone}
            hint={inverted ? "Rocío por encima de la temperatura" : `${fmt(r.baseMsl, 0)} ft sobre el nivel del mar`}
            large
          />

          <div className="grid grid-cols-2 gap-3">
            <ResultTile label="Spread" value={fmt(r.spread, 1)} unit="°C" hint="Temperatura − rocío" />
            <ResultTile
              label="Temp. en la base"
              value={inverted ? "—" : fmt(r.tempAtBase, 1)}
              unit={inverted ? undefined : "°C"}
              tone={!inverted && r.tempAtBase <= 0 ? "warn" : "neutral"}
              hint={!inverted && r.tempAtBase <= 0 ? "Riesgo de engelamiento en la base" : undefined}
            />
          </div>

          {inverted && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-red-700 dark:text-red-400">Datos inconsistentes</p>
              <p className="mt-1 text-xs font-medium text-red-600/80 dark:text-red-400/70">
                El punto de rocío no puede superar a la temperatura. Revisá el METAR: si son iguales,
                el aire está saturado y hay niebla o nubes en superficie.
              </p>
            </div>
          )}

          {!inverted && r.spread <= 2 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Spread muy cerrado</p>
              <p className="mt-1 text-xs font-medium text-amber-700/80 dark:text-amber-400/70">
                Con {fmt(r.spread, 1)} °C de diferencia la visibilidad puede caer rápido: es la
                condición típica de niebla de radiación al amanecer o al caer el sol.
              </p>
            </div>
          )}

          <ToolNote>
            Estima únicamente nubes de origen convectivo (cúmulos de buen tiempo), con la regla de
            400 ft por cada °C de spread. No dice nada de capas frontales o estratos advectivos, que
            pueden estar mucho más bajos.
          </ToolNote>
        </>
      }
    />
  );
}
