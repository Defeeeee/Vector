"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { normalizarHandle, problemaDelHandle, rutaPerfil } from "@/lib/handle";
import { mensajeDeErrorApi } from "@/lib/social";
import { leerPublicaciones, prepararComentarios, type OrigenPublicaciones } from "@/lib/publicaciones-servidor";
import type {
  Comentario,
  EstadoAplauso,
  PerfilPublico,
  PilotoResumen,
  Publicacion,
  RelacionSocial,
  Visibilidad,
} from "@/types";

/**
 * La red social, del lado de la app. Las acciones del @ y de seguir revalidan lo que
 * cambia:
 *
 * - el layout del dashboard, porque el punto rojo y la foto del encabezado viven ahí y
 *   `revalidatePath("/dashboard", "layout")` alcanza a todas sus pantallas;
 * - el perfil público de los pilotos involucrados, `/u/<handle>`.
 *
 * `apiFetch` cachea los GET 20 s: una pantalla que falte acá mostraría el estado viejo
 * de un seguimiento que el piloto acaba de cambiar.
 *
 * Las de publicaciones, aplausos y comentarios **no** revalidan: ver su sección, abajo.
 */

type Resultado<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Los ids de la red son UUID: cualquier otra cosa ni siquiera se le pregunta al backend. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidarRed(...handles: (string | null | undefined)[]) {
  revalidatePath("/dashboard", "layout");
  for (const h of handles) if (h) revalidatePath(rutaPerfil(h));
}

