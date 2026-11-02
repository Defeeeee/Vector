"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import type { PlannedFlight, PlannedStatus } from "@/types";

/**
 * Vuelos programados: el plan, no el vuelo.
 *
 * Todo lo de acá devuelve `{ error }` en vez de tirar. En `flight.ts` conviven las
 * dos convenciones —el alta tira porque el formulario la envuelve, y editar y
 * borrar devuelven `{error}`—, y `{error}` es la mayoritaria y la que deja al
 * llamador decidir. Ninguna de estas redirige, así que no hay motivo para tirar.
 */

interface PlannedPayload {
  date?: string;
  aircraft_id?: string | null;
  route?: string | null;
  notes?: string | null;
  /**
   * Horas tentativas **en UTC**, `"HH:MM"`. Ver `leerForm` del calendario.
   *
   * Estaban faltando en este tipo desde que se agregaron: el calendario las
   * mandaba igual —el objeto viene de una función, así que TypeScript no aplica
   * el chequeo de propiedades de más— y acá figuraba un PATCH que no las incluía.
   * No causó el bug de `PlannedFlightUpdate`, pero es exactamente la clase de
   * hueco por el que uno así pasa sin que nadie lo mire.
   */
  takeoff_time?: string | null;
  landing_time?: string | null;
  status?: PlannedStatus;
  flight_id?: string | null;
  postponed_until?: string | null;
}

/**
 * Las tres pantallas donde un plan se ve.
 *
 * **El calendario es el que se olvida.** Los GET se cachean 20 segundos
 * (`src/lib/api.ts`), así que descartar un plan desde el dashboard sin revalidar
 * `/dashboard/calendario` lo deja vivo en el calendario hasta 20 s: la pantalla no
 * se resuelve después de la acción que la resuelve, y se ve como "no anda" sin
 * ningún error. Es exactamente el bug que `addAircraft` tuvo que parchear.
 *
 * Privada al módulo, igual que `revalidateEverythingThatCounts` en `logbook.ts`.
 */
function revalidarProgramados() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendario");
}

export async function listPlannedFlights(): Promise<PlannedFlight[]> {
  const res = await apiFetch("/planned-flights");
  // Silencioso a propósito: si el backend todavía no tiene la migración 009, el
  // calendario tiene que seguir mostrando los vuelos ya registrados en vez de
  // romperse. Así el orden de los dos deploys deja de importar.
  if (!res.ok) return [];
  return (await res.json()) as PlannedFlight[];
}

export async function createPlannedFlight(payload: PlannedPayload) {
  try {
    const res = await apiFetch("/planned-flights", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.detail || "No se pudo programar el vuelo" };
    }
    revalidarProgramados();
    return { success: true as const };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: e?.message || "No se pudo programar el vuelo" };
  }
}

export async function updatePlannedFlight(id: string, payload: PlannedPayload) {
  try {
    const res = await apiFetch(`/planned-flights/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.detail || "No se pudo actualizar el vuelo programado" };
    }
    revalidarProgramados();
    return { success: true as const };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: e?.message || "No se pudo actualizar el vuelo programado" };
  }
}

export async function deletePlannedFlight(id: string) {
  try {
    const res = await apiFetch(`/planned-flights/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      return { error: err.detail || "No se pudo borrar el vuelo programado" };
    }
    revalidarProgramados();
    return { success: true as const };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: e?.message || "No se pudo borrar el vuelo programado" };
  }
}

/**
 * "No lo volé."
 *
 * Distinto de borrarlo: queda la constancia de que el piloto contestó, y el
 * calendario lo puede mostrar tachado. Borrar es para el que se cargó por error.
 */
export async function descartarProgramado(id: string) {
  return updatePlannedFlight(id, { status: "descartado" });
}

/**
 * "Después."
 *
 * Corre la pregunta un día. `postponed_until` vence *el* día indicado, así que
 * mañana se vuelve a preguntar — ver `estadoProgramado`.
 */
export async function posponerProgramado(id: string, hastaIso: string) {
  return updatePlannedFlight(id, { postponed_until: hastaIso });
}

/**
 * Envoltorios para `<form action>`, que exige que la acción devuelva `void`.
 *
 * Se traga el `{ error }` a propósito y lo deja en el log del server. Las dos
 * acciones que pasan por acá —descartar y posponer— fallan de forma visible sola:
 * si no se aplicaron, la tarjeta sigue en la pantalla al recargar, que es
 * exactamente lo que el piloto necesita ver. Un banner de error para "no se pudo
 * posponer un recordatorio" sería más ruido que el problema.
 */
export async function descartarProgramadoForm(id: string): Promise<void> {
  const res = await descartarProgramado(id);
  if ("error" in res && res.error) console.error("No se pudo descartar el programado", id, res.error);
}

export async function posponerProgramadoForm(id: string, hastaIso: string): Promise<void> {
  const res = await posponerProgramado(id, hastaIso);
  if ("error" in res && res.error) console.error("No se pudo posponer el programado", id, res.error);
}
