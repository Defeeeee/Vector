"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import EditorPlanDeVuelo, { type AvionEditor } from "./EditorPlanDeVuelo";
import type { OficinaUbicada } from "@/lib/oficinas-aro";
import type { FormularioPlan, PilotoParaPlan } from "@/lib/formulario-plan";
import { claveBorrador } from "@/lib/borrador-plan";
import { avionDePlanNuevo, formularioDePlanNuevo, idDePlanNuevo, nuevoIdDePlan, urlDePlanNuevo, urlDelPlan } from "@/lib/plan-nuevo";

/**
 * Un plan de vuelo nuevo, con o sin señal (`lib/plan-nuevo.ts`).
 *
 * El id sale de la dirección (`?id=`) o, si no hay, se genera y se **escribe en la dirección** (así recargar
 * la pantalla vuelve al mismo plan). El formulario arranca de lo que hay en el borrador del teléfono con
 * ese id —lo escrito sin señal, o el plan duplicado— o en blanco (con el avión elegido, `?avion=`). El
 * editor se monta recién cuando todo eso se sabe: lee el navegador, y el servidor no puede.
 *
 * Cuando el servidor crea el plan, la dirección pasa a ser la del plan guardado **sin volver a montar
 * el editor** (`history.replaceState`): el piloto no pierde el cursor.
 */
export default function NuevoPlanDeVuelo({
  aviones,
  piloto,
  firmaInicial,
  oficinas,
  ahoraIso,
  envioAroActivo,
  clavePush,
}: {
  aviones: AvionEditor[];
  piloto: PilotoParaPlan;
  firmaInicial: string | null;
  oficinas: OficinaUbicada[];
  ahoraIso: string;
  envioAroActivo: boolean;
  clavePush: string | null;
}) {
  const [arranque, setArranque] = useState<{ id: string; formulario: FormularioPlan } | null>(null);

  useEffect(() => {
    const avionId = avionDePlanNuevo(window.location.search);
    let id = idDePlanNuevo(window.location.search);
    if (!id) {
      id = nuevoIdDePlan();
      window.history.replaceState(window.history.state, "", urlDePlanNuevo(id, avionId));
    }
    let borrador: string | null = null;
    try {
      borrador = localStorage.getItem(claveBorrador(id));
    } catch {
      /* sin almacenamiento: no hay borrador */
    }
    setArranque({
      id,
      formulario: formularioDePlanNuevo({ borrador, avionId, aviones, piloto, hoyUtc: new Date().toISOString().slice(0, 10) }),
    });
    // Sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!arranque) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Preparando el plan…
      </p>
    );
  }

  return (
    <EditorPlanDeVuelo
      id={arranque.id}
      formularioInicial={arranque.formulario}
      demorasIniciales={[]}
      aviones={aviones}
      piloto={piloto}
      firmaInicial={firmaInicial}
      oficinas={oficinas}
      ahoraIso={ahoraIso}
      enviosIniciales={[]}
      canceladoInicial={null}
      envioAroActivo={envioAroActivo}
      actualizadoInicial={null}
      seguimientoInicial={null}
      vueloId={null}
      clavePush={clavePush}
      respuestas={[]}
      enServidorInicial={false}
      alCrearse={() => window.history.replaceState(window.history.state, "", urlDelPlan(arranque.id))}
    />
  );
}
