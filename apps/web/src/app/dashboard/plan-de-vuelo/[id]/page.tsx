import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import EditorPlanDeVuelo from "@/components/dashboard/plan-de-vuelo/EditorPlanDeVuelo";
import { leerSeguimientoDelPlan } from "@/actions/seguimiento";
import { cuandoRespuesta } from "@/lib/respuesta-plan";
import { oficinasAro } from "@/lib/oficinas-aro-disco";
import { avionesParaPlan, firmaGuardada, leerPlan, leerRespuestas, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";

/**
 * El editor de un plan de vuelo guardado. El plan, los aviones, el piloto y la firma se
 * leen acá; el formulario es del navegador, que lo guarda mientras se escribe.
 *
 * **Ninguna escritura al dibujarse** (invariante 15): abrir un plan no lo toca.
 */
export default async function EditarPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plan, aviones, piloto, firma, respuestas, seguimiento, clavePush] = await Promise.all([
    leerPlan(id),
    avionesParaPlan(),
    pilotoParaPlan(),
    firmaGuardada(),
    leerRespuestas(id),
    leerSeguimientoDelPlan(id),
    // La clave de los avisos push, para ofrecerlos al lado del envío: `null` si no están configurados.
    apiFetch("/push/clave")
      .then(async (r) => (r.ok ? (((await r.json().catch(() => null)) as { clave?: string | null } | null)?.clave ?? null) : null))
      .catch(() => null),
  ]);
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
      seguimientoInicial={seguimiento}
      clavePush={clavePush}
      respuestas={respuestas.map((r) => ({ ...r, cuando: cuandoRespuesta(r.recibido_at) }))}
    />
  );
}
