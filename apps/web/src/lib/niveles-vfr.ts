import { aMagnetico } from "./navegacion";
import tabla from "@/data/niveles-vfr.json";

/**
 * Niveles de crucero de los vuelos VFR, para marcar en "Vientos en altura" qué altitudes le
 * corresponden a la derrota del vuelo. Es información: el piloto decide.
 *
 * ## Fuentes (invariante 6)
 *
 * - **RAAC 91.159(a)**: los vuelos VFR a 3000 pies de altura o más sobre la superficie deben
 *   mantener niveles de crucero según la tabla de la **AIP ENR 1.7, columnas 2 y 4**. La NOTA:
 *   por debajo de 3000 pies no es obligatorio, "aunque tal medida es recomendable". (b): el
 *   ATS puede autorizar otro nivel. (`src/data/raac/raac-91.json`)
 * - **AIP ENR 1.7-6 y 1.7-7** (`src/data/aip/ENR-1.7.txt`): columna 2 = VFR con derrota de
 *   000º a 179º; columna 4 = VFR con derrota de 180º a 359º. La tabla sale de ese texto
 *   (`scripts/niveles-vfr-parse.mjs` → `src/data/niveles-vfr.json`, `npm run build:niveles-vfr`)
 *   y un test revisa las dos direcciones (invariante 12). Nada de la lista está escrito a mano.
 * - **Derrota magnética.** La nota (*) de la ENR 1.7-7 dice que se usa derrota magnética o de
 *   cuadrícula a más de 70º de latitud; es la traducción de la nota de la OACI (Anexo 2,
 *   Apéndice 3), que pide la derrota **magnética** y la de cuadrícula sólo en zonas polares.
 *   Argentina está lejos de eso: acá siempre es la magnética, con la variación del aeródromo
 *   (MADHEL, la misma de "Directo a" y la planilla). Sin variación, no se marca nada.
 * - **Niveles de vuelo.** La Nota de la ENR 1.7-7: la altitud de transición más baja es 3000 ft
 *   y por encima de 3000 ft de altura sobre el terreno es obligatorio usar niveles de vuelo.
 *   Por eso en esas filas se muestra el FL.
 * - Las altitudes de la tabla están sobre el nivel medio del mar; la altura sobre el terreno es
 *   la altitud menos la elevación. **La elevación que se usa es la más alta entre la salida y el
 *   destino**, y el terreno de la ruta puede ser más alto: se dice en la pantalla. Sin
 *   elevación conocida no se afirma nada (invariante 2).
 */

export const ALTURA_OBLIGATORIA_FT = 3000;

const COL2 = new Set<number>(tabla.col2); // VFR, derrota 000º a 179º
const COL4 = new Set<number>(tabla.col4); // VFR, derrota 180º a 359º

/** Los niveles VFR de cada semicírculo, tal como salen del texto del AIP. */
export const NIVELES_VFR = { de000a179: [...tabla.col2], de180a359: [...tabla.col4] } as const;

const normalizar = (grados: number) => ((grados % 360) + 360) % 360;

/** 000º a 179º → columna 2 ("este"); 180º a 359º → columna 4 ("oeste"). 360 es 000. */
export function semicirculo(derrotaMagnetica: number): "000-179" | "180-359" {
  return normalizar(derrotaMagnetica) < 180 ? "000-179" : "180-359";
}

/** ¿`altitudFt` es un nivel de crucero VFR para esa derrota magnética? */
export function esNivelVfr(altitudFt: number, derrotaMagnetica: number): boolean {
  return (semicirculo(derrotaMagnetica) === "000-179" ? COL2 : COL4).has(altitudFt);
}

/** 5500 → "FL055". */
export function nivelDeVuelo(altitudFt: number): string {
  return `FL${String(Math.round(altitudFt / 100)).padStart(3, "0")}`;
}

export interface MarcaVfr {
  /** Tramos de la ruta. */
  tramos: number;
  /** En cuántos la altitud es un nivel VFR para su derrota; `null` si no se sabe la variación. */
  coinciden: number | null;
  /** `true` desde 3000 ft de altura sobre el terreno; `null` si no se sabe la elevación. */
  obligatorio: boolean | null;
}

/**
 * La marca de una altitud para la ruta: por cada tramo, su derrota magnética
 * (`cursoT` + variación W) contra el semicírculo.
 */
export function marcaVfr(
  altitudFt: number,
  cursosVerdaderos: number[],
  variacionW: number | null | undefined,
  elevacionMaxFt: number | null | undefined
): MarcaVfr {
  const conVariacion = typeof variacionW === "number" && Number.isFinite(variacionW);
  return {
    tramos: cursosVerdaderos.length,
    coinciden: conVariacion
      ? cursosVerdaderos.filter((c) => esNivelVfr(altitudFt, aMagnetico(c, variacionW as number))).length
      : null,
    obligatorio:
      typeof elevacionMaxFt === "number" && Number.isFinite(elevacionMaxFt)
        ? altitudFt - elevacionMaxFt >= ALTURA_OBLIGATORIA_FT
        : null,
  };
}
