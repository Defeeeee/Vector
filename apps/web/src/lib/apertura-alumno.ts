import type { AperturaPPA, Logbook } from "@/types";

/**
 * Las horas de antes de un alumno piloto (`logbooks.apertura_ppa`, migración 028).
 *
 * El alta ofrece arrancar con los totales en vez de cargar vuelo por vuelo (Federico,
 * 2026-10-20: de 16 cuentas, una sola cargó vuelos). El piloto copia la fila de totales de su
 * libro de papel en las columnas `opening_*`. El alumno no lleva libro: sus horas se cuentan
 * contra RAAC 61.520(a), con un desglose que no entra en esas columnas. Por eso van aparte:
 * - el tracker de la PPA (`ppa-progress.ts`) usa cada parte en su requisito;
 * - los totales (`openingTotals`) las suman como se guardan los vuelos del alumno, en las
 *   columnas de piloto (ver `celdasDeAperturaPPA`).
 *
 * **No cuentan una vez rendida la PPA**, como sus vuelos (regla de Federico, migración
 * 022): quien sabe que ya no es alumno las deja afuera.
 *
 * Puro.
 */

export const APERTURA_PPA_VACIA: AperturaPPA = {
  doble_mando: 0,
  solo: 0,
  solo_travesia: 0,
  instruccion_nocturna: 0,
  aterrizajes_nocturnos: 0,
  travesia_larga: false,
};

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Las de todos los libros sumadas (en la práctica, un alumno tiene uno). */
export function aperturaDelAlumno(libros: Pick<Logbook, "apertura_ppa">[]): AperturaPPA {
  return libros.reduce<AperturaPPA>((acc, l) => {
    const a = l.apertura_ppa;
    if (!a) return acc;
    return {
      doble_mando: acc.doble_mando + n(a.doble_mando),
      solo: acc.solo + n(a.solo),
      solo_travesia: acc.solo_travesia + n(a.solo_travesia),
      instruccion_nocturna: acc.instruccion_nocturna + n(a.instruccion_nocturna),
      aterrizajes_nocturnos: acc.aterrizajes_nocturnos + n(a.aterrizajes_nocturnos),
      travesia_larga: acc.travesia_larga || a.travesia_larga === true,
    };
  }, APERTURA_PPA_VACIA);
}

/** El total de horas: doble mando más vuelo solo. */
export function horasDeAperturaPPA(a: AperturaPPA): number {
  return n(a.doble_mando) + n(a.solo);
}

/**
 * Las horas, en las columnas del desglose, como se guardan los vuelos del alumno
 * (`VueloAlumnoForm`: todo en las de piloto). Lo que no se sabe se pone donde menos
 * inventa: el doble mando de día va a "sobre aeródromo", porque el alumno no dijo cuánto
 * fue de travesía.
 */
export function celdasDeAperturaPPA(a: AperturaPPA) {
  const noche = n(a.instruccion_nocturna);
  const travesia = n(a.solo_travesia);
  return {
    pic_day_loc: Math.max(0, horasDeAperturaPPA(a) - noche - travesia),
    pic_day_tra: travesia,
    pic_night_loc: noche,
  };
}

/** Lo que está mal escrito, o `null`. Las partes no pueden superar al todo. */
export function revisarAperturaPPA(a: AperturaPPA): string | null {
  for (const [clave, valor] of Object.entries(a)) {
    if (clave === "travesia_larga") continue;
    if (!Number.isFinite(Number(valor)) || Number(valor) < 0) return "Los números van en positivo.";
  }
  if (n(a.doble_mando) > 300 || n(a.solo) > 300) return "Revisá las horas: son demasiadas para un alumno.";
  if (n(a.solo_travesia) > n(a.solo)) return "Las horas de solo de travesía no pueden ser más que las de vuelo solo.";
  if (n(a.instruccion_nocturna) > n(a.doble_mando)) return "Las horas de instrucción nocturna no pueden ser más que las de doble mando.";
  return null;
}
