import { nightLandingsOf } from "@/lib/landings";
import type { Aircraft, Flight, Logbook } from "@/types";
import { idsDeSimuladores, separarSimuladores } from "@/lib/simulador";

/**
 * El progreso hacia la PCA **y la HVI**, convertido de informe en respuesta.
 *
 * `PCATracker` ya mostraba seis diales —total, PIC, travesía, instrumentos,
 * nocturno, aterrizajes nocturnos— y ahí terminaba. El problema de seis diales es
 * que **el que frena rota**: se puede tener 195 horas totales, con el medidor grande
 * en 97%, y estar trabado por 2 horas de travesía como PIC. El dial chiquito es el
 * que decide qué vuelo conviene hacer, y encontrarlo era trabajo del piloto.
 *
 * Esto contesta las tres preguntas que se hace de verdad: **qué me frena**, **cuándo
 * llego** y **cuánto sale**.
 *
 * Vive acá y no en el componente por dos motivos. Uno, que el proyecto no tiene
 * harness de tests de componentes (`environment: "node"`, sólo `.test.ts`), así que
 * lo que quede adentro del `.tsx` no se puede testear — y estos seis números no
 * tenían ni un test. Dos, que la aritmética de una licencia merece estar en un lugar
 * donde se la pueda leer sin JSX alrededor.
 *
 * ## Por qué las dos licencias juntas y no la PCA sola
 *
 * Porque **casi nadie hace la PCA sola**. En Argentina el camino normal es sacar la
 * comercial y la habilitación de vuelo por instrumentos como un solo tramo, y un
 * tracker que muestra sólo la mitad da una respuesta tranquilizadora a la pregunta
 * equivocada: se puede tener los seis diales de 61.620 en verde y estar a treinta horas
 * de instrumentos del examen que en realidad se va a rendir.
 *
 * Por eso los requisitos llevan `grupo` y la card los muestra en una sola grilla: no
 * son dos trámites que se planifican por separado, son las horas de un mismo libro.
 *
 * ## De dónde salen los números
 *
 * Los mínimos de la PCA son los de **RAAC 61.620** y estaban ya en el componente; esto
 * los mueve, no los reinterpreta.
 *
 * De la HVI se registra **una sola exigencia, la que se mide en horas de bitácora**: 40
 * horas de instrumentos, de las cuales hasta 20 pueden ser en simulador. Es la que el
 * piloto confirmó, y es deliberado que sea la única: **la HVI pide más cosas que
 * Vector no puede verificar** —la travesía IFR con aproximaciones en tres aeródromos
 * distintos, el chequeo de pericia— y el libro no tiene columna donde eso viva.
 * Mostrarlas como diales sería inventar un estado; listarlas sin estado sería ruido.
 * **La card mide lo que puede medir y no pretende ser el trámite completo.**
 */

/** Cuántos meses de historia definen "el ritmo al que venís volando". */
export const MESES_DE_RITMO = 3;

/**
 * A cuál de las dos pertenece el mínimo.
 *
 * No es decorativo: los dos requisitos de instrumentos se ven casi iguales y llevan
 * números distintos —10 h contra 40, y topes de simulador de 5 contra 20—, así que sin
 * la etiqueta el piloto ve dos diales que no sabe distinguir.
 */
export type Grupo = "pca" | "hvi";

export interface Requisito {
  clave: string;
  label: string;
  grupo: Grupo;
  /** Una línea corta bajo el número. Hoy: cuánto de eso puede ser simulador. */
  nota?: string;
  /** Lo acumulado, incluidas las horas de apertura donde corresponde. */
  actual: number;
  objetivo: number;
  /** Meta reducida, informativa. No entra en el cálculo de qué frena. */
  subObjetivo?: number;
  unidad: string;
  /** Si se mide en horas, se le puede poner precio. Los aterrizajes no. */
  esHoras: boolean;
}

/**
 * De dónde sale cada número, por vuelo.
 *
 * Separado de los totales para que el mismo extractor sirva dos veces: una sobre
 * toda la bitácora —el acumulado— y otra sobre los últimos meses —el ritmo—. Sin
 * esto, el ritmo habría que calcularlo aparte y las dos cuentas podrían separarse.
 */
