"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { borrarImportacion } from "@/lib/importar-libro-servidor";
import { revalidarLoQueCambiaUnVuelo } from "@/lib/revalidar-vuelo";
import { normalizarMatricula } from "@/lib/importar-libro";

export interface AvionParaCrear {
  registration: string;
  type: string;
  icao: string;
  type_acft: string | null;
}

/**
 * Agrega al Hangar los aviones del libro que el piloto dejó tildados (migración 059): con
 * matrícula y modelo, marcados como incompletos. Idempotente por matrícula en el backend: un
 * reintento tras una falla no duplica. Devuelve el id de cada uno por su matrícula normalizada.
 */
export async function crearAvionesDelLibro(
  aviones: AvionParaCrear[]
): Promise<{ error: string } | { ids: Record<string, string>; creados: number }> {
  if (aviones.length === 0) return { ids: {}, creados: 0 };
  try {
    const res = await apiFetch("/aircraft/desde-libro", { method: "POST", body: JSON.stringify({ aviones }), cache: "no-store" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return { error: (typeof e.detail === "string" && e.detail) || "No pudimos agregar los aviones a tu Hangar." };
    }
    const filas = (await res.json()) as { id: string; registration: string; datos_completos?: boolean }[];
    const ids: Record<string, string> = {};
    for (const f of filas) ids[normalizarMatricula(f.registration)] = f.id;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/log-flight");
    return { ids, creados: filas.filter((f) => f.datos_completos === false).length };
  } catch (err: any) {
    return { error: err?.message || "No pudimos agregar los aviones a tu Hangar." };
  }
}

/** Cierra una importación: 'importado' (ya está en la bitácora) o 'descartado'. Borra el archivo. */
export async function cerrarImportacion(id: string, como: "importado" | "descartado"): Promise<{ ok: boolean }> {
  try {
    const res = await apiFetch(`/importaciones-libro/${id}/${como === "importado" ? "importado" : "descartar"}`, { method: "POST", cache: "no-store" });
    if (res.ok) await borrarImportacion(id);
    revalidatePath("/dashboard/log-flight/import");
    if (como === "importado") revalidarLoQueCambiaUnVuelo();
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
