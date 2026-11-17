import { claveBorrador, leerBorrador } from "./borrador-plan";
import { aplicarAvion, formularioVacio, leerFormulario, type AvionParaPlan, type FormularioPlan, type PilotoParaPlan } from "./formulario-plan";

/**
 * Un plan de vuelo **nuevo sin señal** (3.47.0, Federico: «cuando intento abrir un nuevo FPL me da
 * error sin señal»).
 *
 * Hasta la 3.46.0 "Nuevo plan" llamaba a una server action que creaba el plan en el backend y
 * redirigía a su editor: sin red, error. Ahora **el piloto le pone el id al plan** (un uuid que
 * genera el navegador) y abre `/dashboard/plan-de-vuelo/nuevo?id=<uuid>`: el editor arma el
 * formulario y lo deja en el borrador del teléfono (`lib/borrador-plan.ts`, por ese id), y **crea el
 * plan en el servidor apenas hay red** con ese mismo id (`POST /planes-de-vuelo` es idempotente por
 * id: crearlo dos veces es un solo plan). Un solo camino, con o sin señal.
 *
 * Todo lo que se decide acá es puro y tiene sus tests.
 */

export const RUTA_PLAN_NUEVO = "/dashboard/plan-de-vuelo/nuevo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (v: string | null | undefined): v is string => typeof v === "string" && UUID.test(v);

/** Un uuid v4. `crypto.randomUUID` si está (contexto seguro); si no, a mano con `getRandomValues`. */
export function nuevoIdDePlan(cripto: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined = globalThis.crypto): string {
  if (cripto && typeof cripto.randomUUID === "function") return cripto.randomUUID();
  const b = new Uint8Array(16);
  if (cripto) cripto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** La URL del plan nuevo, con su id y, si se eligió un avión, ese avión. */
export function urlDePlanNuevo(id: string, avionId?: string | null): string {
  const p = new URLSearchParams({ id });
  if (esUuid(avionId)) p.set("avion", avionId);
  return `${RUTA_PLAN_NUEVO}?${p.toString()}`;
}

/** La URL del editor de un plan que ya está en el servidor. */
export const urlDelPlan = (id: string) => `/dashboard/plan-de-vuelo/${id}`;

/** El id de la query (`?id=`), si es un uuid; si no, `null` (y se genera uno). */
export function idDePlanNuevo(search: string): string | null {
  const v = new URLSearchParams(search).get("id");
  return esUuid(v) ? v.toLowerCase() : null;
}

/** El avión elegido (`?avion=`), si es un uuid. */
export function avionDePlanNuevo(search: string): string | null {
  const v = new URLSearchParams(search).get("avion");
  return esUuid(v) ? v : null;
}

/**
 * Con qué arranca el formulario de un plan nuevo. **El borrador del teléfono gana** (lo que se escribió
 * sin señal, o el plan duplicado que dejó el editor): sin él, el formulario en blanco con el piloto y,
 * si se eligió un avión, lo que sabe el Hangar. Sin fecha, la de hoy en UTC (la DOF/ va en UTC), como
 * cuando el servidor lo creaba.
 */
export function formularioDePlanNuevo(o: {
  borrador: string | null;
  avionId: string | null;
  aviones: AvionParaPlan[];
  piloto: PilotoParaPlan;
  hoyUtc: string;
}): FormularioPlan {
  const guardado = leerBorrador<unknown>(o.borrador);
  if (guardado) {
    const f = leerFormulario(guardado.formulario);
    return f.dofUtc ? f : { ...f, dofUtc: o.hoyUtc };
  }
  const avion = o.avionId ? (o.aviones.find((a) => a.id === o.avionId) ?? null) : null;
  const base = avion ? aplicarAvion(formularioVacio(), avion, o.piloto) : { ...formularioVacio(), piloto: o.piloto.comandante };
  return base.dofUtc ? base : { ...base, dofUtc: o.hoyUtc };
}

/** Cómo se guarda lo escrito: el primer guardado **crea** el plan (con su id), los demás lo actualizan. */
export function accionDeGuardado(enServidor: boolean): "crear" | "actualizar" {
  return enServidor ? "actualizar" : "crear";
}

/** Al abrir un plan que todavía no está en el servidor: con red, se crea ya; sin ella, queda en el teléfono. */
export function crearAlAbrir(enServidor: boolean, enLinea: boolean): boolean {
  return !enServidor && enLinea;
}

/* ------------------------------------------------ lo armado sin señal que no se subió --- */

export interface BorradorPendiente {
  id: string;
  salida: string | null;
  destino: string | null;
  matricula: string | null;
  /** ISO: cuándo se escribió por última vez en el teléfono. */
  at: string;
}

const PREFIJO_BORRADOR = claveBorrador("");

/**
 * Los borradores del teléfono de planes que **el servidor todavía no tiene**: armados sin señal y
 * sin subir. `entradas` son los pares clave/valor del `localStorage`. Un borrador de un plan que
 * sí está en la lista del servidor no se cuenta: es una edición pendiente de un plan que existe, y
 * el editor la sube sola al abrirlo (`borradorParaRecuperar`). Los más nuevos primero.
 *
 * **Con la lista del servidor sin leer (`idsEnServidor` = `null`) no se afirma nada**: no se sabe cuáles
 * existen (invariante 2).
 */
export function borradoresPendientes(entradas: ReadonlyArray<readonly [string, string | null]>, idsEnServidor: ReadonlySet<string> | null): BorradorPendiente[] {
  if (!idsEnServidor) return [];
  const hallados: BorradorPendiente[] = [];
  for (const [clave, texto] of entradas) {
    if (!clave.startsWith(PREFIJO_BORRADOR)) continue;
    const id = clave.slice(PREFIJO_BORRADOR.length).toLowerCase();
    if (!esUuid(id) || idsEnServidor.has(id)) continue;
    const b = leerBorrador<unknown>(texto);
    if (!b) continue;
    const f = leerFormulario(b.formulario);
    hallados.push({
      id,
      salida: f.salida?.codigo || null,
      destino: f.destino?.codigo || null,
      matricula: f.matricula || null,
      at: b.at,
    });
  }
  return hallados.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
