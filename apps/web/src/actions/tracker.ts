"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";

/**
 * Vector Tracker: aceptar un link de invitación (`POST /tracker/invitaciones/{token}/aceptar`, migración
 * 056). Con sesión; el token es de un solo uso y vence a los 7 días. No revalida nada: el tracker lee sus
 * listas sin cache.
 */
export async function aceptarInvitacion(token: string): Promise<{ piloto: string; yaSeguia: boolean } | { error: string }> {
  try {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { error: "Esta invitación no es válida." };
    const res = await apiFetch(`/tracker/invitaciones/${encodeURIComponent(token)}/aceptar`, { method: "POST", cache: "no-store" });
    const j = (await res.json().catch(() => null)) as { piloto?: { nombre?: string }; ya_seguia?: boolean; detail?: unknown } | null;
    if (res.status === 401) return { error: "Tu sesión venció. Entrá de nuevo con Google." };
    if (!res.ok) return { error: typeof j?.detail === "string" ? j.detail : "No se pudo aceptar la invitación." };
    return { piloto: j?.piloto?.nombre || "el piloto", yaSeguia: j?.ya_seguia === true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo aceptar la invitación. Probá de nuevo." };
  }
}
