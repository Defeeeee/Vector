/**
 * De cuándo es un dato meteorológico.
 *
 * ## Por qué esto existe, y por qué bloquea a la PWA
 *
 * El peor bug de la historia de esta app fue de esta familia. `categoryConfig` le daba
 * a `UNK` la misma severidad que a `VFR`, y una estación que no contestaba se marcaba
 * `UNK`: **si se caía la meteorología para toda la ruta, la pantalla anunciaba "Ruta
 * 100% VFR habilitada — condiciones meteorológicas excelentes"**.
 *
 * Se arregló contando estaciones, y ese arreglo cubre *"¿pudimos preguntar?"*. Pero no
 * cubre *"¿de cuándo es esto?"*: hasta hoy no había un solo componente en el repo que
 * mostrara la antigüedad de un METAR. Era tolerable mientras el dato tenía como mucho
 * cinco minutos —el `revalidate: 300` de la ruta—. **Un service worker lo vuelve
 * inaceptable**: una respuesta guardada puede ser de hace tres horas y se renderizaría
 * idéntica a una de hace tres minutos.
 *
 * Por eso este archivo va **antes** de que la PWA guarde una sola respuesta de
 * meteorología. Y tiene valor propio aunque la PWA no exista: hoy un METAR de 55
 * minutos se ve igual que uno de dos.
 */

/**
 * Hasta cuándo un METAR es lo que está pasando afuera.
 *
 * Un METAR se emite **una vez por hora**, con un SPECI en el medio si cambia algo
 * relevante. O sea que hasta unos 75 minutos —la hora del ciclo más el margen de
 * publicación— lo normal es que el más reciente tenga esa edad y no haya nada mejor.
 */
export const FRESCO_MIN = 75;

/**
 * A partir de acá deja de ser meteorología.
 *
 * Dos horas es un ciclo entero perdido: si el de la hora pasada no llegó, o la estación
 * dejó de emitir o nosotros dejamos de poder preguntar. En cualquiera de los dos casos
 * **lo que hay no describe el cielo de ahora**, y tratarlo como si lo hiciera es
 * exactamente el bug de 2026 con otro disfraz.
 *
 * Un dato así no se muestra como dato: se dice que no lo tenemos.
 */
export const INSERVIBLE_MIN = 120;

export type NivelFrescura = "fresco" | "viejo" | "inservible";

export interface Frescura {
  minutos: number;
  /** "hace 12 min", "hace 2 h 10". En castellano y sin `Intl.RelativeTimeFormat`. */
  texto: string;
  nivel: NivelFrescura;
}

/**
 * El grupo `DDHHMMZ` que **todo METAR lleva adentro**: `METAR SADM 202200Z 19007KT…`.
 *
 * Se busca en cualquier posición porque el prefijo `METAR` es opcional y algunas
 * estaciones anteponen `COR` o `AUTO`.
 */
const GRUPO_HORA = /\b(\d{2})(\d{2})(\d{2})Z\b/;

/**
 * Cuándo se observó, o `null` si no se puede saber.
 *
 * ## Dos fuentes, y gana la que el piloto puede verificar
 *
 * `obsTime` viene del proveedor; el grupo `DDHHMMZ` viene adentro del texto del METAR.
 * **Cuando discrepan gana el grupo**, porque es el que el piloto lee en pantalla y
 * puede contrastar contra su reloj. Un cartel que dijera "hace 10 min" al lado de un
 * texto que dice `202200Z` cuando son las 23:40Z sería peor que no decir nada.
 *
 * El grupo trae **día del mes pero no mes**, así que hay que resolverlo contra el
 * ahora: se prueba el mes en curso y el anterior, y se elige la fecha más reciente que
 * no esté en el futuro. Ese rodeo es lo que hace que un METAR del día 31 leído el 1º
 * no se interprete como del mes que viene.
 *
 * `null` cuando no hay ninguna de las dos. **Nunca se asume que es fresco**: sin fecha
 * no se afirma nada, que es la regla de toda esta app.
 */
