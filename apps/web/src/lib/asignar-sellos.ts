import { asignarCertificante, type ResultadoAsignacion } from "@/actions/firmas";
import { repartirPorSello, type SelloBreve } from "@/lib/firmas-libro";

/**
 * Asigna a una persona un grupo de vuelos con lo que se eligió en un selector de `opcionesDeCertificante`
 * (`persona`, `persona|sello` o `persona|auto`). Con "según el cargo de cada vuelo" (migración 049) los
 * vuelos se reparten entre los sellos de la persona y se manda **un pedido por sello**, porque el
 * backend asigna un sello por pedido. Suma los resultados; si uno falla, devuelve el error con lo que sí se guardó.
 */
export async function asignarPorSellos(
  valor: string,
  vuelos: { id: string; cad_autoridad_id?: number | null }[],
  sellosDeLaPersona: SelloBreve[] | undefined,
  firma: "si" | "no" | null
): Promise<{ error: string } | ({ ok: true } & ResultadoAsignacion)> {
  const [personaId, elegido] = valor.split("|");
  const total: ResultadoAsignacion = { asignados: 0, completados: 0, avisos: [] };
  for (const grupo of repartirPorSello(vuelos, sellosDeLaPersona, elegido)) {
    const r = await asignarCertificante(personaId, grupo.ids, firma, undefined, grupo.selloId);
    if ("error" in r) return { error: r.error };
    total.asignados += r.asignados;
    total.completados += r.completados;
    total.avisos.push(...r.avisos);
  }
  return { ok: true, ...total };
}
