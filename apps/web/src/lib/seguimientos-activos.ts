import { horaArgentina, horaUtc, textoSalida } from "@/lib/seguimiento-calculos";

/**
 * Los vuelos que el piloto está compartiendo (`GET /seguimientos/activos`, migración 055): la lista
 * de "Compartir tu vuelo" y el "usar el link que ya mandaste" del Mapa en vuelo. Lo puro.
 *
 * Las fechas se escriben **en el server** (`rotuloDeActivo` con la hora del servidor): invariante 1.
 */

/** De dónde viene un link: un plan, el Mapa en vuelo o "sin plan" (origen, destino y horario). */
export type OrigenDelLink = "plan" | "mapa" | "sin-plan";

export interface PuntoActivo {
  lat: number;
  lon: number;
  codigo: string;
  nombre: string;
}

export interface SeguimientoActivo {
  id: string;
  token: string;
  ruta: string;
  puntos: PuntoActivo[];
  salidaPrevista: string | null;
  duracionPrevistaMin: number | null;
  venceAt: string;
  planId: string | null;
  rutaOrientativa: boolean;
  mostrarMatricula: boolean;
  avionTipo: string | null;
  mirandoAhora: number;
  vistosTotal: number;
  ultimaVistaAt: string | null;
  /** ISO, la hora del servidor al contestar: "hace 3 min" se cuenta contra ésta. */
  ahora: string;
  origen: OrigenDelLink;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** De la respuesta del backend a lo que usa la web; lo que no tiene la forma se descarta. */
export function activosDeRespuesta(json: unknown): SeguimientoActivo[] {
  if (!Array.isArray(json)) return [];
  const salida: SeguimientoActivo[] = [];
  for (const f of json as Record<string, unknown>[]) {
    if (!f || typeof f.id !== "string" || typeof f.token !== "string" || typeof f.vence_at !== "string") continue;
    const puntos: PuntoActivo[] = [];
    for (const p of Array.isArray(f.puntos) ? (f.puntos as unknown[]) : []) {
      if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") {
        puntos.push({ lat: p[0], lon: p[1], codigo: typeof p[2] === "string" ? p[2] : "", nombre: typeof p[3] === "string" ? p[3] : "" });
      }
    }
    const planId = texto(f.plan_id);
    const rutaOrientativa = f.ruta_orientativa === true;
    salida.push({
      id: f.id,
      token: f.token,
      ruta: typeof f.ruta === "string" ? f.ruta : "",
      puntos,
      salidaPrevista: texto(f.salida_prevista),
      duracionPrevistaMin: typeof f.duracion_prevista_min === "number" ? f.duracion_prevista_min : null,
      venceAt: f.vence_at,
      planId,
      rutaOrientativa,
      mostrarMatricula: f.mostrar_matricula === true,
      avionTipo: texto(f.avion_tipo),
      mirandoAhora: numero(f.mirando_ahora),
      vistosTotal: numero(f.vistos_total),
      ultimaVistaAt: texto(f.ultima_vista_at),
      ahora: texto(f.ahora) ?? "",
      origen: planId ? "plan" : rutaOrientativa ? "sin-plan" : "mapa",
    });
  }
  return salida;
}

/** "SADM → SAZS": los extremos de la ruta, por código (o nombre). */
export function trayectoDeActivo(s: Pick<SeguimientoActivo, "puntos" | "ruta">): string {
  const nombre = (p: PuntoActivo) => p.codigo || p.nombre;
  if (s.puntos.length >= 2) {
    const a = nombre(s.puntos[0]);
    const b = nombre(s.puntos[s.puntos.length - 1]);
    if (a && b) return `${a} → ${b}`;
  }
  const t = s.ruta.split(/\s+/).filter(Boolean);
  if (t.length >= 2) return `${t[0]} → ${t[t.length - 1]}`;
  return s.ruta || "Vuelo";
}

export const ROTULO_DE_ORIGEN: Record<OrigenDelLink, string> = {
  plan: "Desde un plan",
  mapa: "En vuelo",
  "sin-plan": "Sin plan",
};

/** "Sale hoy a las 13:30 (16:30Z)" / "Salió a las…" con la hora del servidor (`ahoraIso`), o `null`. */
export function rotuloDeSalida(s: Pick<SeguimientoActivo, "salidaPrevista">, ahoraIso: string): string | null {
  if (!s.salidaPrevista) return null;
  return textoSalida(s.salidaPrevista, ahoraIso);
}

/** "13:30 (16:30Z)" para el formulario al cambiar el horario. */
export function horaDeSalida(iso: string | null): string | null {
  const h = horaArgentina(iso);
  const z = horaUtc(iso);
  return h && z ? `${h} (${z})` : null;
}

/** Cuánto antes y después de ahora puede estar la salida de un link "sin plan" para ofrecerlo al volar. */
const ANTES_MS = 3600_000;
const DESPUES_MS = 3 * 3600_000;

/**
 * Al tocar "Compartir mi vuelo" en Volar: el link "sin plan" que el piloto ya mandó para este vuelo,
 * si lo hay. Sólo los de sin plan (un plan ya se adopta solo) cuya salida está entre 1 h antes y 3 h
 * después de ahora; si hay más de uno, el de salida más cercana. Un vuelo con la salida fuera de esa
 * ventana es de otro día u otra salida: se ofrece uno nuevo y nada más.
 */
export function candidatoParaAdoptar(lista: SeguimientoActivo[], ahoraMs: number): SeguimientoActivo | null {
  let mejor: SeguimientoActivo | null = null;
  let distancia = Infinity;
  for (const s of lista) {
    if (s.origen !== "sin-plan" || !s.salidaPrevista) continue;
    const salida = Date.parse(s.salidaPrevista);
    if (Number.isNaN(salida)) continue;
    const dif = salida - ahoraMs;
    if (dif < -ANTES_MS || dif > DESPUES_MS) continue;
    if (Math.abs(dif) < distancia) {
      distancia = Math.abs(dif);
      mejor = s;
    }
  }
  return mejor;
}