export function horaDeObservacion(
  obsTime: number | string | null | undefined,
  metarCrudo: string | null | undefined,
  ahora: Date
): Date | null {
  const delGrupo = deGrupoHorario(metarCrudo, ahora);
  if (delGrupo) return delGrupo;

  if (typeof obsTime === "string" && obsTime.trim() !== "") {
    const d = new Date(obsTime);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /*
    ⚠️ El upstream de `aviationweather.gov` manda `obsTime` en **segundos**, no en
    milisegundos. Pasárselo a `new Date()` sin multiplicar da enero de 1970 — o sea
    "hace 56 años" si sale bien, y algo peor si alguien lo compara mal y lo da por
    fresco. El umbral de mil millones separa las dos escalas para cualquier fecha
    razonable: en segundos, el año 2001 en adelante; en milisegundos, hasta 1970.
  */
  if (typeof obsTime === "number" && Number.isFinite(obsTime) && obsTime > 0) {
    return new Date(obsTime < 1e11 ? obsTime * 1000 : obsTime);
  }

  return null;
}

function deGrupoHorario(metarCrudo: string | null | undefined, ahora: Date): Date | null {
  const m = GRUPO_HORA.exec(metarCrudo ?? "");
  if (!m) return null;

  const [, dd, hh, mm] = m;
  const dia = Number(dd);
  const hora = Number(hh);
  const minuto = Number(mm);
  if (dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;

  /*
    Se prueban el mes en curso y el anterior, y gana la fecha más reciente que no esté
    en el futuro. **Se toleran dos horas de futuro** por relojes desfasados: un teléfono
    atrasado no puede hacer que un METAR recién emitido parezca del mes pasado.
  */
  const TOLERANCIA_MS = 2 * 60 * 60 * 1000;
  const candidatos: Date[] = [];
  for (const atras of [0, 1]) {
    const d = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - atras, dia, hora, minuto, 0)
    );
    // `Date.UTC` desborda el día 31 a un mes que no lo tiene; se descarta.
    if (d.getUTCDate() === dia) candidatos.push(d);
  }

  const validos = candidatos.filter((d) => d.getTime() - ahora.getTime() <= TOLERANCIA_MS);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
}

/** Cuánto hace, y si eso todavía sirve. `null` cuando no se sabe cuándo se observó. */
export function frescura(observado: Date | null, ahora: Date): Frescura | null {
  if (!observado) return null;

  const minutos = Math.floor((ahora.getTime() - observado.getTime()) / 60000);
  /*
    Un dato "del futuro" es un reloj desfasado, no un dato mejor. Se trata como recién
    observado en vez de mostrar "hace -8 min", que no significa nada.
  */
  const edad = Math.max(0, minutos);

  return {
    minutos: edad,
    texto: comoSeDice(edad),
    nivel: edad >= INSERVIBLE_MIN ? "inservible" : edad > FRESCO_MIN ? "viejo" : "fresco",
  };
}

/**
 * "hace 12 min", "hace 1 h", "hace 2 h 10".
 *
 * A mano y no con `Intl.RelativeTimeFormat`, que no existe en ningún lado de este repo
 * y que además diría "hace 130 minutos" — un número que el piloto tiene que dividir
 * mentalmente justo cuando menos ganas tiene.
 */
function comoSeDice(minutos: number): string {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${String(resto).padStart(2, "0")}`;
}

/**
 * Si un dato meteorológico puede alimentar un cálculo o un veredicto.
 *
 * **La regla dura de toda la Fase 5.** Un METAR guardado se puede *mostrar* con su
 * fecha al lado; lo que no puede es contar como una estación que informó. El briefing
 * de ruta decide si puede opinar contando cuántas contestaron: darle datos de hace
 * cuatro horas le haría producir un verde tranquilizador a partir de nada, que es peor
 * que el "no sabemos" que produce hoy.
 *
 * Sin fecha tampoco sirve: no saber cuándo se observó es no saber si describe el cielo.
 */
export function sirveParaDecidir(f: Frescura | null): boolean {
  return f !== null && f.nivel !== "inservible";
}
