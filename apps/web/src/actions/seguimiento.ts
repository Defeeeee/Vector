"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";

/**
 * Seguir el vuelo en vivo (`/seguimientos` del backend, migración 041): empezar y terminar. La
 * posición cada ~15 s no va por acá sino por `/api/seguimiento/posicion`: las server actions de
 * Next se encolan de a una y se cortan si la página navega.
 *
 * No hay `revalidatePath`: ninguna pantalla del dashboard muestra un seguimiento, y el estado
 * "Compartiendo" es del Mapa (invariante 8, que pide revalidar donde se muestra el dato).
 */

async function detalle(res: Response, porDefecto: string): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    return typeof j.detail === "string" ? j.detail : porDefecto;
  } catch {
    return porDefecto;
  }
}

export interface SeguimientoCreado {
  id: string;
  token: string;
  venceAt: string;
  yaExistia: boolean;
  /** Si la matrícula se está mostrando (un seguimiento retomado puede tenerla prendida). */
  mostrarMatricula: boolean;
  /** ISO: la salida prevista, si es un seguimiento desde un plan de vuelo (migración 045). */
  salidaPrevista?: string | null;
}

/** Empieza a compartir (o devuelve el seguimiento que el piloto ya tenía activo). */
export async function crearSeguimiento(datos: {
  ruta: string;
  puntos: { lat: number; lon: number; codigo: string; nombre?: string }[];
  /** El avión elegido en el Mapa. La matrícula sólo se muestra si `mostrarMatricula` está prendido. */
  avion?: { tipo: string; icao: string; matricula: string } | null;
  mostrarMatricula?: boolean;
}): Promise<{ seguimiento: SeguimientoCreado } | { error: string }> {
  try {
    const res = await apiFetch("/seguimientos", {
      method: "POST",
      body: JSON.stringify({
        ruta: datos.ruta.slice(0, 600),
        puntos: datos.puntos.slice(0, 60).map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo.slice(0, 20), nombre: (p.nombre ?? "").slice(0, 60) })),
        avion: datos.avion
          ? {
              tipo: datos.avion.tipo.slice(0, 60),
              icao: datos.avion.icao.slice(0, 8),
              // Viaja siempre (migración 045): el backend la guarda aparte para buscar el avión en
              // ADS-B y **sólo la muestra** si `mostrar_matricula` está prendido.
              matricula: datos.avion.matricula.slice(0, 12),
            }
          : null,
        mostrar_matricula: Boolean(datos.mostrarMatricula && datos.avion?.matricula),
      }),
      cache: "no-store",
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo empezar a compartir el vuelo.") };
    const j = (await res.json()) as { id: string; token: string; vence_at: string; ya_existia?: boolean; mostrar_matricula?: boolean; salida_prevista?: string | null };
    return {
      seguimiento: { id: j.id, token: j.token, venceAt: j.vence_at, yaExistia: Boolean(j.ya_existia), mostrarMatricula: Boolean(j.mostrar_matricula), salidaPrevista: j.salida_prevista ?? null },
    };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** Deja de compartir: el link pasa a "El vuelo terminó". Terminar dos veces no es un error. */
export async function terminarSeguimiento(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(`/seguimientos/${encodeURIComponent(id)}/terminar`, { method: "POST", cache: "no-store" });
    // Un 404 es un seguimiento que ya no está: para el piloto, lo mismo que terminado.
    if (!res.ok && res.status !== 404) return { error: await detalle(res, "No se pudo dejar de compartir.") };
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * Cambia la ruta del seguimiento en marcha ("directo a…", otra ruta). `terminado` es que el
 * backend ya no lo tiene en vuelo (410 o 404): el teléfono deja de insistir. Mismos topes que al crear.
 */
export async function cambiarRutaSeguimiento(
  id: string,
  datos: { ruta: string; puntos: { lat: number; lon: number; codigo: string; nombre?: string }[] }
): Promise<{ ok: true } | { error: string; terminado?: boolean }> {
  try {
    const res = await apiFetch(`/seguimientos/${encodeURIComponent(id)}/ruta`, {
      method: "POST",
      body: JSON.stringify({
        ruta: datos.ruta.slice(0, 600),
        puntos: datos.puntos.slice(0, 60).map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo.slice(0, 20), nombre: (p.nombre ?? "").slice(0, 60) })),
      }),
      cache: "no-store",
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo cambiar la ruta del vuelo compartido."), terminado: res.status === 410 || res.status === 404 };
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** Prende o apaga la matrícula del link mientras se comparte. Apagada, el backend la borra. */
export async function cambiarMatriculaVisible(id: string, mostrar: boolean, matricula: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await apiFetch(`/seguimientos/${encodeURIComponent(id)}/matricula`, {
      method: "POST",
      body: JSON.stringify({ mostrar, matricula: mostrar ? matricula.slice(0, 12) : "" }),
      cache: "no-store",
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo cambiar si se muestra la matrícula.") };
    return { ok: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * Comparte un plan de vuelo sin el teléfono (migración 045, `POST /seguimientos/desde-plan`). **La
 * matrícula, la salida y la duración las toma el backend del plan guardado**: del navegador sólo van
 * la ruta con sus puntos ya ubicados y el tipo de avión. Si el plan ya se compartía, lo actualiza
 * (la salida pudo cambiar con una demora). 409 si el piloto ya comparte otro vuelo.
 */
export async function compartirPlanDeVuelo(datos: {
  planId: string;
  ruta: string;
  puntos: { lat: number; lon: number; codigo: string; nombre?: string }[];
  avion?: { tipo: string; icao: string } | null;
  mostrarMatricula?: boolean;
}): Promise<{ seguimiento: SeguimientoCreado } | { error: string }> {
  try {
    const res = await apiFetch("/seguimientos/desde-plan", {
      method: "POST",
      body: JSON.stringify({
        plan_id: datos.planId,
        ruta: datos.ruta.slice(0, 600),
        puntos: datos.puntos.slice(0, 60).map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo.slice(0, 20), nombre: (p.nombre ?? "").slice(0, 60) })),
        avion: datos.avion ? { tipo: datos.avion.tipo.slice(0, 60), icao: datos.avion.icao.slice(0, 8), matricula: "" } : null,
        mostrar_matricula: Boolean(datos.mostrarMatricula),
      }),
      cache: "no-store",
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo compartir el vuelo.") };
    const j = (await res.json()) as { id: string; token: string; vence_at: string; ya_existia?: boolean; mostrar_matricula?: boolean; salida_prevista?: string | null };
    return {
      seguimiento: { id: j.id, token: j.token, venceAt: j.vence_at, yaExistia: Boolean(j.ya_existia), mostrarMatricula: Boolean(j.mostrar_matricula), salidaPrevista: j.salida_prevista ?? null },
    };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** El último seguimiento de un plan, con quién lo mira (`GET /seguimientos/de-plan/{id}`). */
export interface SeguimientoDelPlan {
  id: string;
  token: string;
  venceAt: string;
  /** Sigue sin terminar ni vencer. */
  activo: boolean;
  /** ISO: cuándo tocó tierra según ADS-B. */
  aterrizoAt: string | null;
  mostrarMatricula: boolean;
  salidaPrevista: string | null;
  mirandoAhora: number;
  vistosTotal: number;
  ultimaVistaAt: string | null;
  /** ISO: la hora del servidor al contestar. */
  ahora: string;
}

/**
 * `null` si el plan nunca se compartió **o si no se pudo leer** (acá la diferencia no importa: el
 * editor ofrece "Compartir este vuelo" y el backend responde si ya hay uno). 
 */
export async function leerSeguimientoDelPlan(planId: string): Promise<SeguimientoDelPlan | null> {
  try {
    const res = await apiFetch(`/seguimientos/de-plan/${encodeURIComponent(planId)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (typeof j.id !== "string" || typeof j.token !== "string" || typeof j.vence_at !== "string") return null;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const t = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      id: j.id,
      token: j.token,
      venceAt: j.vence_at,
      activo: j.activo === true,
      aterrizoAt: t(j.aterrizo_at),
      mostrarMatricula: j.mostrar_matricula === true,
      salidaPrevista: t(j.salida_prevista),
      mirandoAhora: n(j.mirando_ahora),
      vistosTotal: n(j.vistos_total),
      ultimaVistaAt: t(j.ultima_vista_at),
      ahora: t(j.ahora) ?? new Date().toISOString(),
    };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return null;
  }
}
