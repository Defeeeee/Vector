/**
 * Horas de reloj, y la única conversión local↔UTC de la app.
 *
 * **Todo lo que se guarda es UTC.** `flights.takeoff` y `flights.landing` se
 * arman como `${date}T${HH:mm}:00Z`, el motor de auditoría los lee así, y los
 * vuelos programados siguen la misma regla. Lo local es exclusivamente una forma
 * de *mostrar*: el formulario de vuelo tiene un interruptor que cambia lo que se
 * ve y nunca lo que se postea.
 *
 * El comentario de `FlightLogForm` lo dice sin vueltas: invertir eso *"movería
 * todos los vuelos tres horas y rompería en silencio la detección de
 * superposiciones"*. Por eso la conversión vive acá, en un solo lugar y con
 * tests, en vez de repetida en cada formulario que muestre una hora.
 */

/**
 * Argentina es UTC−3 todo el año.
 *
 * **No hay horario de verano desde 2009**, así que una constante es honesta acá y
 * no una simplificación: no existe una fecha del año en la que este número sea
 * otro. Si algún día vuelve el cambio de hora, esto deja de alcanzar y hay que
 * pasar a una zona horaria de verdad — y va a ser evidente, porque todas las
 * horas mostradas se corren una hora.
 */
export const UTC_OFFSET_ARG = -3;

/** `true` si es una hora de reloj "HH:MM" válida. */
export function esHora(hhmm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
}

/**
 * Corre una hora de reloj tantas horas, dando la vuelta al día.
 *
 * Devuelve la entrada intacta si no es una hora válida, para que un campo a medio
 * tipear no se convierta en basura mientras el piloto escribe.
 *
 * **Da la vuelta sin fecha a propósito.** Un vuelo que despega 23:00 local es
 * 02:00 UTC del día siguiente, y esta función devuelve "02:00" sin avisar que
 * cambió el día: quien la use para armar un timestamp completo tiene que resolver
 * esa parte. Hoy nadie lo hace, porque el formulario arma el timestamp con la
 * fecha que el piloto eligió aparte.
 */
