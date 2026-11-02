"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getAirport } from "@/lib/airports";
import { TRAER_DEL_CAD, autoridadDelFormulario, matriculaCad, mismoVueloOtroDia, simuladorValido, validarTraido } from "@/lib/cad";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import type { Aircraft, Flight } from "@/types";

/**
 * Anota en Vector los vuelos que quedaron en el CAD de ANAC, con su id de allá (migración
 * 029). La llama "Pasar al CAD" (`PanelCad`, `fuente-cad.ts`) con lo que creó o lo que ya
 * estaba. Es una marca del libro: no toca el cobro.
 *
 * Sólo se aceptan ids con la forma de un vuelo de Vector y de un vuelo del CAD, y un tope
 * por pedido: lo que llega viene de otra pestaña.
 */
export async function marcarEnElCad(items: { vectorId: string; cadId: number; autoridad?: { id: string; nombre: string } }[]) {
  const validos = (Array.isArray(items) ? items : [])
    .filter((i) => /^[0-9a-f-]{36}$/i.test(String(i?.vectorId)) && Number.isInteger(i?.cadId) && i.cadId > 0)
    .slice(0, 300);
  let marcados = 0;
  try {
    for (const i of validos) {
      // Si se cargó recién, con la autoridad que se usó (migración 032). Un id que Vector no
      // conoce no se guarda: la marca del CAD igual.
      const autoridad = i.autoridad ? autoridadDelFormulario(i.autoridad.id, i.autoridad.nombre) : null;
      const r = await apiFetch(`/flights/${i.vectorId}`, {
        method: "PATCH",
        body: JSON.stringify({ cad_vuelo_id: i.cadId, ...(autoridad?.cad_autoridad_id && autoridad.cad_autoridad_nombre ? autoridad : {}) }),
      });
      if (r.ok) marcados++;
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
  if (marcados > 0) {
    revalidatePath("/dashboard/history");
    revalidatePath("/dashboard/history/cad");
  }
  return { marcados };
}

/** Las pantallas que muestran un vuelo nuevo (las mismas que al registrar uno a mano). */
function revalidarVuelosNuevos() {
  for (const p of ["/dashboard", "/dashboard/history", "/dashboard/history/cad", "/dashboard/summary", "/dashboard/balance", "/dashboard/airports", "/dashboard/audit", "/dashboard/settings", "/dashboard/calendario"])
    revalidatePath(p);
}

/**
 * Trae a Vector vuelos que el piloto ya tiene en el CAD (el camino inverso). La llama "Pasar
 * al CAD" (`PanelCad`) con lo que armó de cada vuelo del CAD (`filaParaTraer`).
 *
 * Lo que llega viene de otra pestaña, así que se revisa todo de nuevo (`validarTraido`):
 * - el avión tiene que estar en el Hangar (no se crea uno a ciegas);
 * - no se crea un vuelo que ya está: mismo id del CAD, o misma salida y matrícula;
 * - el vuelo queda con el id del CAD y la marca `traido_del_cad`, que **no genera cobro**
 *   (migración 030 del backend): es un vuelo ya volado.
 *
 * Los aeródromos se guardan con su OACI si el directorio conoce el designador del CAD.
 */
export async function traerDelCad(items: unknown[]) {
  if (!TRAER_DEL_CAD) return { creados: 0, yaEstaban: 0, rechazados: Array.isArray(items) ? items.length : 0, error: "Traer vuelos del CAD todavía no está disponible." };
  const vuelos = (Array.isArray(items) ? items : []).slice(0, 300).map(validarTraido);
  const resultado = { creados: 0, yaEstaban: 0, rechazados: vuelos.filter((v) => !v).length };
  try {
    const [ar, fr] = await Promise.all([apiFetch("/aircraft", { next: { revalidate: 0 } }), apiFetch("/flights", { next: { revalidate: 0 } })]);
    if (!ar.ok || !fr.ok) return { ...resultado, error: "No pudimos leer tu bitácora. Probá de nuevo." };
    const aviones = ((await ar.json()) as Aircraft[]).filter((a) => !a.is_simulator);
    const existentes = (await fr.json()) as Flight[];
    const avionPorMatricula = new Map(aviones.map((a) => [matriculaCad(a.registration), a]));
    const matriculaDe = new Map(aviones.map((a) => [a.id, matriculaCad(a.registration)]));
    const yaCad = new Set(existentes.map((f) => f.cad_vuelo_id).filter(Boolean));
    const yaSalida = new Set(existentes.map((f) => `${(f.takeoff ?? "").slice(0, 16)}|${f.aircraft_id ? matriculaDe.get(f.aircraft_id) : ""}`));
    const oaci = (codigo: string) => getAirport(codigo)?.icao?.toUpperCase() || codigo;
    const salidas = existentes.map((f) => ({ salida: (f.takeoff ?? "").slice(0, 16), matricula: (f.aircraft_id && matriculaDe.get(f.aircraft_id)) || "" }));

    for (const v of vuelos) {
      if (!v) continue;
      const avion = avionPorMatricula.get(matriculaCad(v.matricula));
      if (!avion) {
        resultado.rechazados++;
        continue;
      }
      // El mismo vuelo con un día de diferencia tampoco se crea: sería un duplicado (`mismoVueloOtroDia`).
      if (yaCad.has(v.cadId) || yaSalida.has(`${v.takeoff.slice(0, 16)}|${matriculaCad(v.matricula)}`) || mismoVueloOtroDia(v.takeoff, v.matricula, salidas)) {
        resultado.yaEstaban++;
        continue;
      }
      const r = await apiFetch("/flights", {
        method: "POST",
        body: JSON.stringify({
          aircraft_id: avion.id,
          date: v.date,
          route: `${oaci(v.origen)} ${oaci(v.destino)}`,
          landings: v.landings,
          duration: v.duration,
          takeoff: v.takeoff,
          landing: v.landing,
          pic_day_loc: v.pic_day_loc,
          pic_day_tra: v.pic_day_tra,
          pic_night_loc: v.pic_night_loc,
          pic_night_tra: v.pic_night_tra,
          sic_day_loc: v.sic_day_loc,
          sic_day_tra: v.sic_day_tra,
          sic_night_loc: v.sic_night_loc,
          sic_night_tra: v.sic_night_tra,
          "IMC Pil": v.imc_pil,
          "IMC Cop": v.imc_cop,
          Capota: v.capota,
          purpose: v.purpose,
          cad_vuelo_id: v.cadId,
          traido_del_cad: true,
        }),
      });
      if (r.ok) {
        resultado.creados++;
        yaCad.add(v.cadId);
      } else resultado.rechazados++;
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { ...resultado, error: "No pudimos guardar todos los vuelos. Probá de nuevo: los que ya entraron no se repiten." };
  } finally {
    if (resultado.creados > 0) revalidarVuelosNuevos();
  }
  return resultado;
}

/**
 * Saca la marca "en el CAD" de vuelos que el piloto borró allá (`borradosDelCad`), para que
 * vuelvan a "Pasar al CAD". La llaman el panel de Vector y la ventanita del marcador, sólo
 * después de leer la lista entera del CAD. Es una marca del libro: no toca el cobro.
 */
export async function desmarcarDelCad(vectorIds: string[]) {
  const validos = (Array.isArray(vectorIds) ? vectorIds : []).filter((id) => /^[\w-]{1,64}$/.test(String(id))).slice(0, 300);
  let desmarcados = 0;
  try {
    for (const id of validos) {
      const r = await apiFetch(`/flights/${id}`, { method: "PATCH", body: JSON.stringify({ cad_vuelo_id: null }) });
      if (r.ok) desmarcados++;
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
  if (desmarcados > 0) {
    revalidatePath("/dashboard/history");
    revalidatePath("/dashboard/history/cad");
  }
  return { desmarcados };
}

/**
 * Guarda qué simulador del CAD es un "avión" simulador del Hangar, con su clase y su modelo
 * (`aircraft.cad_simulador`, migración 036). Se elige una vez en el panel y sirve para todas
 * sus sesiones. Lo que llega se revisa (`simuladorValido`): viene de otra pestaña.
 */
export async function guardarSimuladorCad(avionId: string, simulador: unknown) {
  const s = simuladorValido(simulador);
  if (!/^[\w-]{1,64}$/.test(String(avionId)) || !s) return { ok: false };
  try {
    const r = await apiFetch(`/aircraft/${avionId}`, { method: "PATCH", body: JSON.stringify({ cad_simulador: s }) });
    if (!r.ok) return { ok: false };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { ok: false };
  }
  revalidatePath("/dashboard/history/cad");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Saca vuelos de la lista de "Pasar al CAD", o los devuelve (migración 031): "foliado" si ya
 * están en un libro foliado antes del CAD, "ignorado" si el piloto no los pasa (un simulador,
 * uno que carga a mano). `null` lo devuelve. Es una marca del libro: no toca el cobro.
 */
export async function omitirEnElCad(items: { vectorId: string; motivo: "foliado" | "ignorado" | null }[]) {
  const validos = (Array.isArray(items) ? items : [])
    .filter((i) => /^[0-9a-f-]{36}$/i.test(String(i?.vectorId)) && (i.motivo === "foliado" || i.motivo === "ignorado" || i.motivo === null))
    .slice(0, 300);
  let cambiados = 0;
  try {
    for (const i of validos) {
      const r = await apiFetch(`/flights/${i.vectorId}`, { method: "PATCH", body: JSON.stringify({ cad_omitido: i.motivo }) });
      if (r.ok) cambiados++;
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
  if (cambiados > 0) revalidatePath("/dashboard/history/cad");
  return { cambiados };
}
