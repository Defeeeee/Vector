"use client";

import { useState, useTransition } from "react";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import type { Aircraft } from "@/types";
import type { PuntoResuelto } from "@/app/api/puntos/route";
import { crearPlan } from "@/actions/plan-de-vuelo";
import {
  aplicarAvion,
  formularioVacio,
  sugerirAutonomia,
  type FormularioPlan,
  type PilotoParaPlan,
} from "@/lib/formulario-plan";
import { duracionHhmm, nivelCrucero, rutaItem15, velocidadCrucero, type ElementoRuta } from "@/lib/plan-de-vuelo";

/**
 * El puente del planificador al plan de vuelo: crea un plan guardado con lo que el
 * planificador ya sabe y abre el editor.
 *
 * - **Se llena:** salida, destino, la ruta en formato OACI, la velocidad (si la TAS es la
 *   del avión y no la estimada) y el nivel (si hay altitud cargada), más el perfil del avión.
 * - **Se sugiere, no se llena** (Federico, 2026-10-19): la duración, con el viento que usó
 *   el planificador, y la autonomía con el combustible a bordo. Aparecen arriba de su campo
 *   y se aplican con un toque.
 */

interface Props {
  codigos: string[];
  resueltos: (PuntoResuelto | null)[];
  aeronave: Aircraft | null;
  tasKt: number;
  tasEstimada: boolean;
  altitudFt: number | null;
  minutosTotales: number | null;
  distanciaNm: number;
  litros: number;
  consumoLh: number;
  consumoEstimado: boolean;
  piloto: PilotoParaPlan;
}

/** Los puntos del medio de la ruta, como los necesita la casilla 15. */
function elementosDeRuta(codigos: string[], resueltos: (PuntoResuelto | null)[]): ElementoRuta[] {
  const out: ElementoRuta[] = [];
  for (let i = 1; i < codigos.length - 1; i++) {
    const codigo = codigos[i]?.trim();
    if (!codigo) continue;
    const r = resueltos[i];
    if (r?.clase === "aerovia") out.push({ tipo: "aerovia", designador: codigo });
    else out.push({ tipo: r?.clase ?? "fix", codigo: r?.codigo ?? codigo, lat: r?.lat, lon: r?.lon });
  }
  return out;
}

export function formularioDesdePlanificador(p: Props): FormularioPlan {
  let f = formularioVacio();
  f = p.aeronave ? aplicarAvion(f, p.aeronave, p.piloto) : { ...f, piloto: p.piloto.comandante };
  const ultimo = p.codigos.length - 1;
  const aerodromo = (i: number) =>
    p.codigos[i]?.trim()
      ? { codigo: p.codigos[i].trim().toUpperCase(), nombre: p.resueltos[i]?.label ?? "", lat: p.resueltos[i]?.lat, lon: p.resueltos[i]?.lon }
      : null;
  const ruta = rutaItem15(elementosDeRuta(p.codigos, p.resueltos)) ?? "DCT";
  const origen = { ...f.origen };
  if (!p.tasEstimada) origen.velocidad = "planificador";

  const sugerencias: FormularioPlan["sugerencias"] = {};
  if (p.minutosTotales && p.minutosTotales > 0) {
    sugerencias.eet = {
      valor: duracionHhmm(Math.max(1, Math.round(p.minutosTotales))),
      motivo: `${Math.round(p.distanciaNm)} NM, con el viento del planificador`,
      ruta,
    };
  }
  if (!p.consumoEstimado) {
    const a = sugerirAutonomia(p.litros, p.consumoLh, "a bordo, del planificador");
    if (a) sugerencias.autonomia = a;
  }

  return {
    ...f,
    salida: aerodromo(0),
    destino: aerodromo(ultimo),
    ruta,
    velocidad: p.tasEstimada ? "" : velocidadCrucero(p.tasKt),
    nivel: p.altitudFt ? nivelCrucero(p.altitudFt) : "",
    origen,
    sugerencias,
  };
}

export default function ArmarDesdePlanificador(props: Props) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      data-imprimir="no"
      className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <span className="w-11 h-11 rounded-2xl bg-zinc-900 dark:bg-white flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-white dark:text-zinc-900" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-zinc-900 dark:text-white">Plan de vuelo para EANA</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Con esta ruta y {props.aeronave ? props.aeronave.registration : "el avión que elijas"}: te sugiere la duración y la
          autonomía, y queda guardado en Plan de vuelo.
        </span>
        {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
      </span>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await crearPlan(formularioDesdePlanificador(props));
            if (r && "error" in r) setError(r.error);
          })
        }
        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-60 shrink-0"
      >
        {pendiente ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        Armar plan de vuelo
      </button>
    </section>
  );
}