export function correrReloj(hhmm: string, horas: number): string {
  if (!esHora(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const corrida = (((h + horas) % 24) + 24) % 24;
  return `${String(corrida).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** De la hora guardada (UTC) a la que se le muestra al piloto. */
export function aLocal(utc: string): string {
  return correrReloj(utc, UTC_OFFSET_ARG);
}

/** De lo que el piloto escribió en local a lo que se guarda (UTC). */
export function aUtc(local: string): string {
  return correrReloj(local, -UTC_OFFSET_ARG);
}

/**
 * Normaliza lo que devuelve Postgres para una columna `time`.
 *
 * PostgREST manda `"14:00:00"`, y los `<input type="time">` y el formulario de
 * vuelo trabajan con `"14:00"`. Sin esto, un valor con segundos entra al prefill
 * y el navegador lo descarta sin decir nada: el campo queda vacío y parece que el
 * dato nunca se guardó.
 */
export function soloHoraYMinuto(valor: string | null | undefined): string {
  if (!valor) return "";
  const m = /^(\d{2}:\d{2})/.exec(valor);
  return m ? m[1] : "";
}

/**
 * Qué anda mal con las horas de un vuelo programado, o `null` si están bien.
 *
 * ## Por qué la validación es nuestra y no del navegador
 *
 * Un `<input type="time">` a medio completar —el caso típico es el AM/PM sin elegir en un
 * navegador con reloj de 12 horas— queda en estado `badInput`: **su `value` es la cadena
 * vacía aunque la hora y los minutos se vean puestos**, y el navegador bloquea el envío con
 * su mensaje genérico. El piloto ve un horario escrito y un cartel que le dice que es
 * inválido, sin decirle qué le falta.
 *
 * Con esto el formulario valida antes y el mensaje lo ponemos nosotros, en castellano y
 * diciendo cuál de los dos campos es.
 *
 * ## Qué **no** valida
 *
 * No exige que el aterrizaje sea posterior al despegue. Un vuelo que sale 23:30 y aterriza
 * 00:40 cruza la medianoche y es perfectamente normal; rechazarlo obligaría a cargar el
 * plan mal a propósito. Y son horas tentativas de un plan, no el registro de un vuelo.
 */
export function problemaDeHoras(despegue: string, aterrizaje: string): string | null {
  /*
    Se normaliza antes de juzgar: un `<input type="time">` con segundos —y hay navegadores
    que los agregan solos— devuelve `"12:30:00"`, que no es `HH:MM` y sería rechazado como
    basura. Es una hora perfectamente buena escrita con un campo de más.
  */
  const roto = (v: string) => v.trim() !== "" && !esHora(soloHoraYMinuto(v.trim()));
  if (roto(despegue)) return "El horario de despegue quedó incompleto. Completá hora y minutos.";
  if (roto(aterrizaje)) return "El horario de aterrizaje quedó incompleto. Completá hora y minutos.";
  return null;
}


/**
 * Lo que el piloto tipeó, convertido a `HH:MM`, o el texto intacto si no se entiende.
 *
 * ## Por qué el calendario dejó de usar `<input type="time">`
 *
 * Porque para un piloto de verdad **no producía ningún valor**. El reporte llegó dos veces:
 * primero como el globo del navegador, después como nuestro cartel; y la consulta a la base
 * lo cerró — el vuelo `SADF SAZM` del 21/08 quedó guardado con `takeoff_time` y
 * `landing_time` en `null` **con los horarios escritos en pantalla**.
 *
 * O sea que no era un cartel mal puesto: el widget nativo consideraba el campo incompleto y
 * devolvía la cadena vacía, y ninguna cantidad de afinar la detección iba a hacer aparecer
 * un dato que el navegador nunca entregó. Qué segmento le faltaba —AM/PM, segundos, algo de
 * locale— no se pudo determinar: **Chromium no reproduce el estado**, y el picker mostraba
 * `15:30`, que en un reloj de 12 horas no se puede ni escribir.
 *
 * Con un campo de texto el valor es, literalmente, lo que el piloto escribió. No hay
 * segmentos, ni `badInput`, ni locale, ni AM/PM. La validación pasa a ser `problemaDeHoras`,
 * que ya existía y ya estaba testeada.
 *
 * ## Qué acepta
 *
 * Las dos formas en que se escribe una hora en una planilla: `1530` y `15:30`. Tres dígitos
 * se leen como `H:MM` —`930` es `09:30`—, que es la abreviación natural y no la ambigua.
 *
 * **Uno o dos dígitos se devuelven intactos a propósito.** Leer `9` como `09:00` sería
 * inventar los minutos: el piloto puede haber querido `09:30` y haberse ido del campo antes
 * de terminar. Queda como está y `problemaDeHoras` le dice que complete hora y minutos.
 *
 * Lo que no cierra —`2515`, `1265`, letras— también vuelve intacto, por la misma razón:
 * esta función normaliza, no adivina. Rechazarlo es trabajo de `problemaDeHoras`, que además
 * explica cuál de los dos campos es.
 */
export function normalizarHoraTipeada(texto: string): string {
  const limpio = texto.trim();
  if (limpio === "") return "";

  const digitos = limpio.replace(/\D/g, "");
  if (digitos.length < 3) return limpio;

  /*
    Los dos últimos dígitos son los minutos y el resto la hora. No hace falta acotar por
    arriba: con cinco dígitos o más la hora queda de tres caracteres y `esHora` la rechaza,
    así que **el único juez del resultado es `esHora`** y no hay una segunda regla de
    longitud que pueda desincronizarse de ella.
  */
  const corte = digitos.length - 2;
  const hhmm = `${digitos.slice(0, corte).padStart(2, "0")}:${digitos.slice(corte)}`;
  return esHora(hhmm) ? hhmm : limpio;
}

/** Lo que se deja tipear mientras se escribe: dígitos, dos puntos y nada más. */
export function filtrarHoraTipeada(texto: string): string {
  return texto.replace(/[^\d:]/g, "").slice(0, 5);
}

/**
 * Los dos instantes de un vuelo, en UTC, a partir de la fecha y los horarios HH:MM (UTC).
 *
 * **Si la llegada queda antes que la salida, el vuelo cruzó la medianoche UTC** y la
 * llegada es del día siguiente. Pasa con cualquier vuelo nocturno cargado en hora local
 * (20:00 a 21:32 en Argentina son 23:00Z a 00:32Z) y con uno cargado en UTC que cruce las
 * 00Z. Hasta el 2026-09-24 se guardaba la llegada el mismo día, antes que la salida, y la
 * auditoría de superposiciones leía un vuelo de duración negativa.
 */
export function horariosDelVuelo(fecha: string, salida: string, llegada: string): { takeoff_dt: string; landing_dt: string } {
  const aIso = (d: Date) => d.toISOString().split(".")[0] + "Z";
  const despegue = new Date(`${fecha}T${salida}:00Z`);
  let aterrizaje = new Date(`${fecha}T${llegada}:00Z`);
  if (aterrizaje.getTime() <= despegue.getTime()) aterrizaje = new Date(aterrizaje.getTime() + 86_400_000);
  return { takeoff_dt: aIso(despegue), landing_dt: aIso(aterrizaje) };
}
