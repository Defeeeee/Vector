"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Silences a finding the pilot has judged correct as logged.
 *
 * The finding isn't deleted — the underlying flights haven't changed, so the
 * next recalculation would just recreate it. It stays and stops counting.
 */
export async function suppressFinding(findingId: string, reason?: string) {
  const response = await apiFetch(`/audit/findings/${findingId}/suppress`, {
    method: "POST",
    body: JSON.stringify({ suppressed: true, reason: reason || null }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo silenciar el hallazgo" };
  }

  revalidatePath("/dashboard/audit");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function unsuppressFinding(findingId: string) {
  const response = await apiFetch(`/audit/findings/${findingId}/suppress`, {
    method: "POST",
    body: JSON.stringify({ suppressed: false }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo reactivar el hallazgo" };
  }

  revalidatePath("/dashboard/audit");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Re-runs every rule over the whole logbook.
 *
 * Normally unnecessary — the backend recalculates on every flight write — but
 * logbooks that predate the audit engine have no findings at all until this
 * runs once.
 */
export async function recalculateAudit() {
  const response = await apiFetch("/audit/recalculate", { method: "POST" });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo recalcular la auditoría" };
  }

  revalidatePath("/dashboard/audit");
  revalidatePath("/dashboard");
  return { success: true };
}
