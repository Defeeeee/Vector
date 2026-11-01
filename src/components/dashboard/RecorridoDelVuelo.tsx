"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Radio, Share } from "lucide-react";
import { compartirImagen } from "@/components/dashboard/compartir-imagen";
import { recorridoDelVuelo, type RecorridoDelVuelo as Datos } from "@/actions/recorrido";

/** Leaflet toca `window` al importarse: entra por `dynamic`, como los otros mapas. */
const RecorridoMapaInner = dynamic(() => import("./RecorridoMapaInner"), {
  ssr: false,
  loading: () => <div className="w-full h-[280px] md:h-[360px] rounded-2xl bg-zinc-100 dark:bg-white/[0.03]" />,
});

const num = (n: number, d = 0) => n.toFixed(d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * El recorrido real del vuelo, de ADS-B (2.30.0), en la tarjeta abierta de la bitácora. Lo
 * pide al abrirse, desde el navegador (invariante 15). Si no hay recorrido —el avión no
 * transmite, voló fuera de la zona, o es de antes del 23/10— no muestra nada: no es un error.
 */
export default function RecorridoDelVuelo({ flightId }: { flightId: string }) {
  const [estado, setEstado] = useState<"cargando" | "listo">("cargando");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // La imagen la arma `/api/recorrido/[id]` con la sesión: el mapa, el recorrido y estos números.
  async function compartir() {
    setAviso(null);
    setCompartiendo(true);
    try {
      const res = await fetch(`/api/recorrido/${encodeURIComponent(flightId)}`);
      if (!res.ok) throw new Error();
      await compartirImagen(await res.blob(), "vector-recorrido.png");
    } catch {
      setAviso("No pudimos armar la imagen. Probá de nuevo.");
    } finally {
      setCompartiendo(false);
    }
  }

  useEffect(() => {
    let vigente = true;
    recorridoDelVuelo(flightId)
      .then((d) => vigente && setDatos(d))
      .catch(() => {})
      .finally(() => vigente && setEstado("listo"));
    return () => {
      vigente = false;
    };
  }, [flightId]);

  if (estado === "cargando") {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando el recorrido…
      </p>
    );
  }
  if (!datos) return null;
  const r = datos.resumen;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
          <Radio className="w-4 h-4 text-aviation-blue" /> El recorrido real
        </h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {datos.origen ?? "?"} {datos.despegueTexto} → {datos.destino ?? "?"} {datos.aterrizajeTexto}, hora argentina
        </p>
      </div>
      <RecorridoMapaInner recorrido={datos.recorrido} altitudMax={r.altitud_max} />
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["En el aire", `${r.minutos} min`],
          ["Recorrido", `${num(r.millas)} nm`],
          ["Altura máx.", r.altitud_max != null ? `${num(r.altitud_max)} ft` : "—"],
          ["Vel. máx.", r.velocidad_max != null ? `${r.velocidad_max} kt` : "—"],
        ].map(([t, v]) => (
          <div key={t} className="rounded-xl bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 px-3 py-2">
            <dt className="text-[11px] font-semibold text-zinc-500">{t}</dt>
            <dd className="data text-sm font-bold text-zinc-900 dark:text-white mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
      {!!r.minutos_sin_senal && r.minutos_sin_senal > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {r.minutos_sin_senal} min sin señal, en punteado: lejos de las antenas que reciben ADS-B, o volando bajo, el avión no se escucha.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void compartir();
          }}
          disabled={compartiendo}
          className="inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-60"
        >
          {compartiendo ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Share className="w-4 h-4" aria-hidden="true" />}
          {compartiendo ? "Armando la imagen…" : "Compartir la imagen"}
        </button>
        {aviso && <p className="text-xs text-red-600 dark:text-red-400">{aviso}</p>}
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Grabado por Vector con ADS-B mientras el avión transmitía. Las horas son de la primera y la última posición en el aire, segundos después de despegar y antes de aterrizar: la carrera en tierra no llega a los receptores.
      </p>
    </section>
  );
}
