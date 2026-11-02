import type { Aircraft, Flight } from "@/types";

/**
 * Buscar en la bitácora.
 *
 * Hasta acá el libro tenía un único campo de texto que miraba ruta y matrícula. Con
 * 41 vuelos alcanza; con 300 —que es donde termina cualquier piloto que use esto en
 * serio— encontrar "el vuelo a Junín de abril" implica scrollear seis meses.
 *
 * La lógica vive fuera del componente porque el proyecto no puede testear
 * componentes (`environment: "node"`, sólo `.test.ts`), y un filtro que se equivoca
 * esconde vuelos sin avisar — que en un registro regulatorio es la peor forma de
 * fallar: silenciosa.
 */

export interface FiltrosVuelo {
  /** Texto libre sobre ruta, matrícula y observaciones. */
  texto?: string;
  /** "YYYY-MM-DD" inclusive. */
  desde?: string;
  hasta?: string;
  aeronaveId?: string;
  proposito?: string;
}

/** Si algún filtro está puesto. Sirve para saber si mostrar "sin resultados". */
export function hayFiltros(f: FiltrosVuelo): boolean {
  return Boolean(f.texto?.trim() || f.desde || f.hasta || f.aeronaveId || f.proposito);
}

/**
 * Los vuelos que pasan todos los filtros.
 *
 * Las fechas se comparan como texto ISO, sin construir un `Date`: "2026-04-09" y
 * "2026-04-10" ordenan igual como strings, y cualquier `Date` mete la zona horaria
 * del navegador en una comparación que no la necesita.
 */
export function filtrarVuelos(
  flights: Flight[],
  aircraft: Aircraft[],
  filtros: FiltrosVuelo
): Flight[] {
  const porId = new Map(aircraft.map((a) => [a.id, a]));
  const texto = filtros.texto?.trim().toLowerCase() ?? "";

  return flights.filter((f) => {
    if (filtros.aeronaveId && f.aircraft_id !== filtros.aeronaveId) return false;
    if (filtros.proposito && f.purpose !== filtros.proposito) return false;
    if (filtros.desde && (!f.date || f.date < filtros.desde)) return false;
    if (filtros.hasta && (!f.date || f.date > filtros.hasta)) return false;
    if (!texto) return true;

    const ac = f.aircraft_id ? porId.get(f.aircraft_id) : undefined;
    // Las observaciones entran en la búsqueda: es donde el piloto escribe "con
    // Martín", "examen" o "primer solo", o sea exactamente lo que después busca.
    const haystack = [f.route, ac?.registration, ac?.type, f.remarks]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(texto);
  });
}
