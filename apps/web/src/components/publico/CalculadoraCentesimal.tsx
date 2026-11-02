"use client";

import { useState } from "react";
import { CUADRO_CENTESIMAL, formatoCentesimal, horasCentesimales, minutosEntre } from "@/lib/centesimales";

/**
 * La calculadora de la guía de horas centesimales: la hora de salida y la de llegada, y
 * el tiempo como va en el libro, con el renglón del cuadro que lo decide. Usa las mismas
 * funciones que el resto de Vector (`lib/centesimales.ts`, con tests).
 */
export default function CalculadoraCentesimal() {
  const [salida, setSalida] = useState("13:05");
  const [llegada, setLlegada] = useState("14:17");
  const minutos = minutosEntre(salida, llegada);
  const horas = minutos === null ? null : horasCentesimales(minutos);
  const resto = minutos === null ? null : minutos % 60;
  const fila = resto === null || resto === 0 ? null : CUADRO_CENTESIMAL.find((f) => resto >= f.desde && resto <= f.hasta);

  const campo =
    "w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3 data text-lg font-bold text-zinc-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]";

  return (
    <div className="not-prose rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] p-6 md:p-7">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="eyebrow">Hora de salida</span>
          <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className={`${campo} mt-1.5`} />
        </label>
        <label className="block">
          <span className="eyebrow">Hora de llegada</span>
          <input type="time" value={llegada} onChange={(e) => setLlegada(e.target.value)} className={`${campo} mt-1.5`} />
        </label>
      </div>
      <div className="mt-5 rounded-2xl bg-zinc-900 dark:bg-black px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3" aria-live="polite">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/40">Duración</p>
          <p className="data text-2xl font-bold text-white">
            {minutos === null ? "—" : `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/40">En el libro</p>
          <p className="data text-2xl font-bold text-aviation-cyan">{horas === null ? "—" : formatoCentesimal(horas)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        {minutos === null
          ? "Poné las dos horas en formato de 24 horas."
          : resto === 0
            ? "Horas justas: no sobra ningún minuto."
            : fila
              ? `${minutos >= 60 ? `Sobran ${resto} minutos` : `Son ${resto} minutos`}: caen entre ${fila.desde} y ${fila.hasta}, que en el cuadro son ${fila.decimas === 10 ? "una hora" : `${fila.decimas} ${fila.decimas === 1 ? "décima" : "décimas"}`}.`
              : null}{" "}
        Si la llegada es antes que la salida, se cuenta que el vuelo pasó la medianoche.
      </p>
    </div>
  );
}