const EXTRACTORES: Record<string, (f: Flight) => number> = {
  total: (f) => f.duration || 0,
  pic: (f) =>
    (f.pic_day_loc || 0) + (f.pic_day_tra || 0) + (f.pic_night_loc || 0) + (f.pic_night_tra || 0),
  picTravesia: (f) => (f.pic_day_tra || 0) + (f.pic_night_tra || 0),
  // El simulado cuenta hasta 5 h, y el tope se aplica sobre el acumulado, no vuelo
  // por vuelo: por eso `instrumentos` se arma abajo y no acá.
  instrumentoReal: (f) => (f.imc_pil || 0) + (f.capota || 0),
  instrumentoSimulado: (f) => f.sim_pil_en_inst || 0,
  /*
    El agregado de los dos, que existe **para el ritmo**.

    Los requisitos no lo usan: ellos aplican el tope de simulador sobre el acumulado y
    se arman abajo. Pero `ritmoMensual` busca el extractor por la clave del requisito,
    y sin una entrada llamada `instrumentos` devolvía cero — o sea que el dial de
    instrumentos contestaba siempre *"no volaste nada de eso en los últimos 3 meses"*
    aunque hubiera horas cargadas. Decir "no hay ritmo" teniendo ritmo es justo lo que
    este archivo existe para no hacer.

    ⚠️ **No aplica el tope**, y no puede: un tope vive en el acumulado, no en un mes.
    Para quien ya lo agotó, la proyección queda optimista. Es preferible a la
    alternativa —callarse— y está dicho acá para que el que lo afine sepa por qué.
  */
  instrumentos: (f) => (f.imc_pil || 0) + (f.capota || 0) + (f.sim_pil_en_inst || 0),
  nocturno: (f) => (f.pic_night_loc || 0) + (f.pic_night_tra || 0),
  aterrizajesNocturnos: (f) => nightLandingsOf(f),
};

const sumar = (flights: Flight[], clave: string): number =>
  flights.reduce((acc, f) => acc + EXTRACTORES[clave](f), 0);

/** Las horas de apertura de todas las bitácoras, por columna. */
const apertura = (logbooks: Logbook[], pick: (l: Logbook) => number | undefined): number =>
  logbooks.reduce((acc, l) => acc + (Number(pick(l)) || 0), 0);

/**
 * Los requisitos de experiencia de la PCA y la HVI, con lo acumulado hasta hoy.
 *
 * Las horas de apertura entran acá y **no** en el ritmo: son horas sin fecha, así que
 * atribuirlas a un mes cualquiera inventaría una velocidad que el piloto no tuvo.
 */
