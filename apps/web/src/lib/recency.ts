import { Aircraft, Flight } from "@/types";
import { documentStatus, DocumentStatus } from "@/lib/utils";

/**
 * Experiencia reciente — RAAC Parte 61, Sección 61.140.
 *
 * Contesta la pregunta que Vector no contestaba: **¿puedo llevar pasajeros hoy?**
 *
 * El texto que implementa esto, literal:
 *
 * > "Ninguna persona puede actuar como piloto al mando (PIC) o copiloto (SIC) de
 * > una aeronave a menos que, dentro de los 90 días precedentes, haya realizado
 * > tres (3) despegues y tres (3) aterrizajes con sus respectivos circuitos de
 * > tránsito como la única persona que manipula los controles de una aeronave en
 * > cada categoría, clase, y si correspondiere a un tipo" — 61.140(a)(1)
 *
 * > "En el caso de los pilotos privados, pilotos de planeador y pilotos de globo
 * > libre el cumplimiento del requisito dispuesto en el apartado (a)(1) de esta
 * > sección, se extiende hasta 180 días." — 61.140(a)(2)
 *
 * Los números de acá salen de la RAAC 61 Edición VI (enero 2026), no de la
 * memoria de nadie. Si se tocan, hay que volver a la norma.
 */

/** 61.140(a)(1) — el caso general. */
export const RECENCY_DAYS_GENERAL = 90;
/** 61.140(a)(2) — piloto privado, planeador y globo libre. */
export const RECENCY_DAYS_PRIVATE = 180;
/** 61.140(a)(1) — tres despegues y tres aterrizajes. */
export const REQUIRED_LANDINGS = 3;

/**
 * Ventana que le corresponde a una licencia.
 *
 * `license_type` es texto libre —en la base hay valores como "PPA", "Privado" y
 * "-"— así que se reconoce igual que ya lo hace `PCATracker`: por subcadena. Un
 * valor que no matchee cae en los 90 días, que es el caso general y el más
 * exigente: equivocarse hacia el lado estricto avisa de más, nunca de menos.
 *
 * Quien consuma esto **tiene que mostrar qué ventana se usó**, para que un valor
 * raro en ese campo sea visible en pantalla y no una decisión silenciosa.
 */
export function recencyWindowDays(licenseType?: string | null): number {
  const l = (licenseType ?? "").toUpperCase();
  const esPrivado = l.includes("PPA") || l.includes("PRIVADO") ||
    l.includes("PLANEADOR") || l.includes("GLOBO");
  return esPrivado ? RECENCY_DAYS_PRIVATE : RECENCY_DAYS_GENERAL;
}

export interface ClassRecency {
  /** Clase de aeronave tal como la guarda `Aircraft.type_acft` (MONT-T, MULT-T…). */
  clase: string;
  /** Aterrizajes computables dentro de la ventana. */
  landings: number;
  /** ISO date en que se pierde la vigencia, o null si nunca se alcanzaron los 3. */
  expiresOn: string | null;
  /** Estado listo para pintar, con el mismo vocabulario que los documentos. */
  status: DocumentStatus | null;
  vigente: boolean;
}

/**
 * Un vuelo computa si el piloto fue **la única persona que manipula los
 * controles** (61.140(a)(1)). Vector no registra eso directamente, así que el
 * proxy es haber anotado tiempo PIC o SIC — la sección aplica a los dos.
 *
 * Es un proxy y conviene saberlo: un vuelo de instrucción anotado sólo como
 * instrucción recibida no suma, y así debe ser.
 */
