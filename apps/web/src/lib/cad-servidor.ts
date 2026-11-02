import { apiFetch } from "@/lib/api";
import { getAirport, getLad } from "@/lib/airports";
import { borradorCad, matriculaCad, type BorradorCad, type LugarParaCad, type MotivoOmitido, type VueloConocido } from "@/lib/cad";
import { numeroDeCodigoLad } from "@/lib/lad";
import { esAlumno } from "@/lib/licencias";
import type { Aircraft, Flight, Profile } from "@/types";

/**
 * Los vuelos que faltan pasar al CAD, armados en el server (`lib/cad.ts`). Los lee la
 * pantalla "Pasar al CAD".
 *
 * Sin cache: con los 20 s de `apiFetch`, un vuelo recién marcado volvería a aparecer.
 */
const FRESCO: RequestInit = { next: { revalidate: 0 } };

/**
 * Un código de la ruta, con los que puede tener en el CAD: el OACI y el designador ANAC. Un
 * LAD ("LAD2013") va por su número, que es su clave en la lista del CAD.
 */
export function lugarParaCad(codigo: string): LugarParaCad {
  const c = codigo.trim().toUpperCase();
  const numero = numeroDeCodigoLad(c);
  if (numero) return { codigo: c, candidatos: [c, numero], nombre: getLad(numero)?.nombre ?? null };
  const a = c ? getAirport(c) : null;
  const candidatos = [c, a?.icao, a?.local].filter((x): x is string => !!x).map((x) => x.toUpperCase());
  return { codigo: c, candidatos: [...new Set(candidatos)], nombre: a?.name ?? null };
}

export interface VuelosParaElCad {
  alumno: boolean;
  /** Los que faltan, del más nuevo al más viejo. */
  borradores: BorradorCad[];
  /** Cuántos ya están marcados como pasados. */
  pasados: number;
  /** Los que el piloto sacó de la lista: ya foliados antes del CAD, o ignorados. */
  omitidos: (BorradorCad & { motivo: MotivoOmitido })[];
  /** Todos los vuelos de Vector, reducidos: para no traer del CAD uno que ya está. */
  conocidos: VueloConocido[];
  /** Las matrículas del Hangar (sin simuladores): un vuelo del CAD sólo se trae si su avión está. */
  matriculas: string[];
  /** Los marcados como pasados, con su id del CAD: si se borraron allá, vuelven (`borradosDelCad`). */
  marcados: (BorradorCad & { cadId: number })[];
}

/** `null` si no se pudo leer (invariante 2: no es lo mismo que "no hay"). */
export async function vuelosParaElCad(): Promise<VuelosParaElCad | null> {
  try {
    const [vr, ar, pr] = await Promise.all([apiFetch("/flights", FRESCO), apiFetch("/aircraft", FRESCO), apiFetch("/profiles", FRESCO)]);
    if (!vr.ok || !ar.ok) return null;
    const vuelos = (await vr.json()) as Flight[];
    const aviones = (await ar.json()) as Aircraft[];
    const perfiles = pr.ok ? ((await pr.json()) as Profile[]) : [];
    const porId = new Map(aviones.map((a) => [a.id, a]));
    const sinPasar = vuelos
      .filter((f) => !f.cad_vuelo_id)
      .sort((a, b) => (b.takeoff || b.date || "").localeCompare(a.takeoff || a.date || ""));
    const faltan = sinPasar.filter((f) => !f.cad_omitido);
    const armar = (f: Flight) => borradorCad(f, (f.aircraft_id && porId.get(f.aircraft_id)) || null, lugarParaCad);
    return {
      alumno: esAlumno(perfiles[0]?.license_type),
      borradores: faltan.map(armar),
      pasados: vuelos.length - sinPasar.length,
      omitidos: sinPasar.filter((f) => f.cad_omitido).map((f) => ({ ...armar(f), motivo: f.cad_omitido as MotivoOmitido })),
      conocidos: vuelos.map((f) => ({
        cadId: f.cad_vuelo_id ?? null,
        salida: (f.takeoff ?? "").slice(0, 16),
        matricula: matriculaCad((f.aircraft_id && porId.get(f.aircraft_id)?.registration) || ""),
      })),
      matriculas: aviones.filter((a) => !a.is_simulator).map((a) => matriculaCad(a.registration)),
      marcados: vuelos.filter((f) => f.cad_vuelo_id && !f.cad_omitido).map((f) => ({ ...armar(f), cadId: Number(f.cad_vuelo_id) })),
    };
  } catch {
    return null;
  }
}
