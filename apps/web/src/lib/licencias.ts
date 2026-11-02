/**
 * Las licencias que se eligen en el alta, y lo que cambia para un alumno piloto.
 *
 * `license_type` es texto libre en la base (el Hangar lo sigue aceptando así, y hay
 * valores viejos como "PPA-HVI"). El alta ofrece una lista para que "Alumno piloto"
 * exista como opción: hasta el 2026-09-24 un alumno escribía cualquier cosa o dejaba
 * "PPA", y la app le mostraba el tracker de la PCA y le pedía un repaso que no tiene.
 *
 * **Lo que decidió Federico para los alumnos (2026-09-24):**
 * - No tienen libro de vuelo: no ven el libro en PDF ni lo que existe para llenarlo
 *   (número de licencia, legajo, renglones por hoja, "cerrar la hoja", importar el
 *   libro de papel). Sus vuelos se registran igual: son los que alimentan el camino a
 *   la PPA (`lib/ppa-progress.ts`).
 * - **Sus horas no cuentan una vez que rinden la PPA.** Al pasar de Alumno a PPA se
 *   pide la fecha (`profiles.fecha_ppa`), y lo que mide el camino a la PCA y lo que va
 *   al libro en PDF arranca ahí (`vuelosDesdeLaPpa`). Quien nunca fue alumno en Vector
 *   no tiene esa fecha y no cambia nada para él.
 *
 * Esto último es una decisión de Federico sobre cómo se aplica en la práctica; la RAAC
 * 61 (Ed. VI) menciona una "bitácora del alumno piloto" en 61.415(a)(8) y la 61.620(a)(1)
 * pide "horas de vuelo como piloto" sin excluir las de alumno. Está anotado en la
 * bitácora del 2026-09-24 por si hay que revisarlo.
 */
import type { Flight } from "@/types";

export const LICENCIA_ALUMNO = "ALUMNO";

export const OPCIONES_LICENCIA: { valor: string; etiqueta: string }[] = [
  { valor: LICENCIA_ALUMNO, etiqueta: "Alumno piloto" },
  { valor: "PPA", etiqueta: "PPA · Piloto privado" },
  { valor: "PCA", etiqueta: "PCA · Piloto comercial" },
  { valor: "TLA", etiqueta: "TLA · Transporte de línea aérea" },
];

export function esAlumno(licencia: string | null | undefined): boolean {
  return (licencia ?? "").toUpperCase().includes(LICENCIA_ALUMNO);
}

/**
 * Los vuelos que cuentan para el camino a la PCA y para el libro: los de desde que rindió
 * la PPA. **Sin fecha, todos**: es el caso de cualquiera que nunca fue alumno en Vector,
 * y para él no cambia nada.
 */
export function vuelosDesdeLaPpa<T extends Pick<Flight, "date">>(vuelos: T[], fechaPpa: string | null | undefined): T[] {
  if (!fechaPpa) return vuelos;
  const desde = fechaPpa.slice(0, 10);
  return vuelos.filter((v) => (v.date ?? "").slice(0, 10) >= desde);
}

/** ¿Este vuelo es de cuando era alumno? Para marcarlo en la Bitácora. */
export function esVueloDeAlumno(fecha: string | null | undefined, fechaPpa: string | null | undefined): boolean {
  return !!fechaPpa && !!fecha && fecha.slice(0, 10) < fechaPpa.slice(0, 10);
}
