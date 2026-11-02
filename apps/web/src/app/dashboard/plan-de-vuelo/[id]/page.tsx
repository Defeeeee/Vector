import { notFound } from "next/navigation";
import EditorPlanDeVuelo from "@/components/dashboard/plan-de-vuelo/EditorPlanDeVuelo";
import { oficinasAro } from "@/lib/oficinas-aro-disco";
import { avionesParaPlan, firmaGuardada, leerPlan, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";

/**
 * El editor de un plan de vuelo guardado. El plan, los aviones, el piloto y la firma se
 * leen acá; el formulario es del navegador, que lo guarda mientras se escribe.
 *
 * **Ninguna escritura al dibujarse** (invariante 15): abrir un plan no lo toca.
 */
export default async function EditarPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plan, aviones, piloto, firma] = await Promise.all([leerPlan(id), avionesParaPlan(), pilotoParaPlan(), firmaGuardada()]);
  if (!plan) notFound();

  return (
    <EditorPlanDeVuelo
      id={plan.id}
      formularioInicial={plan.formulario}
      demorasIniciales={plan.demoras ?? []}
      aviones={aviones.map((a) => ({
        id: a.id,
        registration: a.registration,
        icao: a.icao,
        type: a.type,
        cruise_tas_kt: a.cruise_tas_kt ?? null,
        fuel_burn_lph: a.fuel_burn_lph ?? null,
        fuel_capacity_l: a.fuel_capacity_l ?? null,
        plan_vuelo: a.plan_vuelo ?? null,
      }))}
      piloto={piloto}
      firmaInicial={firma}
      oficinas={oficinasAro()}
      ahoraIso={new Date().toISOString()}
      enviosIniciales={plan.envios ?? []}
      canceladoInicial={plan.cancelado_at ?? null}
      envioAroActivo={process.env.PLAN_DE_VUELO_ENVIO_ARO === "1"}
      actualizadoInicial={plan.updated_at ?? null}
    />
  );
}
