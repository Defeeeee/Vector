"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import type { RepasoVuelo } from "@/lib/repaso-vuelo";

/**
 * "Cómo fue el vuelo": lo que el ADS-B vio del avión de un plan, contra el plan
 * (`GET /planes-de-vuelo/{id}/repaso`). Es una lectura que el navegador pide al tocar el botón, no al
 * dibujar la pantalla (invariante 15), y va sin cache: el avión puede estar todavía en el aire.
 *
 * `puntos` es la ruta ya ubicada (`puntosParaElPedido`): el backend no resuelve la casilla 15.
 * Un `sin_datos` es una respuesta, no un error: que el ADS-B no lo haya visto no es que no voló.
 */
export async function repasoDelVuelo(planId: string, puntos: string): Promise<{ repaso: RepasoVuelo } | { error: string }> {
  if (!/^[\w-]{1,64}$/.test(planId)) return { error: "Ese plan no existe." };
  try {
    const q = new URLSearchParams();
    if (puntos) q.set("puntos", puntos.slice(0, 4000));
    const res = await apiFetch(`/planes-de-vuelo/${planId}/repaso${q.size ? `?${q}` : ""}`, { cache: "no-store" });
    if (!res.ok) return { error: res.status === 404 ? "Ese plan no existe." : "No se pudo leer el ADS-B de ese vuelo. Probá de nuevo en un rato." };
    return { repaso: (await res.json()) as RepasoVuelo };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}
