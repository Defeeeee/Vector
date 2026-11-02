import type { Aircraft, Flight } from "@/types";

/**
 * Qué filas del libro son de simulador, y qué deja de contar en ellas.
 *
 * ## Cómo se anota un simulador
 *
 * Igual que un vuelo, porque así se anota en el libro de papel: fecha, horarios, el
 * equipo —`LV-ASG`, tipo C172— y las horas en la columna de **piloto en instrucción
 * terrestre**. Lo que cambia no es la forma de la fila sino qué se hace con ella.
 *
 * ## La marca vive en la aeronave, no en el vuelo
 *
 * Se carga una vez al dar de alta el equipo, y a partir de ahí cada fila que lo use
 * queda marcada sola. Un selector por vuelo se olvida — y olvidarlo significa contar
 * una hora de simulador como hora de vuelo, que infla el requisito más grande del
 * tracker de la licencia.
 *
 * Es la misma razón por la que la performance de crucero vive en `aircraft` y no en el
 * plan: lo que es del equipo se carga una vez.
 */

/** Los ids de las aeronaves que en realidad son simuladores. */
export function idsDeSimuladores(aircraft: Aircraft[]): Set<string> {
  return new Set(aircraft.filter((a) => a.is_simulator).map((a) => a.id));
}

/** Si esta fila del libro es una sesión de simulador. */
export function esVueloDeSimulador(f: Flight, simuladores: Set<string>): boolean {
  return Boolean(f.aircraft_id && simuladores.has(f.aircraft_id));
}

/**
 * Parte la bitácora en lo que voló y lo que no.
 *
 * ## Por qué se excluye **todo** y no sólo la duración
 *
 * Lo obvio sería descontar `duration` y dejar el resto. Pero una fila de simulador con
 * `pic_day_loc` cargado —por un dedo, o importada de una planilla vieja— seguiría
 * sumando horas de PIC que nadie voló, y PIC es el segundo requisito más grande de
 * 61.620.
 *
 * En una sesión de simulador **lo único que existe es la columna de instrucción
 * terrestre**. Todo lo demás en esa fila es un error de carga, no un dato, así que el
 * tracker no lo mira. El formulario además impide escribirlo, pero eso protege las
 * filas nuevas y no las que ya están.
 */
export function separarSimuladores(
  flights: Flight[],
  simuladores: Set<string>
): { volados: Flight[]; simulados: Flight[] } {
  const volados: Flight[] = [];
  const simulados: Flight[] = [];
  for (const f of flights) {
    (esVueloDeSimulador(f, simuladores) ? simulados : volados).push(f);
  }
  return { volados, simulados };
}

/** La bitácora sin las sesiones de simulador: lo que se voló de verdad. */
export function soloVolados(flights: Flight[], aircraft: Aircraft[]): Flight[] {
  return separarSimuladores(flights, idsDeSimuladores(aircraft)).volados;
}

/** Si el equipo elegido en el formulario es un simulador. */
export function esAeronaveSimulador(aircraftId: string, aircraft: Aircraft[]): boolean {
  return aircraft.some((a) => a.id === aircraftId && a.is_simulator);
}

/**
 * Lo que va en la columna de ruta de una sesión de simulador.
 *
 * En el libro de papel esa columna dice **`LOCAL`**, y eso es exactamente lo que hay
 * que poder escribir. Hoy el formulario no lo permite: los dos campos de aeródromo
 * cortan en cuatro caracteres y exigen un código que resuelva, que es la regla
 * correcta para un vuelo —evita que un dedo escriba un aeródromo fantasma que después
 * queda para siempre en el directorio— y la regla equivocada para un simulador, donde
 * no hubo despegue y no hay aeródromo que nombrar.
 *
 * Se acepta texto libre corto, en mayúsculas. Sin guiones **a propósito**:
 * `logFlight` interpreta un guión como separador de ruta multipunto y le saca los
 * espacios, así que `INST - IFR` se guardaría como `INST-IFR`. Un carácter que cambia
 * el dato en silencio no entra.
 */
export const RUTA_SIMULADOR = "LOCAL";

export function normalizarRutaSimulador(texto: string): string {
  const limpio = texto
    .toUpperCase()
    .replace(/[^A-Z0-9 /]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  return limpio || RUTA_SIMULADOR;
}

/**
 * Las horas que se guardan en la columna de tiempo total.
 *
 * **Cero para un simulador, siempre.** Los horarios se cargan igual —2230 a 2330 es
 * lo que dice el libro— pero de ese renglón no sale una hora de vuelo: sale una hora
 * de instrucción terrestre, y va en su propia columna. Poner la duración también en
 * el total sería contar la misma sesión dos veces y, peor, inflar el requisito más
 * grande de la licencia con horas que nadie voló.
 */
export function duracionQueSeGuarda(esSimulador: boolean, total: number): number {
  return esSimulador ? 0 : total;
}

/**
 * Las horas que una fila muestra en una lista.
 *
 * Un vuelo muestra su duración. Un simulador tiene la duración en cero —es lo que hace
 * que no infle nada— así que mostrarla sería listar una sesión de una hora como `0.0`,
 * y una fila que dice cero en la única columna visible parece un error de carga.
 *
 * Se muestran las horas de instrucción. **No se suman las dos columnas**: en el libro de
 * papel una sesión llena una sola, y sumarlas donde alguien haya cargado las dos daría
 * el doble de lo que duró. Primero la del piloto, que es el caso normal; la de
 * instructor sólo cuando es la única.
 */
export function horasDeLaFila(f: Flight, esSimulador: boolean): number {
  if (!esSimulador) return f.duration;
  return f.sim_pil_en_inst || f.sim_instructor || 0;
}
