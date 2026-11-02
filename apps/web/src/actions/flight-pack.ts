"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function createFlightPack(formData: FormData) {
  const name = formData.get("name") as string;
  const total_hours = parseFloat(formData.get("total_hours") as string);
  const aircraft_ids = formData.getAll("aircraft_ids") as string[];
  const start_date = formData.get("start_date") as string;

  const response = await apiFetch("/flight-packs", {
    method: "POST",
    body: JSON.stringify({ 
      name, 
      total_hours, 
      aircraft_ids,
      start_date: start_date ? new Date(start_date).toISOString() : null
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create flight pack");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return await response.json();
}

export async function updateFlightPack(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const total_hours = parseFloat(formData.get("total_hours") as string);
  const aircraft_ids = formData.getAll("aircraft_ids") as string[];
  const is_active = formData.get("is_active") === "true";
  const start_date = formData.get("start_date") as string;

  const response = await apiFetch(`/flight-packs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ 
      name, 
      total_hours, 
      aircraft_ids, 
      is_active,
      start_date: start_date ? new Date(start_date).toISOString() : null
    }),
  });


  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to update flight pack");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return await response.json();
}

export async function deleteFlightPack(id: string) {
  const response = await apiFetch(`/flight-packs/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to delete flight pack");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}
