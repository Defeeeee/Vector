"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { validarChecklist } from "@/lib/checklist";

/**
 * Las checklists del avión (`/checklists` del backend, migración 054). Se revalidan la lista, la
 * checklist y el Hangar (donde cada avión dice cuál tiene); la pantalla de vuelo del Mapa la lee
 * con `checklistDelAvion`, sin cache (invariante 8).
 */

const LISTA = "/dashboard/tools/checklists";
const UUID_RE = /^[0-9a-f-]{36}$/i;
/** Un id de avión: el backend manda UUID; lo que se valida acá es que no se cuele una barra o un `..`. */
const ID_AVION_RE = /^[\w-]{1,64}$/;

function revalidar(id?: string) {
  revalidatePath(LISTA);
  if (id) revalidatePath(`${LISTA}/${id}`);
  revalidatePath("/dashboard/settings");
}

async function detalle(res: Response, porDefecto: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  if (typeof err?.detail === "string" && !err.detail.startsWith("Validation failed")) return err.detail;
  if (Array.isArray(err?.extra)) {
    const motivo = err.extra.map((e: { message?: string }) => e?.message).find((m: unknown) => typeof m === "string");
    if (motivo) return String(motivo).replace(/^Value error, /, "");
  }
  return porDefecto;
}

export async function crearChecklist(nombre: string): Promise<{ error: string } | { ok: true; id: string }> {
  const motivo = validarChecklist(nombre, "");
  if (motivo) return { error: motivo };
  try {
    const res = await apiFetch("/checklists", { method: "POST", body: JSON.stringify({ nombre: nombre.trim(), texto: "" }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo crear la checklist.") };
    const c = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!c?.id) return { error: "No se pudo crear la checklist." };
    revalidar(c.id);
    return { ok: true, id: c.id };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function guardarChecklist(id: string, nombre: string, texto: string): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(id)) return { error: "Esa checklist no existe." };
  const motivo = validarChecklist(nombre, texto);
  if (motivo) return { error: motivo };
  try {
    const res = await apiFetch(`/checklists/${id}`, { method: "PUT", body: JSON.stringify({ nombre: nombre.trim(), texto }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar la checklist.") };
    revalidar(id);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function borrarChecklist(id: string): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(id)) return { error: "Esa checklist no existe." };
  try {
    const res = await apiFetch(`/checklists/${id}`, { method: "DELETE" });
    if (!res.ok) return { error: await detalle(res, "No se pudo borrar la checklist.") };
    revalidar(id);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** Deja la checklist asignada exactamente a esos aviones; los demás quedan sin ella. */
export async function asignarAvionesAChecklist(id: string, aircraftIds: string[]): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(id) || aircraftIds.some((a) => !ID_AVION_RE.test(a))) return { error: "Esa checklist no existe." };
  try {
    const res = await apiFetch(`/checklists/${id}/aviones`, { method: "PUT", body: JSON.stringify({ aircraft_ids: aircraftIds }) });
    if (!res.ok) return { error: await detalle(res, "No se pudieron asignar los aviones.") };
    revalidar(id);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * La checklist asignada a un avión, para la pantalla de vuelo. `null` sólo si el avión **no tiene**
 * una asignada; si no se pudo leer, **lanza**: así quien llama sabe que "no sé" (invariante 2) y
 * puede usar la última que guardó en el teléfono, en vez de creer que no hay.
 */
export async function checklistDelAvion(aircraftId: string): Promise<{ id: string; nombre: string; texto: string } | null> {
  if (!ID_AVION_RE.test(aircraftId)) return null;
  const avion = await apiFetch(`/aircraft/${aircraftId}`, { cache: "no-store" });
  if (avion.status === 404) return null;
  if (!avion.ok) throw new Error("No se pudo leer el avión.");
  const checklistId = ((await avion.json()) as { checklist_id?: string | null }).checklist_id;
  if (!checklistId) return null;
  const res = await apiFetch(`/checklists/${checklistId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo leer la checklist.");
  const c = (await res.json()) as { id: string; nombre: string; texto: string };
  return { id: c.id, nombre: c.nombre, texto: c.texto };
}
