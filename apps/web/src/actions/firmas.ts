"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { MAX_ACLARACION_DORSO, MAX_LARGO_TEXTO_DORSO, MAX_TEXTOS_DORSO } from "@/lib/firmas-libro";
import { revalidarLoQueCambiaUnVuelo } from "@/lib/revalidar-vuelo";

/**
 * Las firmas de los certificantes y el dorso de cada hoja del libro (`/firmas` del backend,
 * migración 047). **Sólo sirven para el PDF del libro del piloto**: nada de esto se publica ni
 * se comparte. Se revalida el Hangar, donde se leen (invariante 8); el PDF se pide sin cache.
 */

const HANGAR = "/dashboard/settings";
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Lo que el backend (Litestar) dice de un campo que no pasó la validación, en palabras del piloto. */
const CAMPOS: Record<string, string> = {
  aclaracion: "La aclaración puede tener hasta 160 letras. Para un texto más largo (una habilitación, una constancia), agregalo en «Textos del dorso».",
  textos: "Cada texto del dorso puede tener hasta 600 letras, y van hasta 12 por hoja.",
  nombre: "El nombre es demasiado largo.",
  etiqueta: "El nombre del sello es demasiado largo (hasta 60 letras).",
  nombre_cad: "El nombre para el CAD es demasiado largo (hasta 160 letras).",
};

