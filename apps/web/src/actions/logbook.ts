"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import type { AperturaPPA, Logbook } from "@/types";

/** The carried-forward hours, as the create/update endpoints expect them. */
export interface OpeningBalanceInput {
  landings?: number;
  pic_day_loc?: number;
  pic_day_tra?: number;
  pic_night_loc?: number;
  pic_night_tra?: number;
  sic_day_loc?: number;
  sic_day_tra?: number;
  sic_night_loc?: number;
  sic_night_tra?: number;
  imc_pil?: number;
  imc_cop?: number;
  capota?: number;
}

function revalidateEverythingThatCounts() {
  // An opening balance changes the totals on every aggregate screen, not just
  // the settings page it was edited from.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/summary");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/history");
}

export async function listLogbooks(): Promise<Logbook[]> {
  const response = await apiFetch("/logbooks");
  if (!response.ok) return [];
  return (await response.json()) as Logbook[];
}

export async function createLogbook(input: {
  name: string;
  description?: string;
  opening?: OpeningBalanceInput;
  renglones_por_hoja?: number;
  /** Las horas de antes de un alumno (migración 028). */
  apertura_ppa?: AperturaPPA;
}) {
  const response = await apiFetch("/logbooks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description || null,
      opening: input.opening ?? null,
      renglones_por_hoja: input.renglones_por_hoja ?? null,
      ...(input.apertura_ppa ? { apertura_ppa: input.apertura_ppa } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo crear el libro" };
  }

  revalidateEverythingThatCounts();
  return { success: true };
}

export async function updateLogbook(
  id: string,
  input: { name?: string; description?: string; opening?: OpeningBalanceInput; renglones_por_hoja?: number; apertura_ppa?: AperturaPPA }
) {
  const response = await apiFetch(`/logbooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo actualizar el libro" };
  }

  revalidateEverythingThatCounts();
  return { success: true };
}

/**
 * Deletes a logbook.
 *
 * The backend refuses when the book still holds flights and says how many, so
 * the message is surfaced as-is rather than replaced by a generic failure —
 * "tiene 39 vuelos" tells the pilot what to do next; "no se pudo borrar" does
 * not.
 */
export async function deleteLogbook(id: string) {
  const response = await apiFetch(`/logbooks/${id}`, { method: "DELETE" });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo borrar el libro" };
  }

  revalidateEverythingThatCounts();
  return { success: true };
}
