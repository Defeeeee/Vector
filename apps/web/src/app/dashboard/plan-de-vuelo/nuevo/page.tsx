import { apiFetch } from "@/lib/api";
import NuevoPlanDeVuelo from "@/components/dashboard/plan-de-vuelo/NuevoPlanDeVuelo";
import { oficinasAro } from "@/lib/oficinas-aro-disco";
import { avionesParaPlan, firmaGuardada, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";

/**
 * Un plan de vuelo **nuevo** (3.47.0, `lib/plan-nuevo.ts`): el id lo pone el navegador (`?id=`) y el
 * plan se crea en el servidor **cuando hay red**, así que esta pantalla anda sin señal. Se guarda para
 * volar (`PAGINAS_PARA_VOLAR`): lee lo mismo que el editor (aviones, piloto, firma, oficinas) y nada más.
 *
 * Sin señal el service worker sirve esta copia **sin query** (`urlDeCopiaSinQuery`); el id y el avión se
 * leen en el navegador. **Ninguna escritura al dibujarse** (invariante 15): abrirla no crea nada; el
 * plan se crea al guardar, o ya mismo si hay red, desde el editor.
 */
export default async function PlanNuevoPage() {
  const [aviones, piloto, firma, clavePush] = await Promise.all([
    avionesParaPlan(),
    pilotoParaPlan(),
    firmaGuardada(),
    apiFetch("/push/clave")
      .then(async (r) => (r.ok ? (((await r.json().catch(() => null)) as { clave?: string | null } | null)?.clave ?? null) : null))
      .catch(() => null),
  ]);

  return (
    <NuevoPlanDeVuelo
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
      envioAroActivo={process.env.PLAN_DE_VUELO_ENVIO_ARO === "1"}
      clavePush={clavePush}
    />
  );
}
