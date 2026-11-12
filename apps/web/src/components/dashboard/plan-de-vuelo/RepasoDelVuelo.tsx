"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookCheck, Loader2, Radio } from "lucide-react";
import { repasoDelVuelo } from "@/actions/repaso";
import { puntosParaCompartir, type NodoParaCompartir } from "@/lib/compartir-plan";
import type { Demora } from "@/lib/demora-plan";
import type { FormularioPlan } from "@/lib/formulario-plan";
import { hrefRegistrarDesdePlan } from "@/lib/plan-cierre";
import { cifrasDelRepaso, puntosParaElPedido, repasoVencido, type RepasoVuelo } from "@/lib/repaso-vuelo";
import RepasoMapa from "./RepasoMapa";

/**
 * "Cómo fue el vuelo": lo que el ADS-B vio del avión del plan, comparado con lo planeado, y el
 * camino a cargar el vuelo en la bitácora. Lo arma el backend (`services/repaso_vuelo.py`); se pide
 * al tocar el botón, no al abrir el plan (invariante 15).
 *
 * - **Las horas son de cuándo el ADS-B lo vio en el aire**, no horarios de la bitácora, y se dice.
 * - **"Registrar este vuelo" no precarga horarios** (Federico, 2026-10-20): es el mismo
 *   `hrefRegistrarDesdePlan` de "¿Ya volaste?". Registrar vuelo, con el avión y el día, ya ofrece
 *   por su cuenta los aterrizajes que vio el ADS-B (`SugerenciaAdsb`): sugerir, no llenar.
 * - Sin datos es una respuesta con su motivo, no un "no voló" (invariante 2).
 */

interface Props {
  planId: string;
  f: FormularioPlan;
  demoras: Demora[];
  nodos: NodoParaCompartir[];
  /** El vuelo de la bitácora que ya salió de este plan, si hay. */
  vueloId: string | null;
  ahoraIso: string;
  /** Que el plan guardado en el servidor sea el que se ve en pantalla. */
  esperarGuardado: () => Promise<void>;
}

const ROTULO = "font-mono text-[10px] font-bold uppercase tracking-wider";

export default function RepasoDelVuelo({ planId, f, demoras, nodos, vueloId, ahoraIso, esperarGuardado }: Props) {
  const [estado, setEstado] = useState<"" | "cargando">("");
  const [repaso, setRepaso] = useState<RepasoVuelo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const puntos = useMemo(() => puntosParaCompartir(f, nodos), [f, nodos]);
  const vencido = repasoVencido(f, demoras, ahoraIso);
  const cifras = repaso ? cifrasDelRepaso(repaso) : [];

  const pedir = async () => {
    if (estado) return;
    setEstado("cargando");
    setError(null);
    try {
      await esperarGuardado();
      const r = await repasoDelVuelo(planId, puntosParaElPedido(puntos));
      if ("error" in r) setError(r.error);
      else setRepaso(r.repaso);
    } finally {
      setEstado("");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Lo que el ADS-B vio de tu avión en este vuelo, al lado de lo que decía el plan. Depende de que el avión transmita y de que haya un receptor cerca: si no lo vio, lo dice, y eso no quiere decir que no
        hayas volado.
      </p>

      {!repaso && (
        <div>
          {vencido ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Este vuelo es de hace más de 30 días: las posiciones del ADS-B ya no se guardan.</p>
          ) : (
            <button
              type="button"
              onClick={() => void pedir()}
              disabled={estado === "cargando"}
              className="inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-4 py-2.5 text-xs font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-40"
            >
              {estado === "cargando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              {estado === "cargando" ? "Buscando el vuelo…" : "Ver cómo fue"}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {repaso?.estado === "sin_datos" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">El ADS-B no tiene este vuelo</p>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{repaso.motivo}</p>
          <button type="button" onClick={() => void pedir()} disabled={estado === "cargando"} className={`${ROTULO} text-aviation-blue hover:underline disabled:opacity-50 dark:text-aviation-cyan`}>
            {estado === "cargando" ? "Buscando…" : "Volver a mirar"}
          </button>
        </div>
      )}

      {repaso && repaso.estado !== "sin_datos" && (
        <div className="space-y-4">
          {repaso.estado === "parcial" && repaso.motivo && (
            <p className="rounded-2xl border border-amber-300/50 dark:border-amber-400/30 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">{repaso.motivo}</p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            {cifras.map((c) => (
              <div key={c.rotulo} className="min-w-0">
                <dt className={`${ROTULO} text-zinc-400 dark:text-zinc-500`}>{c.rotulo}</dt>
                <dd className="data mt-1 text-base font-bold text-zinc-900 dark:text-white">{c.valor}</dd>
                {c.detalle && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{c.detalle}</p>}
              </div>
            ))}
          </dl>
          {repaso.recorrido && repaso.recorrido.length >= 2 && <RepasoMapa planeada={puntos.map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo }))} volado={repaso.recorrido} aterrizo={repaso.estado === "completo"} />}
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {repaso.aviso ?? "Las horas son de cuándo el ADS-B vio al avión en el aire; no son los horarios de la bitácora."} La línea punteada gris es la ruta del plan; la cian, lo que vio el ADS-B.
          </p>
          <button type="button" onClick={() => void pedir()} disabled={estado === "cargando"} className={`${ROTULO} text-aviation-blue hover:underline disabled:opacity-50 dark:text-aviation-cyan`}>
            {estado === "cargando" ? "Buscando…" : "Actualizar"}
          </button>
        </div>
      )}

      <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
        {vueloId ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            <BookCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Ya está en tu bitácora.
            <Link href={`/dashboard/history?ver=${encodeURIComponent(vueloId)}`} className="text-xs font-bold text-aviation-blue hover:underline dark:text-aviation-cyan">
              Ver el vuelo
            </Link>
          </p>
        ) : (
          <>
            <Link
              href={hrefRegistrarDesdePlan(planId, f, demoras)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2.5 text-xs font-bold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
            >
              <BookCheck className="h-3.5 w-3.5" /> Registrar este vuelo
            </Link>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Carga el avión, la ruta y el día; los horarios los ponés vos, con los del tacómetro. Si el ADS-B vio al avión ese día, el formulario te ofrece los aterrizajes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
