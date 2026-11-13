"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";

/**
 * Las firmas de los certificantes y el dorso de cada hoja del libro (`/firmas` del backend,
 * migración 047). **Sólo sirven para el PDF del libro del piloto**: nada de esto se publica ni
 * se comparte. Se revalida el Hangar, donde se leen (invariante 8); el PDF se pide sin cache.
 */

const HANGAR = "/dashboard/settings";

async function detalle(res: Response, porDefecto: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return typeof err?.detail === "string" ? err.detail : porDefecto;
}

async function enviar(ruta: string, init: RequestInit, porDefecto: string): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await apiFetch(ruta, init);
    if (!res.ok) return { error: await detalle(res, porDefecto) };
    revalidatePath(HANGAR);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function guardarFirmaCertificante(datos: {
  nombre: string;
  licencia: string;
  autoridadId: number | null;
  png: string;
}) {
  if (!datos.nombre.trim()) return { error: "Falta la aclaración: el nombre de quien certifica." };
  return enviar(
    "/firmas/certificantes",
    {
      method: "PUT",
      body: JSON.stringify({
        nombre: datos.nombre,
        licencia: datos.licencia.trim() || null,
        autoridad_id: datos.autoridadId,
        png: datos.png,
      }),
    },
    "No se pudo guardar la firma."
  );
}

export async function borrarFirmaCertificante(id: string) {
  return enviar(`/firmas/certificantes/${id}`, { method: "DELETE" }, "No se pudo borrar la firma.");
}

export async function guardarDorso(datos: {
  logbookId: string;
  hoja: number;
  png: string | null;
  aclaracion: string;
  fecha: string;
}) {
  return enviar(
    "/firmas/dorsos",
    {
      method: "PUT",
      body: JSON.stringify({
        logbook_id: datos.logbookId,
        hoja: datos.hoja,
        png: datos.png,
        aclaracion: datos.aclaracion.trim() || null,
        fecha: datos.fecha || null,
      }),
    },
    "No se pudo guardar el dorso."
  );
}

export async function borrarDorso(id: string) {
  return enviar(`/firmas/dorsos/${id}`, { method: "DELETE" }, "No se pudo borrar el dorso.");
}
