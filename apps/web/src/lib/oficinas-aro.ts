/**
 * Las oficinas ARO/AIS de EANA donde se presenta el plan de vuelo.
 *
 * Salen del **Anexo ALFA de la AIC A 19/2026** (17/06/2026, cancela la A 08/2025): 49
 * oficinas con su correo y sus teléfonos. El texto de la AIC está commiteado en
 * `src/data/aic-oficinas-aro.txt` y `oficinas-aro.test.ts` contrasta la tabla contra él
 * en los dos sentidos, como el AIP (invariante 12).
 *
 * **A dónde se manda** (AIC A 19/2026, punto 2): "a la oficina ARO/AIS del aeródromo de
 * salida o a la más cercana que se encuentre brindando servicio". Para un alumno que
 * sale de un aeródromo sin oficina —la mayoría de los aeroclubes— eso es la más cercana,
 * y `oficinaParaSalida` la propone. **Propone, no decide:** "la más cercana que esté
 * brindando servicio" depende del horario de cada oficina, que la AIC no publica. Por
 * eso la pantalla deja elegir otra y muestra el teléfono.
 *
 * Puro: recibe el texto del TSV. Quien lee el disco es la página del planificador.
 */
import { distanciaNmPrecisa } from "./distance";

export interface OficinaAro {
  /** El aeródromo donde está la oficina. */
  oaci: string;
  /** Dirección AFTN/AMHS. La AIC la publica; para el mail no hace falta. */
  aftn: string;
  correo: string;
  /** Tal como los publica la AIC, con internos y celulares. */
  telefonos: string;
  fir: string;
}

export interface OficinaUbicada extends OficinaAro {
  /** El nombre corto del aeródromo, para el selector: "San Fernando". */
  nombre: string;
  /** El horario del ARO según la AIP (AD 2.3), tal cual. Sin ficha en la AIP, no hay. */
  horario?: string;
  lat?: number;
  lon?: number;
}

export function parsearOficinas(tsv: string): OficinaAro[] {
  return tsv
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const [oaci, aftn, correo, telefonos, fir] = l.split("\t");
      return { oaci, aftn, correo, telefonos, fir };
    });
}

/**
 * El primer número de la lista, listo para un link `tel:`.
 *
 * La AIC los escribe de varias formas —`(+54 11) 45800261`, `(54 341) 4513202`,
 * `(+54 011) 44802444`, `(+54 9 351) 2921338`— y el teléfono los necesita todos como
 * `+54…`. El cero de larga distancia sobra después del 54. Un número que no tenga la
 * forma esperada devuelve `null`: mejor sin botón que un botón que llama a otro lado.
 */
export function primerTelefono(telefonos: string): { mostrar: string; marcar: string } | null {
  const m = /\(\+?54\s+((?:9\s+)?)0?(\d{2,4})\)\s*(\d{6,8})/.exec(telefonos);
  if (!m) return null;
  const nueve = m[1].trim();
  const marcar = `+54${nueve}${m[2]}${m[3]}`;
  return { mostrar: m[0].replace(/\s+/g, " "), marcar };
}

/**
 * La oficina que corresponde a una salida: la del aeródromo si tiene, si no la más
 * cercana. `null` si el aeródromo no tiene oficina y no hay coordenadas para medir.
 */
export function oficinaParaSalida(
  salida: { codigo: string; lat?: number; lon?: number },
  oficinas: OficinaUbicada[]
): { oficina: OficinaUbicada; propia: boolean; distanciaNm?: number } | null {
  const propia = oficinas.find((o) => o.oaci === salida.codigo.trim().toUpperCase());
  if (propia) return { oficina: propia, propia: true };
  if (salida.lat === undefined || salida.lon === undefined) return null;

  let mejor: { oficina: OficinaUbicada; distanciaNm: number } | null = null;
  for (const o of oficinas) {
    if (o.lat === undefined || o.lon === undefined) continue;
    const d = distanciaNmPrecisa(salida.lat, salida.lon, o.lat, o.lon);
    if (!mejor || d < mejor.distanciaNm) mejor = { oficina: o, distanciaNm: d };
  }
  return mejor ? { ...mejor, propia: false } : null;
}

/**
 * Las `n` oficinas más cercanas a la salida, de la más cercana a la más lejana: para
 * sugerir a cuál mandar si la del aeródromo está cerrada a esa hora (AIC A 19/2026). La
 * del propio aeródromo, si tiene, va primera. Sin coordenadas, sólo la propia.
 */
export function oficinasCercanas(
  salida: { codigo: string; lat?: number; lon?: number },
  oficinas: OficinaUbicada[],
  n = 3
): { oficina: OficinaUbicada; propia: boolean; distanciaNm: number }[] {
  const codigo = salida.codigo.trim().toUpperCase();
  const { lat, lon } = salida;
  if (lat === undefined || lon === undefined) {
    const propia = oficinas.find((o) => o.oaci === codigo);
    return propia ? [{ oficina: propia, propia: true, distanciaNm: 0 }] : [];
  }
  return oficinas
    .filter((o) => o.oaci === codigo || (o.lat !== undefined && o.lon !== undefined))
    .map((o) => ({
      oficina: o,
      propia: o.oaci === codigo,
      distanciaNm: o.oaci === codigo || o.lat === undefined || o.lon === undefined ? 0 : distanciaNmPrecisa(lat, lon, o.lat, o.lon),
    }))
    .sort((a, b) => Number(b.propia) - Number(a.propia) || a.distanciaNm - b.distanciaNm)
    .slice(0, n);
}

/**
 * El horario de la oficina ARO (AIP AD 2.3, `aip-horarios-aro.tsv`) y si está abierta a la
 * hora de salida.
 *
 * **Sólo se contesta lo que el texto dice sin ambigüedad:** `H24`, o un único rango
 * `HH:MM-HH:MM UTC` (que puede pasar la medianoche: `10:00-01:00`). Con días de la semana,
 * "O/R" (a pedido), "SS" (puesta del sol) o feriados, `abierta` es `null` y la pantalla
 * muestra el horario tal cual: decidir mal que una oficina atiende es peor que no decirlo.
 */
export function horarioAro(texto: string | undefined, eobtUtc?: string): { texto: string; abierta: boolean | null } | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  // La AIP lo escribe en castellano / inglés: se muestra la mitad en castellano si es entera.
  const partes = t.split(" / ");
  const castellano = partes.length === 2 && /UTC|H24|O\/R/.test(partes[0]) ? partes[0].trim() : t;
  if (/^H24$/.test(t)) return { texto: "H24", abierta: true };

  const rango = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})(?::\d{2})?\s*UTC(\s*\(\*+\))*$/.exec(t);
  if (!rango || !/^\d{4}$/.test(eobtUtc ?? "")) return { texto: castellano, abierta: null };
  const min = (h: string, m: string) => Number(h) * 60 + Number(m);
  const desde = min(rango[1], rango[2]);
  const hasta = min(rango[3], rango[4]);
  const salida = min(eobtUtc!.slice(0, 2), eobtUtc!.slice(2));
  const abierta = desde <= hasta ? salida >= desde && salida <= hasta : salida >= desde || salida <= hasta;
  return { texto: castellano, abierta };
}

export function parsearHorarios(tsv: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of tsv.split("\n")) {
    if (!l.trim() || l.startsWith("#")) continue;
    const [oaci, horario] = l.split("\t");
    m.set(oaci, horario);
  }
  return m;
}