const computa = (f: Flight): boolean =>
  (f.pic_day_loc || 0) + (f.pic_day_tra || 0) + (f.pic_night_loc || 0) + (f.pic_night_tra || 0) +
  (f.sic_day_loc || 0) + (f.sic_day_tra || 0) + (f.sic_night_loc || 0) + (f.sic_night_tra || 0) > 0;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Vigencia por clase de aeronave.
 *
 * **Por clase y no global**, porque la norma dice "en cada categoría, clase, y si
 * correspondiere a un tipo": estar vigente en monomotor no habilita a subirse a un
 * multimotor.
 *
 * El vencimiento es la fecha del vuelo donde se completó el tercer aterrizaje
 * hacia atrás, más la ventana. Es decir: el día que ese aterrizaje sale de la
 * ventana, la vigencia se pierde.
 *
 * **Los saldos iniciales de los libros no participan.** No tienen fecha, así que no
 * se puede saber si caen dentro de la ventana. Un piloto que cargó su historial
 * como saldo inicial va a aparecer sin vigencia hasta que registre vuelos, y la UI
 * tiene que decirlo — es el mismo criterio que `PCATracker` documenta para los
 * aterrizajes nocturnos.
 */
export function recencyByClass(
  flights: Flight[],
  aircraft: Aircraft[],
  windowDays: number,
  today = new Date()
): ClassRecency[] {
  const claseDe = new Map(aircraft.map((a) => [a.id, (a.type_acft || "Sin clase").trim()]));
  const porClase = new Map<string, Flight[]>();

  for (const f of flights) {
    if (!computa(f)) continue;
    const clase = (f.aircraft_id && claseDe.get(f.aircraft_id)) || "Sin clase";
    const lista = porClase.get(clase);
    if (lista) lista.push(f);
    else porClase.set(clase, [f]);
  }

  const desde = new Date(today);
  desde.setUTCDate(desde.getUTCDate() - windowDays);
  const desdeIso = desde.toISOString().slice(0, 10);

  const salida: ClassRecency[] = [];

  for (const [clase, lista] of porClase) {
    const ordenados = [...lista].sort((a, b) => b.date.localeCompare(a.date));

    let acumulados = 0;
    let fechaDelTercero: string | null = null;
    for (const f of ordenados) {
      acumulados += f.landings || 0;
      if (acumulados >= REQUIRED_LANDINGS) {
        fechaDelTercero = f.date.slice(0, 10);
        break;
      }
    }

    const enVentana = ordenados
      .filter((f) => f.date.slice(0, 10) >= desdeIso)
      .reduce((acc, f) => acc + (f.landings || 0), 0);

    const expiresOn = fechaDelTercero ? addDays(fechaDelTercero, windowDays) : null;

    salida.push({
      clase,
      landings: enVentana,
      expiresOn,
      status: expiresOn ? documentStatus(expiresOn, today) : null,
      vigente: enVentana >= REQUIRED_LANDINGS,
    });
  }

  return salida.sort((a, b) => a.clase.localeCompare(b.clase));
}

/**
 * Recencia nocturna — 61.140(b).
 *
 * **No se calcula, y no es un olvido.** La norma pide, en los 180 días
 * precedentes, tres despegues y aterrizajes nocturnos *hasta la completa
 * detención*. Vector no registra ninguno de los dos datos: `landings` es un solo
 * número sin desglose día/noche, y no hay nada que diga si el aterrizaje fue
 * completo o un toque y despegue.
 *
 * Estimarlo daría una respuesta legal inflada, que es exactamente el error que
 * este plan viene a arreglar en `PCATracker`.
 *
 * Lo único que sí se puede afirmar viene de 61.140(b)(2): quien mantenga una
 * habilitación de vuelo por instrumentos vigente cumple el requisito nocturno sin
 * necesidad de los tres aterrizajes.
 */
export type NightRecency =
  | { estado: "cumple_por_hvi" }
  | { estado: "no_calculable"; motivo: string };

export function nightRecency(tieneHviVigente: boolean): NightRecency {
  if (tieneHviVigente) return { estado: "cumple_por_hvi" };
  return {
    estado: "no_calculable",
    motivo:
      "Tu libro no registra si los aterrizajes fueron nocturnos ni si fueron hasta la detención completa, " +
      "así que Vector no puede afirmar tu vigencia nocturna.",
  };
}
