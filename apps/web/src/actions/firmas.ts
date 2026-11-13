"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { revalidarLoQueCambiaUnVuelo } from "@/lib/revalidar-vuelo";

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
  pngSello?: string | null;
  alias?: string[];
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
        ...(datos.pngSello ? { png_sello: datos.pngSello } : {}),
        ...(datos.alias?.length ? { alias: datos.alias } : {}),
      }),
    },
    "No se pudo guardar la firma."
  );
}

export async function borrarFirmaCertificante(id: string) {
  const r = await enviar(`/firmas/certificantes/${id}`, { method: "DELETE" }, "No se pudo borrar la firma.");
  // Sus vuelos quedan sin certificante (`on delete set null`): la Bitácora lo muestra.
  if ("ok" in r) revalidatePath("/dashboard/history");
  return r;
}

/** Lo que se cambia de una persona ya guardada. `pngSello: null` quita el sello. */
export async function editarCertificante(
  id: string,
  cambios: { nombre?: string; licencia?: string | null; autoridadId?: number | null; png?: string; pngSello?: string | null; alias?: string[]; automatica?: boolean }
) {
  const cuerpo: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) cuerpo.nombre = cambios.nombre;
  if (cambios.licencia !== undefined) cuerpo.licencia = cambios.licencia?.trim() || null;
  if (cambios.autoridadId !== undefined) cuerpo.autoridad_id = cambios.autoridadId;
  if (cambios.png !== undefined) cuerpo.png = cambios.png;
  if (cambios.pngSello !== undefined) cuerpo.png_sello = cambios.pngSello;
  if (cambios.alias !== undefined) cuerpo.alias = cambios.alias;
  if (cambios.automatica !== undefined) cuerpo.automatica = cambios.automatica;
  return enviar(`/firmas/certificantes/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) }, "No se pudo guardar el cambio.");
}

export interface ResultadoAsignacion {
  asignados: number;
  completados: number;
  avisos: { vuelo_id: string; mensaje: string }[];
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
/** El backend acepta hasta 200 por pedido; se manda de a 100. */
const TANDA = 100;

/**
 * Pone a una persona como quien certificó esos vuelos. `firma`: null = lo que diga la persona,
 * "si" o "no" para anularlo en estos vuelos. Un vuelo sin certificante para el CAD toma su nombre;
 * uno que ya dice otro no se pisa y vuelve en `avisos`. Revalida la Bitácora y el Hangar
 * (invariante 8). **Pasar al CAD** compara la autoridad: lo completado puede aparecer allá.
 */
export async function asignarCertificante(
  certificanteId: string,
  vueloIds: string[],
  firma: "si" | "no" | null,
  sumarAlias?: string
): Promise<{ error: string } | ({ ok: true } & ResultadoAsignacion)> {
  const ids = (Array.isArray(vueloIds) ? vueloIds : []).filter((i) => UUID_RE.test(String(i)));
  if (!UUID_RE.test(certificanteId) || !ids.length) return { error: "Elegí la persona y al menos un vuelo." };
  const total: ResultadoAsignacion = { asignados: 0, completados: 0, avisos: [] };
  try {
    for (let i = 0; i < ids.length; i += TANDA) {
      const res = await apiFetch(`/firmas/certificantes/${certificanteId}/vuelos`, {
        method: "POST",
        body: JSON.stringify({ vuelo_ids: ids.slice(i, i + TANDA), firma, ...(i === 0 && sumarAlias ? { sumar_alias: sumarAlias } : {}) }),
      });
      if (!res.ok) {
        const parcial = total.asignados ? ` Se guardaron ${total.asignados} de ${ids.length}.` : "";
        return { error: `${await detalle(res, "No se pudo asignar.")}${parcial}` };
      }
      const r = (await res.json()) as ResultadoAsignacion;
      total.asignados += r.asignados;
      total.completados += r.completados;
      total.avisos.push(...r.avisos);
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
  revalidarLoQueCambiaUnVuelo();
  revalidatePath(HANGAR);
  return { ok: true, ...total };
}

/** Le saca el certificante a los vuelos. No toca el nombre que ya está para el CAD. */
export async function desasociarCertificante(vueloIds: string[]) {
  const ids = (Array.isArray(vueloIds) ? vueloIds : []).filter((i) => UUID_RE.test(String(i)));
  if (!ids.length) return { error: "Elegí al menos un vuelo." };
  try {
    for (let i = 0; i < ids.length; i += 40) {
      const res = await apiFetch(`/firmas/certificantes/vuelos?vuelo_ids=${ids.slice(i, i + 40).join(",")}`, { method: "DELETE" });
      if (!res.ok) return { error: await detalle(res, "No se pudo desasociar.") };
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
  revalidarLoQueCambiaUnVuelo();
  revalidatePath(HANGAR);
  return { ok: true as const };
}

export async function guardarDorso(datos: {
  logbookId: string;
  hoja: number;
  png: string | null;
  aclaracion: string;
  fecha: string;
  certificanteIds?: string[];
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
        certificante_ids: datos.certificanteIds ?? [],
      }),
    },
    "No se pudo guardar el dorso."
  );
}

export async function borrarDorso(id: string) {
  return enviar(`/firmas/dorsos/${id}`, { method: "DELETE" }, "No se pudo borrar el dorso.");
}
