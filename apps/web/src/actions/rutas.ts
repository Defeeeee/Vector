"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import type { RutaGuardada } from "@/lib/rutas-guardadas";

/**
 * Las rutas guardadas del Mapa (`/rutas` del backend, migración 039). La tarjeta del Mapa es
 * dueña de su lista: lo que vuelve de acá se suma o se saca en el cliente, sin revalidar
 * (el Mapa es un portal que no se vuelve a dibujar entero por una ruta).
 */

async function detalle(res: Response, porDefecto: string): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    return typeof j.detail === "string" ? j.detail : porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function guardarRuta(datos: {
  nombre: string;
  ruta: string;
  aircraftId: string | null;
}): Promise<{ ruta: RutaGuardada } | { error: string }> {
  try {
    const res = await apiFetch("/rutas", {
      method: "POST",
      body: JSON.stringify({ nombre: datos.nombre, ruta: datos.ruta, aircraft_id: datos.aircraftId }),
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar la ruta.") };
    return { ruta: (await res.json()) as RutaGuardada };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function borrarRuta(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(`/rutas/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return { error: await detalle(res, "No se pudo borrar la ruta.") };
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}
