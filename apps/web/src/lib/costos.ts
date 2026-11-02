import type { Flight, Transaction } from "@/types";

/**
 * Cuánto salió cada vuelo.
 *
 * Para un alumno de escuela que paga la hora, ésta es la información que más
 * mira, y hasta ahora Vector la tenía toda y no la mostraba nunca: el precio vive
 * en `aircraft.cost_per_hour`, el cobro vive en `transactions`, y la bitácora no
 * decía ni una palabra.
 *
 * **El número sale de la transacción, no de una cuenta.** Es la decisión de diseño
 * de este módulo y no es un detalle: `_sync_flight_transaction` en el backend
 * calcula `duration × cost_per_hour − descuento` **en el momento de cargar el
 * vuelo** y guarda el resultado. Recalcularlo acá con el `cost_per_hour` de hoy
 * mostraría el precio actual en un vuelo de hace seis meses — y en una escuela el
 * precio de la hora sube. La transacción es el precio histórico; la cuenta es una
 * suposición.
 *
 * **Sólo hay costo en modo `balance`.** En modo `packs` el vuelo consume horas de
 * un pack y el backend borra la transacción a propósito, así que no hay pesos que
 * mostrar. La pregunta equivalente ahí —cuántas horas te quedan— ya la contesta
 * `FlightPackWidget`.
 */

/**
 * Lo cobrado por cada vuelo, indexado por `flight_id`.
 *
 * Un mapa y no una búsqueda por vuelo: la bitácora dibuja decenas de filas y
 * recorrer todas las transacciones en cada una es cuadrático sin necesidad.
 */
export function costosPorVuelo(transactions: Transaction[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "charge" || !tx.flight_id) continue;
    // Los cobros se guardan en negativo (`amount: -net_cost`), porque el saldo es
    // la suma de todas las transacciones. Lo que salió el vuelo es su magnitud.
    mapa.set(tx.flight_id, (mapa.get(tx.flight_id) ?? 0) + Math.abs(tx.amount));
  }
  return mapa;
}

/**
 * Lo que salió un vuelo, o `null` si no hay nada confiable que mostrar.
 *
 * **Cero se trata como "no sé", no como "gratis".** Un cobro en cero sale de dos
 * situaciones que desde acá son indistinguibles: la aeronave no tiene precio
 * cargado —de las seis de Federico, cuatro están en 0— o el vuelo tuvo un
 * descuento del 100%. La primera es mucho más común, y escribir "$ 0" sobre un
 * vuelo que el piloto pagó es peor que no escribir nada.
 */
export function costoDeVuelo(flight: Flight, costos: Map<string, number>): number | null {
  const monto = costos.get(flight.id);
  return monto ? monto : null;
}

export interface GastoDelPeriodo {
  pesos: number;
  /** Cuántos vuelos aportaron al total. Los que no tienen costo no cuentan. */
  vuelos: number;
  horas: number;
}

/**
 * Lo gastado en un mes, por la **fecha del vuelo** y no la de la transacción.
 *
 * Importa: `transactions.created_at` es cuándo se cargó el vuelo, no cuándo se
 * voló. Un vuelo de julio anotado en agosto —que es lo que pasa cuando alguien se
 * pone al día con la bitácora— caería en el mes equivocado y haría que "este mes"
 * mienta en los dos meses a la vez.
 *
 * `mes` es "YYYY-MM"; se compara por prefijo de texto, sin construir un `Date`.
 */
export function gastoDelMes(
  flights: Flight[],
  costos: Map<string, number>,
  mes: string
): GastoDelPeriodo {
  let pesos = 0;
  let vuelos = 0;
  let horas = 0;
  for (const f of flights) {
    if (!f.date?.startsWith(mes)) continue;
    const monto = costos.get(f.id);
    if (!monto) continue;
    pesos += monto;
    horas += f.duration || 0;
    vuelos += 1;
  }
  return { pesos, vuelos, horas };
}

/**
 * Pesos argentinos, sin centavos.
 *
 * Los centavos son ruido en cifras de seis y siete dígitos —la hora de un Cessna
 * en el aeroclub anda por los $185.000— y el separador de miles es lo único que
 * hace legible ese número de un vistazo.
 */
export function pesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/**
 * El precio por hora que sale de un vuelo ya cobrado.
 *
 * Se deriva del cobro y la duración en vez de leer `aircraft.cost_per_hour`, por
 * el mismo motivo que todo lo demás en este módulo: éste es el precio que se pagó,
 * el otro es el que rige hoy. Devuelve `null` si el vuelo no tiene costo o dura
 * cero.
 */
export function precioPorHoraDe(flight: Flight, costos: Map<string, number>): number | null {
  const monto = costos.get(flight.id);
  if (!monto || !flight.duration) return null;
  return monto / flight.duration;
}

export interface PrecioMensual {
  /** "YYYY-MM". */
  mes: string;
  /** Promedio ponderado por horas de lo que salió la hora ese mes. */
  porHora: number;
  pesos: number;
  horas: number;
}

/**
 * Lo que costó la hora, mes a mes.
 *
 * Es una serie que ningún piloto tiene en ningún lado y que sale gratis de datos
 * que ya están: cada transacción guarda el precio **del día en que se voló**, así
 * que la serie muestra los aumentos reales de la escuela y no una proyección del
 * precio de hoy hacia atrás.
 *
 * **Ponderado por horas y no promedio de vuelos**: un vuelo de 0,3 h en el avión
 * caro no debería mover el mes tanto como uno de 3 h en el barato.
 *
 * Sólo devuelve los meses con cobros. Un mes sin datos no es un mes a $0, y meterlo
 * como cero hundiría la línea del gráfico hasta el piso.
 */
export function precioPorMes(flights: Flight[], costos: Map<string, number>): PrecioMensual[] {
  const acum = new Map<string, { pesos: number; horas: number }>();
  for (const f of flights) {
    const monto = costos.get(f.id);
    if (!monto || !f.date || !f.duration) continue;
    const mes = f.date.slice(0, 7);
    const a = acum.get(mes) ?? { pesos: 0, horas: 0 };
    a.pesos += monto;
    a.horas += f.duration;
    acum.set(mes, a);
  }
  return Array.from(acum.entries())
    .map(([mes, a]) => ({ mes, pesos: a.pesos, horas: a.horas, porHora: a.pesos / a.horas }))
    .sort((x, y) => x.mes.localeCompare(y.mes));
}
