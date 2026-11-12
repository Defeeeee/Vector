/**
 * "Compartir este vuelo" desde el editor de un plan (migración 045 del backend): lo puro.
 *
 * El backend toma del plan guardado la matrícula, la salida (EOBT vigente) y la duración; acá sólo se
 * arman lo que vive en el navegador —la ruta con sus puntos ya ubicados— y se avisa, antes de pedir,
 * si falta algo para compartir. Sin `toLocaleString` (invariante 1).
 */

import type { FormularioPlan } from "@/lib/formulario-plan";
import { eobtVigente, type Demora } from "@/lib/demora-plan";

/** Lo que el hook de la ruta resuelta (`useRutaResuelta`) sabe de cada nodo; sólo lo que acá se usa. */
export interface NodoParaCompartir {
  tipo: "punto" | "aerovia" | "desconocido";
  texto: string;
  estado: "buscando" | "ubicado" | "sin-ubicar";
  lat?: number;
  lon?: number;
  /** Cómo lo nombra el directorio: "VOR-DME Atalaya". */
  etiqueta?: string;
  /** Los puntos de una aerovía, de la entrada a la salida. */
  tramo?: { lat: number; lon: number }[];
}

export interface PuntoCompartido {
  lat: number;
  lon: number;
  codigo: string;
  nombre: string;
}

/** El mismo tope que el backend (`TOPE_PUNTOS_RUTA`). */
export const TOPE_PUNTOS = 60;

const redondear = (n: number) => Math.round(n * 1e5) / 1e5;
const finito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * La salida, el recorrido ubicado y el destino, en orden. Los nodos sin ubicar se saltean (la ruta
 * escrita los conserva). Una aerovía aporta sus puntos intermedios, sin nombre. Si pasa de
 * `TOPE_PUNTOS`, se sacan puntos parejos de adentro: la salida y el destino quedan siempre.
 */
export function puntosParaCompartir(f: Pick<FormularioPlan, "salida" | "destino">, nodos: NodoParaCompartir[]): PuntoCompartido[] {
  const puntos: PuntoCompartido[] = [];
  const sumar = (lat: unknown, lon: unknown, codigo: string, nombre: string) => {
    if (finito(lat) && finito(lon)) puntos.push({ lat: redondear(lat), lon: redondear(lon), codigo: codigo.slice(0, 20), nombre: nombre.slice(0, 60) });
  };
  if (f.salida) sumar(f.salida.lat, f.salida.lon, f.salida.codigo, f.salida.nombre);
  for (const n of nodos) {
    if (n.estado !== "ubicado") continue;
    if (n.tipo === "aerovia") for (const p of n.tramo ?? []) sumar(p.lat, p.lon, "", "");
    else sumar(n.lat, n.lon, n.texto, n.etiqueta ?? "");
  }
  if (f.destino) sumar(f.destino.lat, f.destino.lon, f.destino.codigo, f.destino.nombre);
  if (puntos.length <= TOPE_PUNTOS) return puntos;
  const interior = puntos.slice(1, -1);
  const lugares = TOPE_PUNTOS - 2;
  const paso = interior.length / lugares;
  return [puntos[0], ...Array.from({ length: lugares }, (_, i) => interior[Math.floor(i * paso)]), puntos[puntos.length - 1]];
}

/** "SADF VM SADM": la salida, lo que el piloto escribió en la ruta y el destino. Hasta 600 caracteres. */
export function rutaParaCompartir(f: Pick<FormularioPlan, "salida" | "destino">, nodos: NodoParaCompartir[]): string {
  const partes = [f.salida?.codigo, ...nodos.map((n) => n.texto), f.destino?.codigo].map((t) => (t ?? "").trim()).filter(Boolean);
  return partes.join(" ").slice(0, 600);
}

/** La salida vigente (con las demoras) como instante ISO en UTC, o `null` si falta o no se lee. */
export function salidaIso(f: Pick<FormularioPlan, "dofUtc" | "eobtUtc">, demoras: Demora[]): string | null {
  const v = eobtVigente(f as FormularioPlan, demoras);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.dof) || !/^([01]\d|2[0-3])[0-5]\d$/.test(v.eobt)) return null;
  const iso = `${v.dof}T${v.eobt.slice(0, 2)}:${v.eobt.slice(2)}:00.000Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) || new Date(t).toISOString() !== iso ? null : iso;
}

/** Cuánto antes de la salida el backend deja compartir (24 h) y cuánto después (12 h). */
export const MAXIMO_ADELANTO_MS = 24 * 3600_000;
export const MAXIMO_ATRASO_MS = 12 * 3600_000;

/**
 * Por qué todavía no se puede compartir (o `null` si se puede). Lo mismo que le va a decir el backend,
 * pero antes de pedir: sin matrícula (casilla 7), sin salida, o con una salida fuera del rango.
 * `ahoraIso` es la hora del servidor del primer dibujo.
 */
export function motivoParaNoCompartir(
  f: Pick<FormularioPlan, "matricula" | "dofUtc" | "eobtUtc">,
  demoras: Demora[],
  ahoraIso: string,
  cancelado: boolean
): string | null {
  if (cancelado) return "El plan está cancelado.";
  if (!/[A-Za-z0-9]{2,}/.test((f.matricula ?? "").replace(/[^A-Za-z0-9]/g, ""))) return "Para compartir el vuelo hace falta la matrícula (casilla 7): con ella se sigue al avión por ADS-B.";
  const salida = salidaIso(f, demoras);
  if (!salida) return "Para compartir el vuelo hace falta la fecha y la hora de salida (en UTC).";
  const dif = Date.parse(salida) - Date.parse(ahoraIso);
  if (dif > MAXIMO_ADELANTO_MS) return "Se puede compartir hasta 24 horas antes de la salida: volvé más cerca.";
  if (-dif > MAXIMO_ATRASO_MS) return "La salida de este plan fue hace más de 12 horas.";
  return null;
}
