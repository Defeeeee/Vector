import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { listPlannedFlights } from "@/actions/planned-flight";
import { esMesIso } from "@/lib/planned-flights";
import PageHeader from "@/components/dashboard/PageHeader";
import CalendarioClient from "@/components/dashboard/CalendarioClient";
import type { Aircraft, Flight } from "@/types";

/**
 * El calendario del piloto.
 *
 * Muestra **lo programado y lo ya volado** en la misma grilla, con tratamiento
 * visual distinto. Que estén los dos no es decorativo: un calendario que sólo
 * muestra planes arranca vacío para todo el mundo y no le sirve a nadie hasta que
 * el piloto adopte una costumbre que todavía no tiene. Con los vuelos ya
 * registrados adentro, la pestaña vale desde el primer día y programar es lo que se
 * suma encima.
 *
 * **El mes se navega por `searchParams`, no por estado de cliente.** Además de
 * hacerlo linkeable, saca la aritmética de fechas del navegador: ni qué mes es ni
 * qué día es hoy se deciden en el cliente, los dos bajan como props ya resueltas
 * desde el server. Este repo ya pagó dos bugs de hidratación por lo contrario.
 */

async function getData() {
  const [dashRes, planned] = await Promise.all([apiFetch("/dashboard"), listPlannedFlights()]);

  if (dashRes.status === 401) {
    console.log("CalendarioPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  const data = dashRes.ok ? await dashRes.json() : {};
  return {
    flights: (data.flights || []) as Flight[],
    aircraft: (data.aircraft || []) as Aircraft[],
    planned,
  };
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams?: Promise<{ mes?: string }> | { mes?: string };
}) {
  const { flights, aircraft, planned } = await getData();

  const params = searchParams ? await searchParams : {};
  // "Hoy" se decide en el server y baja como prop, igual que en el resumen y el
  // heatmap, así que el corte no se corre entre un server en UTC y un navegador
  // en UTC-3.
  const todayIso = new Date().toISOString().slice(0, 10);
  // Un `?mes=` inventado cae en el mes actual en vez de romper la pantalla: es un
  // parámetro que el usuario puede editar en la barra de direcciones.
  const mesIso = esMesIso(params?.mes) ? params.mes : todayIso.slice(0, 7);

  return (
    <div className="space-y-8 md:space-y-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        eyebrow="Lo que viene y lo que ya voló"
        title="Calendario"
      />
      <CalendarioClient
        planned={planned}
        flights={flights}
        aircraft={aircraft}
        mesIso={mesIso}
        todayIso={todayIso}
      />
    </div>
  );
}