async function detalle(res: Response, porDefecto: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  if (typeof err?.detail !== "string") return porDefecto;
  // "Validation failed for PUT /api/…" no le dice nada al piloto: se traduce el campo que falló.
  if (err.detail.startsWith("Validation failed")) {
    const extra = Array.isArray(err.extra) ? err.extra : [];
    for (const e of extra) {
      const clave = String(e?.key ?? "").split(/[.[]/)[0];
      if (CAMPOS[clave]) return CAMPOS[clave];
    }
    return `${porDefecto} Algún dato no es válido: revisá lo que escribiste.`;
  }
  return err.detail;
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
  alias?: string[];
  /** Su primer sello, si lo sacó en el alta (migración 049): va en un segundo pedido, una imagen por vez. */
  sello?: { png: string; etiqueta: string; autoridadId: number | null; nombreCad?: string } | null;
}): Promise<{ error: string } | { ok: true }> {
  if (!datos.nombre.trim()) return { error: "Falta la aclaración: el nombre de quien certifica." };
  try {
    const res = await apiFetch("/firmas/certificantes", {
      method: "PUT",
      body: JSON.stringify({
        nombre: datos.nombre,
        licencia: datos.licencia.trim() || null,
        autoridad_id: datos.autoridadId,
        png: datos.png,
        ...(datos.alias?.length ? { alias: datos.alias } : {}),
      }),
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar la firma.") };
    const persona = (await res.json().catch(() => null)) as { id?: string } | null;
    if (datos.sello && persona?.id) {
      const r = await apiFetch(`/firmas/certificantes/${persona.id}/sellos`, { method: "POST", body: JSON.stringify(cuerpoDeSello(datos.sello)) });
      if (!r.ok) {
        revalidatePath(HANGAR);
        return { error: `La firma quedó guardada, pero no el sello: ${await detalle(r, "No se pudo guardar el sello.")}` };
      }
    }
    revalidatePath(HANGAR);
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

function cuerpoDeSello(s: { png?: string; etiqueta?: string; autoridadId?: number | null; nombreCad?: string | null }) {
  return {
    ...(s.etiqueta !== undefined ? { etiqueta: s.etiqueta.trim() } : {}),
    ...(s.autoridadId !== undefined ? { autoridad_id: s.autoridadId } : {}),
    ...(s.nombreCad !== undefined ? { nombre_cad: s.nombreCad?.trim() || null } : {}),
    ...(s.png !== undefined ? { png: s.png } : {}),
  };
}

/** Un sello más de la persona (migración 049): una imagen por pedido, el cuerpo de una server action tiene tope. */
export async function agregarSello(certificanteId: string, sello: { png: string; etiqueta: string; autoridadId: number | null; nombreCad?: string }) {
  if (!UUID_RE.test(certificanteId)) return { error: "Esa persona no existe." };
  if (!sello.etiqueta.trim()) return { error: "Poné una etiqueta al sello, por ejemplo «Jefe de instructores»." };
  return enviar(`/firmas/certificantes/${certificanteId}/sellos`, { method: "POST", body: JSON.stringify(cuerpoDeSello(sello)) }, "No se pudo guardar el sello.");
}

/** Cambia la etiqueta, el cargo, el nombre para el CAD o la imagen de un sello (lo que venga). */
export async function editarSello(id: string, cambios: { etiqueta?: string; autoridadId?: number | null; nombreCad?: string | null; png?: string }) {
  if (!UUID_RE.test(id)) return { error: "Ese sello no existe." };
  return enviar(`/firmas/sellos/${id}`, { method: "PATCH", body: JSON.stringify(cuerpoDeSello(cambios)) }, "No se pudo guardar el cambio.");
}

/** Quita un sello: sus vuelos quedan sin sello (siguen con su persona) y un dorso que lo elegía lo ignora. */
export async function quitarSello(id: string) {
  if (!UUID_RE.test(id)) return { error: "Ese sello no existe." };
  const r = await enviar(`/firmas/sellos/${id}`, { method: "DELETE" }, "No se pudo quitar el sello.");
  if ("ok" in r) revalidatePath("/dashboard/history");
  return r;
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
  cambios: { nombre?: string; licencia?: string | null; autoridadId?: number | null; png?: string; alias?: string[]; automatica?: boolean }
) {
  const cuerpo: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) cuerpo.nombre = cambios.nombre;
  if (cambios.licencia !== undefined) cuerpo.licencia = cambios.licencia?.trim() || null;
  if (cambios.autoridadId !== undefined) cuerpo.autoridad_id = cambios.autoridadId;
  if (cambios.png !== undefined) cuerpo.png = cambios.png;
  if (cambios.alias !== undefined) cuerpo.alias = cambios.alias;
  if (cambios.automatica !== undefined) cuerpo.automatica = cambios.automatica;
  return enviar(`/firmas/certificantes/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) }, "No se pudo guardar el cambio.");
}

export interface ResultadoAsignacion {
  asignados: number;
  completados: number;
  avisos: { vuelo_id: string; mensaje: string }[];
}

/** El backend acepta hasta 200 por pedido; se manda de a 100. */
const TANDA = 100;

/**
 * Pone a una persona como quien certificó esos vuelos. `firma`: null = lo que diga la persona,
 * "si" o "no" para anularlo en estos vuelos. Un vuelo sin certificante para el CAD toma su nombre;
 * uno que ya dice otro no se pisa y vuelve en `avisos`. Con `selloId`, certificó con ese sello/cargo (migración 049). Revalida la Bitácora y el Hangar
 * (invariante 8). **Pasar al CAD** compara la autoridad: lo completado puede aparecer allá.
 */
export async function asignarCertificante(
  certificanteId: string,
  vueloIds: string[],
  firma: "si" | "no" | null,
  sumarAlias?: string,
  selloId?: string | null
): Promise<{ error: string } | ({ ok: true } & ResultadoAsignacion)> {
  const ids = (Array.isArray(vueloIds) ? vueloIds : []).filter((i) => UUID_RE.test(String(i)));
  if (!UUID_RE.test(certificanteId) || !ids.length) return { error: "Elegí la persona y al menos un vuelo." };
  const total: ResultadoAsignacion = { asignados: 0, completados: 0, avisos: [] };
  try {
    for (let i = 0; i < ids.length; i += TANDA) {
      const res = await apiFetch(`/firmas/certificantes/${certificanteId}/vuelos`, {
        method: "POST",
        body: JSON.stringify({ vuelo_ids: ids.slice(i, i + TANDA), firma, ...(selloId && UUID_RE.test(selloId) ? { sello_id: selloId } : {}), ...(i === 0 && sumarAlias ? { sumar_alias: sumarAlias } : {}) }),
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

/** Aclaración, fecha, sellos y textos del dorso. **Las fotos van aparte** (`agregarFotoDorso`), una por pedido. */
export async function guardarDorso(datos: {
  logbookId: string;
  hoja: number;
  aclaracion: string;
  fecha: string;
  selloIds?: string[];
  /** Los textos con la firma que los avala (migración 050): `foto:<id>`, `sello:<id>` o nada. */
  textos?: { texto: string; firma: string | null }[];
}) {
  if (datos.aclaracion.trim().length > MAX_ACLARACION_DORSO) {
    return { error: `La aclaración puede tener hasta ${MAX_ACLARACION_DORSO} letras. Para un texto más largo (una habilitación, una constancia), agregalo en «Textos del dorso».` };
  }
  const textos = (datos.textos ?? [])
    .map((t) => ({ texto: t.texto.trim(), firma: t.firma && /^(foto|sello):[0-9a-f-]{36}$/i.test(t.firma) ? t.firma : null }))
    .filter((t) => t.texto);
  if (textos.some((t) => t.texto.length > MAX_LARGO_TEXTO_DORSO)) return { error: `Cada texto del dorso puede tener hasta ${MAX_LARGO_TEXTO_DORSO} letras.` };
  if (textos.length > MAX_TEXTOS_DORSO) return { error: `Van hasta ${MAX_TEXTOS_DORSO} textos por dorso.` };
  return enviar(
    "/firmas/dorsos",
    {
      method: "PUT",
      body: JSON.stringify({
        logbook_id: datos.logbookId,
        hoja: datos.hoja,
        aclaracion: datos.aclaracion.trim() || null,
        fecha: datos.fecha || null,
        sello_ids: (datos.selloIds ?? []).filter((i) => UUID_RE.test(i)),
        ...(datos.textos ? { textos } : {}),
      }),
    },
    "No se pudo guardar el dorso."
  );
}

/**
 * Una foto más para el dorso de una hoja (hasta 12). Una por pedido: el cuerpo de una server action
 * tiene tope de 1 MB y cada PNG puede pesar ~330 KB.
 */
export async function agregarFotoDorso(datos: { logbookId: string; hoja: number; png: string }) {
  return enviar(
    "/firmas/dorsos/fotos",
    { method: "POST", body: JSON.stringify({ logbook_id: datos.logbookId, hoja: datos.hoja, png: datos.png }) },
    "No se pudo guardar la foto."
  );
}

export async function quitarFotoDorso(id: string) {
  if (!UUID_RE.test(id)) return { error: "Esa foto no existe." };
  return enviar(`/firmas/dorsos/fotos/${id}`, { method: "DELETE" }, "No se pudo quitar la foto.");
}

export async function borrarDorso(id: string) {
  return enviar(`/firmas/dorsos/${id}`, { method: "DELETE" }, "No se pudo borrar el dorso.");
}

/** La foto del sello real para el frente de la hoja de un vuelo (migración 051). Una por pedido. */
export async function agregarConstancia(datos: { vueloId: string; png: string }) {
  if (!UUID_RE.test(datos.vueloId)) return { error: "Elegí un vuelo." };
  return enviar("/firmas/constancias", { method: "POST", body: JSON.stringify({ flight_id: datos.vueloId, png: datos.png }) }, "No se pudo guardar la constancia.");
}

export async function quitarConstancia(id: string) {
  if (!UUID_RE.test(id)) return { error: "Esa constancia no existe." };
  return enviar(`/firmas/constancias/${id}`, { method: "DELETE" }, "No se pudo quitar la constancia.");
}
