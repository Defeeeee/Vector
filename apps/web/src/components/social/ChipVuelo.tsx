"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Plane } from "lucide-react";
import type { VueloChip } from "@/types";

/** Leaflet toca `window` al importarse: entra sólo en el navegador, como los otros mapas. */
const MiniMapaRutaInner = dynamic(() => import("./MiniMapaRutaInner"), { ssr: false });

/**
 * El vuelo de una publicación: la línea con los datos que el autor eligió mostrar y,
 * si la ruta tiene aeródromos conocidos o el autor prendió el recorrido ADS-B, un mapa chico.
 *
 * El mapa se monta **recién cuando la tarjeta está por entrar en pantalla**: un feed de
 * quince publicaciones no tiene por qué levantar quince mapas y pedir cien tiles de
 * entrada, la mayoría para tarjetas que nadie va a ver.
 */
export default function ChipVuelo({ vuelo }: { vuelo: VueloChip }) {
  const datos = [
    vuelo.duracion != null ? `${vuelo.duracion.toFixed(1)} h` : null,
    vuelo.aeronave,
    vuelo.fecha_texto ?? vuelo.fecha,
  ].filter(Boolean) as string[];
  const puntos = vuelo.puntos_mapa ?? [];
  const recorrido = vuelo.recorrido && vuelo.recorrido.p.length > 1 ? vuelo.recorrido : null;

  if (!vuelo.ruta && datos.length === 0 && !recorrido) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      {(puntos.length > 0 || recorrido) && <MapaCuandoSeVe puntos={puntos} recorrido={recorrido} ruta={vuelo.ruta ?? ""} />}
      {(vuelo.ruta || datos.length > 0) && (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-50 dark:bg-carbon min-w-0">
        <Plane className="w-4 h-4 shrink-0 text-aviation-blue dark:text-aviation-cyan" aria-hidden="true" />
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] min-w-0">
          {vuelo.ruta && <span className="font-mono font-bold text-zinc-900 dark:text-white">{vuelo.ruta}</span>}
          {datos.map((d, i) => (
            <span key={i} className="data text-zinc-500 dark:text-zinc-400">
              {(vuelo.ruta || i > 0) && (
                <span aria-hidden="true" className="mr-2 text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
              )}
              {d}
            </span>
          ))}
        </p>
      </div>
      )}
    </div>
  );
}

function MapaCuandoSeVe({
  puntos,
  recorrido,
  ruta,
}: {
  puntos: NonNullable<VueloChip["puntos_mapa"]>;
  recorrido: VueloChip["recorrido"];
  ruta: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) {
          setVisible(true);
          observador.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    // `isolate`: los paneles de Leaflet traen z-index 400 y, sin su propio contexto de
    // apilamiento, pasarían por encima del encabezado fijo y de la barra del teléfono.
    <div
      ref={ref}
      role="img"
      aria-label={ruta ? `Mapa del vuelo ${ruta}` : "Mapa del vuelo"}
      className={`relative isolate ${recorrido ? "h-48 md:h-60" : "h-32 md:h-40"} w-full bg-zinc-100 dark:bg-white/[0.04] border-b border-zinc-200 dark:border-white/10`}
    >
      {visible && <MiniMapaRutaInner puntos={puntos} recorrido={recorrido} />}
    </div>
  );
}
