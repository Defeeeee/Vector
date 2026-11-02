"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function toggleTrackingMode(profileId: string, mode: 'packs' | 'balance') {
  if (!profileId) {
    throw new Error("ID de perfil no encontrado");
  }

  const response = await apiFetch(`/profiles/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({
      tracking_mode: mode
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Error al cambiar el modo de seguimiento");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/balance");
  revalidatePath("/dashboard/settings");
}

export async function depositBalance(amount: number, description?: string) {
  if (amount === 0) {
    throw new Error("El monto no puede ser cero");
  }

  const response = await apiFetch("/transactions/deposit", {
    method: "POST",
    body: JSON.stringify({
      amount,
      type: "deposit",
      description: description || "Carga de saldo"
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Error al realizar la carga de saldo");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/balance");
}

export async function updateAircraftCost(aircraftId: string, costPerHour: number) {
  if (!aircraftId) {
    throw new Error("ID de aeronave no encontrado");
  }

  const response = await apiFetch(`/aircraft/${aircraftId}`, {
    method: "PATCH",
    body: JSON.stringify({
      cost_per_hour: costPerHour
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Error al actualizar la tarifa de la aeronave");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/balance");
  revalidatePath("/dashboard/settings");
}

export async function deleteTransactionAction(transactionId: string) {
  if (!transactionId) {
    throw new Error("ID de transacción no encontrado");
  }

  const response = await apiFetch(`/transactions/${transactionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Error al eliminar la transacción");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/balance");
}

/**
 * Cuántos vuelos quedaron sin cobro registrado, y por cuánta plata.
 *
 * Sólo consulta. El botón necesita poder decir "faltan 39 vuelos, $X" **antes** de
 * que el piloto acepte, porque lo que sigue escribe en su historial de saldo.
 */
export async function previewBackfillCobros() {
  const response = await apiFetch("/transactions/backfill");
  if (!response.ok) return { vuelos: 0, total: 0, aplicable: false };
  return (await response.json()) as { vuelos: number; total: number; aplicable: boolean };
}

/**
 * Graba los cobros históricos que faltan, **sin mover el saldo**.
 *
 * Los vuelos cargados antes de pasar a modo saldo nunca generaron transacción, así
 * que la bitácora no puede decir cuánto salió cada uno. Esto las escribe, y junto a
 * ellas una única transacción de ajuste por la suma exacta: los cobros son un
 * registro histórico del costo, no plata nueva que salió de la cuenta. El neto
 * sobre el saldo es cero. Ver el docstring de `aplicar_backfill` en el backend.
 */
export async function aplicarBackfillCobros() {
  const response = await apiFetch("/transactions/backfill", { method: "POST" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudieron incorporar los cobros" };
  }
  const data = (await response.json()) as { vuelos: number; total: number };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/balance");
  revalidatePath("/dashboard/history");
  return { success: true, ...data };
}