async function cuerpo(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

async function enviar<T>(
  ruta: string,
  metodo: "POST" | "PUT" | "DELETE",
  porDefecto: string,
  body?: unknown
): Promise<Resultado<{ datos: T }>> {
  try {
    const res = await apiFetch(ruta, {
      method: metodo,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const datos = await cuerpo(res);
    if (!res.ok) return { ok: false, error: mensajeDeErrorApi(datos, porDefecto) };
    return { ok: true, datos: datos as T };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { ok: false, error: porDefecto };
  }
}

// ---------------------------------------------------------------------------
// El @ propio
// ---------------------------------------------------------------------------

export interface DatosPerfilPublico {
  handle: string;
  nombre_visible: string;
  licencia?: string | null;
  bio?: string | null;
  visibilidad: Visibilidad;
}

export async function guardarPerfilPublico(
  datos: DatosPerfilPublico,
  handleAnterior?: string | null
): Promise<Resultado<{ perfil: PerfilPublico }>> {
  const r = await enviar<PerfilPublico>("/perfil-publico", "PUT", "No se pudo guardar tu perfil.", {
    ...datos,
    handle: normalizarHandle(datos.handle),
  });
  if (!r.ok) return r;
  // El handle viejo también: si cambió, su página tiene que dejar de mostrarlo.
  revalidarRed(r.datos.handle, handleAnterior);
  revalidatePath("/dashboard/settings");
  return { ok: true, perfil: r.datos };
}

export async function salirDeLaRed(handleActual: string): Promise<Resultado<object>> {
  const r = await enviar("/perfil-publico", "DELETE", "No se pudo borrar tu perfil.");
  if (!r.ok) return r;
  revalidarRed(handleActual);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Si un @ está libre, para avisar mientras se tipea. `true` también si es el propio:
 * guardarlo sin cambios no es un conflicto.
 */
export async function handleDisponible(handle: string, propio?: string | null): Promise<boolean | null> {
  const h = normalizarHandle(handle);
  if (propio && normalizarHandle(propio) === h) return true;
  try {
    const res = await apiFetch(`/publico/pilotos/${encodeURIComponent(h)}`, { cache: "no-store" }, { anonimo: true });
    if (res.status === 404) return true;
    if (res.ok) return false;
    return null; // No se pudo preguntar: el backend decide al guardar.
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Buscar y seguir
// ---------------------------------------------------------------------------

export async function buscarPilotos(q: string): Promise<PilotoResumen[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  try {
    const res = await apiFetch(`/pilotos?q=${encodeURIComponent(texto)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as PilotoResumen[]) : [];
  } catch {
    return [];
  }
}

/**
 * Qué relación hay con un piloto, o `null` si no se pudo saber (o no existe, o te
 * bloqueó: el backend contesta 404 igual). Sólo lee.
 */
export async function relacionConPiloto(handle: string): Promise<RelacionSocial | null> {
  const h = normalizarHandle(handle);
  if (problemaDelHandle(h)) return null;
  try {
    const res = await apiFetch(`/publico/pilotos/${encodeURIComponent(h)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { relacion?: RelacionSocial }).relacion ?? null;
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return null;
  }
}

export async function seguirPiloto(handle: string): Promise<Resultado<{ relacion: RelacionSocial }>> {
  const h = normalizarHandle(handle);
  const r = await enviar<{ relacion: RelacionSocial }>(
    `/pilotos/${encodeURIComponent(h)}/seguir`,
    "POST",
    "No se pudo seguir a este piloto."
  );
  if (!r.ok) return r;
  revalidarRed(h);
  return { ok: true, relacion: r.datos.relacion };
}

export async function dejarDeSeguirPiloto(handle: string): Promise<Resultado<{ relacion: RelacionSocial }>> {
  const h = normalizarHandle(handle);
  const r = await enviar<{ relacion: RelacionSocial }>(
    `/pilotos/${encodeURIComponent(h)}/seguir`,
    "DELETE",
    "No se pudo dejar de seguir a este piloto."
  );
  if (!r.ok) return r;
  revalidarRed(h);
  return { ok: true, relacion: r.datos.relacion };
}

// ---------------------------------------------------------------------------
// Solicitudes y seguidores
// ---------------------------------------------------------------------------

export async function aceptarSolicitud(handle: string, miHandle?: string | null): Promise<Resultado<object>> {
  const h = normalizarHandle(handle);
  const r = await enviar(`/social/solicitudes/${encodeURIComponent(h)}/aceptar`, "POST", "No se pudo aceptar la solicitud.");
  if (!r.ok) return r;
  revalidarRed(h, miHandle);
  return { ok: true };
}

export async function rechazarSolicitud(handle: string, miHandle?: string | null): Promise<Resultado<object>> {
  const h = normalizarHandle(handle);
  const r = await enviar(`/social/solicitudes/${encodeURIComponent(h)}`, "DELETE", "No se pudo rechazar la solicitud.");
  if (!r.ok) return r;
  revalidarRed(h, miHandle);
  return { ok: true };
}

export async function sacarSeguidor(handle: string, miHandle?: string | null): Promise<Resultado<object>> {
  const h = normalizarHandle(handle);
  const r = await enviar(`/social/seguidores/${encodeURIComponent(h)}`, "DELETE", "No se pudo sacar a este seguidor.");
  if (!r.ok) return r;
  revalidarRed(h, miHandle);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cuidar la red: bloquear y reportar (migración 021 del backend)
// ---------------------------------------------------------------------------

/**
 * Bloquear: ninguno de los dos ve lo del otro y se cortan los seguimientos en las dos
 * direcciones. El otro no se entera: para él, tu perfil deja de existir. Revalida la red
 * (el feed, la Actividad, el perfil) y el Hangar, donde está la lista de bloqueados.
 */
export async function bloquearPiloto(handle: string): Promise<Resultado<{ relacion: RelacionSocial }>> {
  const h = normalizarHandle(handle);
  const r = await enviar<{ relacion: RelacionSocial }>(
    `/pilotos/${encodeURIComponent(h)}/bloqueo`,
    "POST",
    "No se pudo bloquear a este piloto."
  );
  if (!r.ok) return r;
  revalidarRed(h);
  revalidatePath("/dashboard/settings");
  return { ok: true, relacion: r.datos.relacion };
}

/** Desbloquear no devuelve los seguimientos: si se quieren, se vuelven a pedir. */
export async function desbloquearPiloto(handle: string): Promise<Resultado<{ relacion: RelacionSocial }>> {
  const h = normalizarHandle(handle);
  const r = await enviar<{ relacion: RelacionSocial }>(
    `/pilotos/${encodeURIComponent(h)}/bloqueo`,
    "DELETE",
    "No se pudo desbloquear a este piloto."
  );
  if (!r.ok) return r;
  revalidarRed(h);
  revalidatePath("/dashboard/settings");
  return { ok: true, relacion: r.datos.relacion };
}

export type TipoReporte = "perfil" | "publicacion" | "comentario";

/**
 * Reportar un perfil (por su @), una publicación o un comentario (por su id). Se escribe
 * y no se lee: lo revisa quien administra la red. El backend limita a 20 por día.
 */
export async function reportar(tipo: TipoReporte, objetivo: string, motivo: string): Promise<Resultado<object>> {
  const texto = motivo.trim().slice(0, 500);
  if (!texto) return { ok: false, error: "Contanos qué pasa." };
  const id = tipo === "perfil" ? normalizarHandle(objetivo) : objetivo;
  if (tipo !== "perfil" && !UUID.test(id)) return { ok: false, error: "Eso ya no está." };
  const r = await enviar("/reportes", "POST", "No se pudo enviar el reporte.", { tipo, objetivo: id, motivo: texto });
  if (!r.ok) return r;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Publicaciones, aplausos y comentarios
// ---------------------------------------------------------------------------
//
// **Éstas no revalidan, a propósito** (la excepción al invariante 8). La tarjeta es dueña
// de su estado —el aplauso se marca al instante y se deshace si falla—, y todas las
// pantallas que muestran publicaciones las piden sin cache, así que no hay nada viejo que
// tirar. Revalidar haría que Next volviera a dibujar la pantalla entera en la respuesta
// de cada aplauso: el feed completo pedido de nuevo por un toque.

export async function aplaudir(id: string, poner: boolean): Promise<Resultado<{ estado: EstadoAplauso }>> {
  if (!UUID.test(id)) return { ok: false, error: "Esa publicación ya no está." };
  const r = await enviar<EstadoAplauso>(
    `/publicaciones/${id}/aplauso`,
    poner ? "POST" : "DELETE",
    poner ? "No se pudo aplaudir." : "No se pudo sacar el aplauso."
  );
  if (!r.ok) return r;
  return { ok: true, estado: r.datos };
}

export async function borrarPublicacion(id: string): Promise<Resultado<object>> {
  if (!UUID.test(id)) return { ok: false, error: "Esa publicación ya no está." };
  const r = await enviar(`/publicaciones/${id}`, "DELETE", "No se pudo borrar la publicación.");
  if (!r.ok) return r;
  return { ok: true };
}

/**
 * Los comentarios de una publicación, con la sesión de quien mira: el backend calcula
 * con ella cuáles puede borrar. `comoAnonimo` es la vista "así te ven".
 */
export async function listarComentarios(
  id: string,
  comoAnonimo = false
): Promise<Resultado<{ comentarios: Comentario[] }>> {
  const porDefecto = "No se pudieron cargar los comentarios.";
  if (!UUID.test(id)) return { ok: false, error: porDefecto };
  try {
    const res = await apiFetch(`/publico/publicaciones/${id}/comentarios`, { cache: "no-store" }, { anonimo: comoAnonimo });
    const datos = await cuerpo(res);
    if (!res.ok || !Array.isArray(datos)) return { ok: false, error: mensajeDeErrorApi(datos, porDefecto) };
    return { ok: true, comentarios: prepararComentarios(datos as Comentario[]) };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { ok: false, error: porDefecto };
  }
}

export async function comentar(id: string, texto: string): Promise<Resultado<{ comentario: Comentario }>> {
  if (!UUID.test(id)) return { ok: false, error: "Esa publicación ya no está." };
  const r = await enviar<Comentario>(`/publicaciones/${id}/comentarios`, "POST", "No se pudo comentar.", { texto });
  if (!r.ok) return r;
  return { ok: true, comentario: prepararComentarios([r.datos])[0] };
}

export async function borrarComentario(id: string): Promise<Resultado<object>> {
  if (!UUID.test(id)) return { ok: false, error: "Ese comentario ya no está." };
  const r = await enviar(`/publicaciones/comentarios/${id}`, "DELETE", "No se pudo borrar el comentario.");
  if (!r.ok) return r;
  return { ok: true };
}

/** La página siguiente de una lista de publicaciones, ya preparada para dibujar. */
export async function cargarMasPublicaciones(
  origen: OrigenPublicaciones,
  antes: string
): Promise<Resultado<{ publicaciones: Publicacion[]; siguiente: string | null }>> {
  const porDefecto = "No se pudieron cargar más publicaciones.";
  if (origen.tipo === "piloto" && problemaDelHandle(origen.handle)) return { ok: false, error: porDefecto };
  try {
    const r = await leerPublicaciones(origen, antes);
    if (!r.disponible) return { ok: false, error: porDefecto };
    return { ok: true, publicaciones: r.publicaciones, siguiente: r.siguiente };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { ok: false, error: porDefecto };
  }
}

/**
 * Abrir la Actividad apaga el punto rojo. **Va por acción y no en el render de la
 * página**: un GET no escribe —el smoke recorre las pantallas contra producción dando
 * por hecho que mirar no cambia nada—, y así la marca se pone recién cuando el piloto
 * la tiene delante, no cuando Next la dibuja.
 *
 * Ésta sí revalida el layout: el punto rojo vive ahí.
 */
export async function marcarActividadVista(): Promise<void> {
  try {
    const res = await apiFetch("/red/actividad/vista", { method: "POST" });
    if (res.ok) revalidatePath("/dashboard", "layout");
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
}