export function requisitosLicencia(
  todos: Flight[],
  logbooks: Logbook[] = [],
  aircraft: Aircraft[] = []
): Requisito[] {
  /*
    **Las sesiones de simulador salen de todo menos de la columna de instrumentos.**

    Las 200 h de experiencia total son horas de vuelo, y una sesión de simulador no lo
    es: contarla infla el requisito más grande del tracker, que es el error que manda a
    alguien a presentarse antes de tiempo.

    Se separa acá y no dentro de cada extractor para que la regla esté en un solo lugar
    y sea imposible que un requisito nuevo se olvide de aplicarla.

    Sin la lista de aeronaves —que es opcional para no romper a ningún llamador— nada
    se marca como simulador y el resultado es el de siempre. Es el mismo criterio que
    el resto de la app: **la ausencia del dato no se interpreta**.
  */
  const { volados: flights, simulados } = separarSimuladores(todos, idsDeSimuladores(aircraft));
  const aperturaPic =
    apertura(logbooks, (l) => l.opening_pic_day_loc) + apertura(logbooks, (l) => l.opening_pic_day_tra) +
    apertura(logbooks, (l) => l.opening_pic_night_loc) + apertura(logbooks, (l) => l.opening_pic_night_tra);
  const aperturaSic =
    apertura(logbooks, (l) => l.opening_sic_day_loc) + apertura(logbooks, (l) => l.opening_sic_day_tra) +
    apertura(logbooks, (l) => l.opening_sic_night_loc) + apertura(logbooks, (l) => l.opening_sic_night_tra);

  /*
    El simulado sale de **las dos** listas: la columna de instrucción terrestre se puede
    llenar tanto en una sesión de simulador —el caso normal— como en un vuelo real que
    incluyó tiempo de instrumentos en tierra.
  */
  const simuladoCrudo = sumar(flights, "instrumentoSimulado") + sumar(simulados, "instrumentoSimulado");
  const realDeInstrumentos =
    sumar(flights, "instrumentoReal") +
    apertura(logbooks, (l) => l.opening_imc_pil) + apertura(logbooks, (l) => l.opening_capota);

  /*
    **El tope de simulador se aplica sobre el acumulado, no vuelo por vuelo**, y es
    distinto para cada licencia: 5 h para la PCA, 20 para la HVI. Por eso los dos
    requisitos de instrumentos no son el mismo número contra dos metas — con 8 h reales
    y 12 simuladas, la PCA cuenta 13 y la HVI cuenta 20.

    Es exactamente el motivo por el que van como dos diales separados y cada uno dice su
    tope: un solo dial tendría que elegir un número y el otro quedaría mal.
  */
  const instrumentosCon = (tope: number) => realDeInstrumentos + Math.min(simuladoCrudo, tope);

  return [
    {
      clave: "total", label: "Experiencia total", grupo: "pca", unidad: "hs", esHoras: true,
      actual: sumar(flights, "total") + aperturaPic + aperturaSic,
      objetivo: 200,
    },
    {
      clave: "pic", label: "PIC", grupo: "pca", unidad: "hs", esHoras: true,
      actual: sumar(flights, "pic") + aperturaPic,
      objetivo: 100, subObjetivo: 70,
    },
    {
      clave: "picTravesia", label: "PIC Travesía", grupo: "pca", unidad: "hs", esHoras: true,
      actual: sumar(flights, "picTravesia")
        + apertura(logbooks, (l) => l.opening_pic_day_tra)
        + apertura(logbooks, (l) => l.opening_pic_night_tra),
      objetivo: 20,
    },
    {
      clave: "instrumentos", label: "Instrumentos", grupo: "pca", unidad: "hs", esHoras: true,
      nota: "hasta 5 en simu",
      actual: instrumentosCon(5), objetivo: 10,
    },
    {
      // La única exigencia de la HVI que se mide en horas de bitácora. Ver el
      // encabezado del módulo: las otras no tienen columna donde vivir, y por eso no
      // están — no porque no existan.
      clave: "instrumentosHvi", label: "Instrumentos HVI", grupo: "hvi", unidad: "hs", esHoras: true,
      nota: "hasta 20 en simu",
      actual: instrumentosCon(20), objetivo: 40,
    },
    {
      clave: "nocturno", label: "PIC Nocturno", grupo: "pca", unidad: "hs", esHoras: true,
      actual: sumar(flights, "nocturno")
        + apertura(logbooks, (l) => l.opening_pic_night_loc)
        + apertura(logbooks, (l) => l.opening_pic_night_tra),
      objetivo: 5,
    },
    {
      // Los aterrizajes de apertura **no** se suman: vienen sin desglose día/noche y
      // suponerlos nocturnos infla un requisito, que es el error que manda a alguien
      // al examen corto. Ver `lib/landings.ts`.
      clave: "aterrizajesNocturnos", label: "Aterrizajes Noct.", grupo: "pca", unidad: "atrr", esHoras: false,
      actual: sumar(flights, "aterrizajesNocturnos"), objetivo: 5,
    },
  ];
}

export interface Freno extends Requisito {
  /** Cuánto falta para cumplirlo. Siempre > 0. */
  faltan: number;
}

/**
 * El requisito que está más lejos de cumplirse, o `null` si están todos.
 *
 * **Se compara en fracción y no en valor absoluto**, que es la única forma de que la
 * pregunta tenga sentido: 3 horas de travesía sobre 20 y 3 aterrizajes nocturnos
 * sobre 5 no son comparables como números sueltos. El que está al 10% de su meta
 * frena más que el que está al 80%, aunque en unidades absolutas le falte menos.
 *
 * `subObjetivo` no participa: es una meta informativa, y usarla acá diría que alguien
 * terminó cuando le falta.
 */
export function loQueFrena(requisitos: Requisito[]): Freno | null {
  const pendientes = requisitos
    .filter((r) => r.actual < r.objetivo)
    .map((r) => ({ ...r, faltan: r.objetivo - r.actual }));

  if (pendientes.length === 0) return null;

  return pendientes.sort((a, b) => {
    const fa = a.actual / a.objetivo;
    const fb = b.actual / b.objetivo;
    if (fa !== fb) return fa - fb;
    // Empate —típicamente dos en cero—: gana el que pide más, que es el que va a
    // tardar más en cerrarse.
    return b.faltan - a.faltan;
  })[0];
}

