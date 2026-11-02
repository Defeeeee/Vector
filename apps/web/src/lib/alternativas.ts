import { distanciaNmPrecisa } from "./distance";

/**
 * Aeródromos al alcance desde un punto de la ruta.
 *
 * ## Qué pregunta contesta
 *
 * "Si tengo que bajar acá, ¿dónde?". El planificador ya calcula la ruta y el
 * combustible; lo que faltaba era cruzar eso con el directorio de 711 aeródromos que
 * Vector ya tiene cargado.
 *
 * ## Lo que esto NO es
 *
 * **No es una alternativa legal ni una recomendación operativa.** No sabe si la pista
 * alcanza para tu avión, si está habilitada hoy, si tiene combustible o si el NOTAM la
 * cerró. Sabe dónde hay un aeródromo y a qué distancia — que es exactamente lo que un
 * piloto quiere ver en un mapa y lo que hoy tiene que buscar a mano en la carta.
 *
 * Por eso la pantalla lo llama "aeródromos cerca" y no "alternativas": prometer menos y
 * cumplirlo.
 */

export interface CandidatoAlternativa {
  icao: string;
  label: string;
  lat: number;
  lon: number;
  /** Designador ANAC, si tiene. Es como se lo nombra en muchos de estos campos. */
  local?: string;
  /** Pistas conocidas. Vacío en la mayoría: sólo 93 de 711 tienen datos. */
  pistas?: { le: string; he: string; rumboT: number; largoFt?: number; superficie?: string; fuente?: "medida" | "estimada" }[];
}

export interface Alternativa extends CandidatoAlternativa {
  distanciaNm: number;
  /** Minutos a la ground speed que se le pase. `null` si no hay velocidad. */
  minutos: number | null;
  /** El largo de la pista más larga conocida, en pies. `null` si no se sabe. */
  pistaMasLargaFt: number | null;
}

/**
 * Radio por defecto de la búsqueda.
 *
 * 40 NM son unos veinte minutos a velocidad de un monomotor: lo bastante cerca como para
 * llegar con margen y lo bastante lejos como para que en la pampa aparezca algo. Un
 * radio más grande llena el mapa de puntos que no ayudan a decidir.
 */
export const RADIO_POR_DEFECTO_NM = 40;

/** Cuántas mostrar. Más de seis en un mapa dejan de leerse. */
export const MAX_ALTERNATIVAS = 6;

/**
 * Los aeródromos dentro de un radio, del más cercano al más lejano.
 *
 * **Excluye el punto mismo.** Un aeródromo a menos de 1 NM del punto consultado es el
 * punto consultado: ofrecerlo como alternativa de sí mismo sería ruido.
 */
export function alternativasCerca(
  desde: { lat: number; lon: number },
  candidatos: CandidatoAlternativa[],
  opciones: { radioNm?: number; limite?: number; groundSpeedKt?: number | null } = {}
): Alternativa[] {
  const radio = opciones.radioNm ?? RADIO_POR_DEFECTO_NM;
  const limite = opciones.limite ?? MAX_ALTERNATIVAS;
  const gs = opciones.groundSpeedKt ?? null;

  return candidatos
    .map((c) => {
      const distanciaNm = distanciaNmPrecisa(desde.lat, desde.lon, c.lat, c.lon);
      const largos = (c.pistas ?? [])
        .map((p) => p.largoFt)
        .filter((l): l is number => typeof l === "number" && l > 0);

      return {
        ...c,
        distanciaNm,
        minutos: gs && gs > 0 ? (distanciaNm / gs) * 60 : null,
        pistaMasLargaFt: largos.length ? Math.max(...largos) : null,
      };
    })
    .filter((a) => a.distanciaNm > 1 && a.distanciaNm <= radio)
    .sort((a, b) => a.distanciaNm - b.distanciaNm)
    .slice(0, limite);
}

/**
 * Hasta dónde se puede llegar con el combustible que queda.
 *
 * Es `horas útiles × ground speed`, y las horas útiles ya tienen la reserva descontada
 * —de eso se ocupa `computeFuel`—. Se pasa el resultado de esa función, no sus insumos,
 * justamente para no reimplementar la política de reservas en un segundo lugar.
 *
 * `null` cuando falta cualquiera de los dos: sin combustible cargado o sin velocidad, el
 * alcance no se estima.
 */
export function alcanceNm(horasUtiles: number | null, groundSpeedKt: number | null): number | null {
  if (horasUtiles === null || groundSpeedKt === null) return null;
  if (!(horasUtiles > 0) || !(groundSpeedKt > 0)) return null;
  return horasUtiles * groundSpeedKt;
}
