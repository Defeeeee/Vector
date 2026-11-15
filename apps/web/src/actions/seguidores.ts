"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { seguidoresDeRespuesta, type Seguidor } from "@/lib/seguidores";
import { TRACKER_URL } from "@/lib/sitio";

/**
 * Los seguidores del piloto (`/seguidores` del backend, migración 056): generar y anular links de
 * invitación a Vector Tracker, quitar a alguien y asignar qué vuelo ve cada uno. Todo lo escribe y lo
 * revalida la pantalla "Compartir tu vuelo" (invariante 8); la lectura va sin cache.
 */

const PANTALLA = "/dashboard/mapa/compartir";

async function detalle(res: Response, porDefecto: string): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    return typeof j.detail === "string" ? j.detail : porDefecto;
  } catch {
    return porDefecto;
  }
}

/** `null` si no se pudo leer: la pantalla no dice "no tenés seguidores" de lo que no sabe (invariante 2). */
export async function leerSeguidores(): Promise<Seguidor[] | null> {
  try {
    const res = await apiFetch("/seguidores", { cache: "no-store" });
    if (!res.ok) return null;
    return seguidoresDeRespuesta(await res.json().catch(() => null), TRACKER_URL);
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return null;
  }
}

/** Genera un link de invitación (de un solo uso, vence a los 7 días) con un apodo opcional. */
export async function invitarSeguidor(apodo: string): Promise<{ seguidor: Seguidor } | { error: string }> {
  try {
    const res = await apiFetch("/seguidores", { method: "POST", body: JSON.stringify({ apodo: apodo.trim() || null }), cache: "no-store" });
    if (!res.ok) return { error: await detalle(res, "No se pudo crear la invitación.") };
    const [seguidor] = seguidoresDeRespuesta([await res.json()], TRACKER_URL);
    if (!seguidor) return { error: "No se pudo crear la invitación." };
    revalidatePath(PANTALLA);
    return { seguidor };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo crear la invitación. Probá de nuevo." };
  }
}

export async function renombrarSeguidor(id: string, apodo: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(`/seguidores/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ apodo: apodo.trim() || null }), cache: "no-store" });
    if (!res.ok) return { error: await detalle(res, "No se pudo cambiar el apodo.") };
    revalidatePath(PANTALLA);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo cambiar el apodo. Probá de nuevo." };
  }
}

/** Anula una invitación pendiente o quita a un seguidor: deja de ver todo al instante. */
export async function quitarSeguidor(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(`/seguidores/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
    // Un 404 es que ya no estaba: lo que se quería ya pasó.
    if (!res.ok && res.status !== 404) return { error: await detalle(res, "No se pudo quitar.") };
    revalidatePath(PANTALLA);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo quitar. Probá de nuevo." };
  }
}

/** Quiénes ven este vuelo en el tracker: la lista completa (reemplaza). A quien se suma le llega un aviso. */
export async function asignarSeguidores(seguimientoId: string, seguidorIds: string[]): Promise<{ ok: true; seguidorIds: string[] } | { error: string }> {
  try {
    const res = await apiFetch(`/seguimientos/${encodeURIComponent(seguimientoId)}/seguidores`, { method: "PUT", body: JSON.stringify({ seguidor_ids: seguidorIds }), cache: "no-store" });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar quiénes ven este vuelo.") };
    const j = (await res.json().catch(() => null)) as { seguidor_ids?: unknown } | null;
    revalidatePath(PANTALLA);
    return { ok: true, seguidorIds: Array.isArray(j?.seguidor_ids) ? (j.seguidor_ids as unknown[]).filter((x): x is string => typeof x === "string") : seguidorIds };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo guardar. Probá de nuevo." };
  }
}
