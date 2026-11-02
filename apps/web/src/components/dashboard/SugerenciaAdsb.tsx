"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { vuelosDetectados, type VueloDetectado } from "@/actions/recorrido";
import { puedeHaberDetectados } from "@/lib/recorrido";

/**
 * "El LV-S114 voló hoy…": los vuelos que ese avión hizo ese día según ADS-B (2.30.0). Si no
 * hay nada detectado, no aparece.
 *
 * **Elegir uno carga sólo los aterrizajes.** Federico (2026-10-24): en el libro se suelen
 * anotar las horas de tacómetro —de la puesta en marcha al corte—, y ADS-B sólo ve el avión en
 * el aire. Proponer el despegue y el aterrizaje como horarios del vuelo daría de menos. Las
 * horas en el aire quedan a la vista como referencia, y se aplican sólo con un botón aparte,
 * para quien sí anota ésas. Sugerir, no llenar, como en el plan de vuelo.
 */
export default function SugerenciaAdsb({
  aircraftId,
  matricula,
  fecha,
  onAplicar,
  onUsarHoras,
}: {
  aircraftId: string;
  matricula?: string;
  fecha: string;
  /** Al elegir un vuelo: sólo los aterrizajes. */
  onAplicar: (v: VueloDetectado) => void;
  /** "Usar las horas en el aire": el despegue y el aterrizaje como horarios. */
  onUsarHoras: (v: VueloDetectado) => void;
}) {
  const [vuelos, setVuelos] = useState<VueloDetectado[]>([]);
  const [aplicado, setAplicado] = useState<number | null>(null);
  const [conHoras, setConHoras] = useState(false);

  useEffect(() => {
    setVuelos([]);
    setAplicado(null);
    setConHoras(false);
    // "Hoy" del navegador sólo para decidir si vale la pena preguntar; no se muestra.
    if (!aircraftId || !puedeHaberDetectados(fecha, new Date().toISOString().slice(0, 10))) return;
    let vigente = true;
    vuelosDetectados(aircraftId, fecha).then((v) => vigente && setVuelos(v)).catch(() => {});
    return () => {
      vigente = false;
    };
  }, [aircraftId, fecha]);

  if (!vuelos.length) return null;

  return (
    <div className="rounded-2xl border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.04] dark:bg-aviation-cyan/[0.05] px-4 py-3 space-y-2.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
        <Radio className="w-3.5 h-3.5 text-aviation-blue dark:text-aviation-cyan" />
        {matricula ? `El ${matricula}` : "Este avión"} voló {vuelos.length === 1 ? "una vez ese día, según ADS-B. ¿Fue éste?" : `${vuelos.length} veces ese día, según ADS-B. ¿Fue alguno de éstos?`}
      </p>
      <div className="flex flex-wrap gap-2">
        {vuelos.map((v, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onAplicar(v);
              setAplicado(i);
              setConHoras(false);
            }}
            className={`rounded-xl border px-3 py-1.5 text-left transition-colors ${
              aplicado === i
                ? "border-aviation-blue bg-aviation-blue text-white"
                : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.05] hover:border-aviation-blue/50"
            }`}
          >
            <span className="data block text-sm font-bold">
              {v.despegueTexto} → {v.aterrizajeTexto}
            </span>
            <span className={`block text-[11px] ${aplicado === i ? "text-white/80" : "text-zinc-500"}`}>
              {v.minutos} min · {v.aterrizajes} {v.aterrizajes === 1 ? "aterrizaje" : "aterrizajes"}
              {v.origen ? ` · ${v.origen}${v.destino && v.destino !== v.origen ? `–${v.destino}` : ""}` : ""}
            </span>
          </button>
        ))}
      </div>
      {aplicado === null ? (
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Horas en el aire, de Argentina: del despegue al aterrizaje. Al elegir uno se cargan los aterrizajes.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {conHoras
              ? "Cargamos las horas en el aire y los aterrizajes. Si anotás horas de tacómetro, corregilas con las tuyas."
              : `Cargamos ${vuelos[aplicado].aterrizajes === 1 ? "el aterrizaje" : `los ${vuelos[aplicado].aterrizajes} aterrizajes`}. Los horarios cargalos con el tacómetro: ADS-B no ve la puesta en marcha ni el corte, sólo cuándo estuvo en el aire.`}
          </p>
          {!conHoras && (
            <button
              type="button"
              onClick={() => {
                onUsarHoras(vuelos[aplicado]);
                setConHoras(true);
              }}
              className="text-[11px] font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline"
            >
              Usar las horas en el aire ({vuelos[aplicado].despegueTexto} a {vuelos[aplicado].aterrizajeTexto})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
