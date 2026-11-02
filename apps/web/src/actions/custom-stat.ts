"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { CustomStat } from "@/lib/custom-stats";

/**
 * Métricas propias del piloto.
 *
 * Sólo la definición viaja: el cálculo pasa en el cliente, sobre los vuelos que el
 * dashboard ya tiene cargados.
 */

/** Lo que la API acepta. Es el modelo del backend, en snake_case. */
interface CustomStatPayload {
  name: string;
  metric: string;
  aircraft_id?: string | null;
  clase?: string | null;
  purpose?: string | null;
  airport?: string | null;
  window_days?: number | null;
  target?: number | null;
  regex_field?: string | null;
  regex_pattern?: string | null;
}

/** La API habla snake_case y el motor de evaluación camelCase. */
export async function fromApi(row: Record<string, unknown>): Promise<CustomStat> {
  return {
    id: String(row.id),
    name: String(row.name),
    metric: row.metric as CustomStat["metric"],
    aircraftId: (row.aircraft_id as string) ?? null,
    clase: (row.clase as string) ?? null,
    purpose: (row.purpose as string) ?? null,
    airport: (row.airport as string) ?? null,
    windowDays: (row.window_days as number) ?? null,
    target: (row.target as number) ?? null,
    regexField: (row.regex_field as CustomStat["regexField"]) ?? null,
    regexPattern: (row.regex_pattern as string) ?? null,
  };
}

function revalidate() {
  // Las métricas se ven en el Resumen y se editan en el Hangar. Vivían en el inicio
  // hasta septiembre de 2026; si se mudan otra vez, esta lista se muda con ellas o
  // la métrica recién creada tarda en aparecer lo que dure el cache de `apiFetch`.
  revalidatePath("/dashboard/summary");
  revalidatePath("/dashboard/settings");
}

export async function listCustomStats(): Promise<CustomStat[]> {
  const res = await apiFetch("/custom-stats");
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return Promise.all(rows.map(fromApi));
}

export async function createCustomStat(payload: CustomStatPayload) {
  const res = await apiFetch("/custom-stats", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "No se pudo crear la métrica");
  }
  revalidate();
}

export async function deleteCustomStat(id: string) {
  const res = await apiFetch(`/custom-stats/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "No se pudo borrar la métrica");
  }
  revalidate();
}
