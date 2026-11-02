"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";

/**
 * Los avisos push de la red, del lado de la app: la clave para suscribirse y el alta y
 * la baja de este navegador (`/push/...` del backend, migración 021). Los manda el
 * backend (`services/avisos.py`); los muestra el service worker.
 *
 * No revalidan nada: ninguna pantalla lista las suscripciones.
 */

/** La clave pública VAPID, o `null` si este servidor no tiene los avisos configurados. */
export async function clavePush(): Promise<string | null> {
  try {
    const res = await apiFetch("/push/clave", { cache: "no-store" });
    if (!res.ok) return null;
    const datos = (await res.json().catch(() => null)) as { clave?: string | null } | null;
    return datos?.clave || null;
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return null;
  }
}

export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Dar de alta este navegador. Si antes era de otra cuenta, pasa a ésta (ver el backend). */
export async function guardarSuscripcionPush(s: SuscripcionPush): Promise<boolean> {
  if (!s?.endpoint?.startsWith("https://") || !s.keys?.p256dh || !s.keys?.auth) return false;
  try {
    const res = await apiFetch("/push/suscripcion", {
      method: "POST",
      body: JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }),
    });
    return res.ok;
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return false;
  }
}

export async function borrarSuscripcionPush(endpoint: string): Promise<boolean> {
  if (!endpoint?.startsWith("https://")) return false;
  try {
    const res = await apiFetch("/push/baja", { method: "POST", body: JSON.stringify({ endpoint }) });
    return res.ok;
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return false;
  }
}