/**
 * Cuánto de este requisito viene sumando por mes.
 *
 * Se mide sobre **ese** requisito y no sobre las horas totales, porque son cosas
 * distintas: alguien que vuela 8 horas por mes dando vueltas al aeródromo avanza
 * cero en travesía. Proyectar con el ritmo general daría una fecha optimista sobre
 * justo el requisito que lo tiene trabado.
 */
export function ritmoMensual(
  flights: Flight[],
  clave: string,
  hoyIso: string,
  meses = MESES_DE_RITMO
): number {
  // Los dos requisitos de instrumentos avanzan con las mismas horas: lo que cambia es
  // el tope de simulador, y un tope no tiene ritmo. Sin este alias, el dial de la HVI
  // proyectaría siempre "no hay ritmo del que proyectar" teniendo horas cargadas.
  //
  // Se resuelve **una vez** y se usa la clave resuelta también en `sumar`: la primera
  // versión sólo tradujo la búsqueda del extractor y `sumar` volvía a leer la clave
  // original, que no existe en la tabla. Reventaba con `EXTRACTORES[clave] is not a
  // function` — el test lo agarró.
  const clavePropia = clave === "instrumentosHvi" ? "instrumentos" : clave;
  const extractor = EXTRACTORES[clavePropia];
  if (!extractor) return 0;

  const desde = restarMeses(hoyIso, meses);
  const recientes = flights.filter((f) => f.date && f.date >= desde && f.date <= hoyIso);
  return sumar(recientes, clavePropia) / meses;
}

/**
 * En cuántos meses se cierra el requisito al ritmo actual, o `null` si no se puede
 * decir.
 *
 * `null` cuando el ritmo es cero, y es importante que sea `null` y no infinito: sin
 * haber volado nada de eso en los últimos meses **no hay ritmo del que proyectar**, y
 * una app que ahí contesta "nunca" está afirmando algo que no sabe. El piloto puede
 * tener un vuelo de travesía reservado para el sábado.
 */
export function mesesRestantes(faltan: number, ritmo: number): number | null {
  if (ritmo <= 0) return null;
  return faltan / ritmo;
}

/**
 * Piso de lo que falta volar, en horas.
 *
 * **Es un piso y no una estimación**, y la diferencia importa. Un mismo vuelo puede
 * avanzar varios requisitos a la vez —una travesía nocturna como PIC suma a total,
 * PIC, travesía y nocturno—, así que lo mínimo que se puede volar es la brecha más
 * grande de todas, no la suma de las brechas. Decir la suma sería asustar con un
 * número que nadie va a pagar.
 */
export function horasQueFaltan(requisitos: Requisito[]): number {
  return Math.max(0, ...requisitos.filter((r) => r.esHoras).map((r) => r.objetivo - r.actual));
}

/**
 * Cuánto cuesta la hora para este piloto, promediada por lo que efectivamente voló.
 *
 * Ponderada por horas y no un promedio simple de la flota: quien tiene cargado un
 * bimotor caro que voló una vez no paga ese precio todos los meses. Devuelve `null`
 * si ninguna de las aeronaves que voló tiene precio cargado — **sin dato no hay
 * estimación**, y un cero se leería como "gratis".
 */
export function costoPorHora(
  flights: Flight[],
  aircraft: Aircraft[],
  hoyIso: string,
  meses = MESES_DE_RITMO
): number | null {
  const precios = new Map(
    aircraft.filter((a) => a.cost_per_hour && a.cost_per_hour > 0).map((a) => [a.id, a.cost_per_hour!])
  );
  if (precios.size === 0) return null;

  const desde = restarMeses(hoyIso, meses);
  // Con los últimos meses alcanza si voló algo con precio; si no, toda la bitácora,
  // que es mejor que no decir nada por haber estado un trimestre sin volar.
  const recientes = flights.filter((f) => f.date >= desde && f.aircraft_id && precios.has(f.aircraft_id));
  const base = recientes.length > 0
    ? recientes
    : flights.filter((f) => f.aircraft_id && precios.has(f.aircraft_id));

  let horas = 0;
  let pesos = 0;
  for (const f of base) {
    const precio = precios.get(f.aircraft_id!)!;
    horas += f.duration || 0;
    pesos += (f.duration || 0) * precio;
  }

  return horas > 0 ? pesos / horas : null;
}

/** "YYYY-MM-DD" menos N meses, saturando al último día del mes. Todo en UTC. */
function restarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) - meses;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const ultimoDelMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(d, ultimoDelMes))).toISOString().slice(0, 10);
}
