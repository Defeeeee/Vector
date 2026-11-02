import { getAirport } from "./airports";

/**
 * Puente entre los códigos que escribe un piloto y lo que espera la API de
 * MADHEL, que se indexa por el designador ANAC de tres letras.
 *
 * Server-only: `getAirport` lee del disco.
 *
 * Esto reemplaza a una tabla `ICAO_TO_ANAC` escrita a mano que estaba duplicada
 * en tres rutas y **mal en seis de sus cuarenta y cinco entradas**. Contrastadas
 * contra `madhel.tsv`:
 *
 *   SAWE -> USU   pero SAWE es Río Grande (GRA), no Ushuaia
 *   SAZY -> ECA   pero SAZY es San Martín de los Andes (CHP), no El Calafate
 *   SAWD -> MAD   pero SAWD es Puerto Deseado (ADO), no Puerto Madryn
 *   SACO -> FMA   pero Córdoba es CBA; FMA es Formosa
 *   SAWC -> CAL   pero El Calafate es ECA
 *   SADP/SADL     invertidos entre sí
 *
 * El resto se cubría con un heurístico de "sacale la primera letra al ICAO",
 * que acierta de casualidad: SADM daría ADM cuando Morón es MOR.
 *
 * El directorio ya tiene los 711 designadores que publica ANAC, así que la tabla
 * no hacía falta y no podía hacer otra cosa que envejecer mal.
 */
export function anacIndicator(code: string): string {
  const clean = (code ?? "").trim().toUpperCase();
  const airport = getAirport(clean);
  if (airport?.local) return airport.local;

  // Un modelo a veces devuelve un designador con una S adelante (SMGI por MGI).
  if (clean.length === 4 && clean.startsWith("S")) {
    const stripped = getAirport(clean.slice(1));
    if (stripped?.local) return stripped.local;
  }

  // Desconocido: se manda tal cual y que conteste MADHEL.
  return clean;
}

/**
 * Antes acá vivía `CONTROLLED_FALLBACKS`: pistas, frecuencias, combustible y teléfonos
 * de nueve aeródromos, **escritos a mano**, que las tres rutas de API metían en la ficha
 * y la pantalla rotulaba "Ficha Operativa Oficial ANAC MADHEL".
 *
 * Se fue entera, y conviene dejar anotado por qué:
 *
 * - **No eran correctos.** De sus veintiséis frecuencias, tres coincidían con el AIP. San
 *   Fernando tenía la torre en 118.45 cuando son 119.00 y 120.05. El Palomar tenía la
 *   pista 17/35 anotada como **16/34** — el número pintado en el umbral. Aeroparque, 2350
 *   metros de pista escritos como 2700. Ezeiza figuraba con AVGAS 100LL y su AD 2 no
 *   nombra AVGAS ni una vez.
 * - **Pisaban el dato bueno.** El código hacía `fallback ? fallback.radio : radioList`, o
 *   sea que donde había entrada a mano, lo que ANAC devolvía se descartaba. La Plata —que
 *   ni siquiera es controlado, y del que MADHEL publica todo— mostraba una pista de tierra
 *   de 1435 m que en realidad es asfalto de 1427, y uno de sus siete teléfonos.
 * - **Nadie las podía revisar.** El propio comentario de la tabla avisaba del riesgo. Lo
 *   encontró un piloto cruzando la pantalla con la carta, que es la peor forma de
 *   encontrarlo.
 *
 * Ahora el hueco —real: para un aeródromo controlado MADHEL devuelve todo vacío— lo llena
 * `lib/aip.ts`, con datos extraídos del AIP, con la fecha de vigencia a la vista y con un
 * test que verifica que cada número aparezca literalmente en el PDF de ANAC.
 */

/**
 * Normaliza la ruta que escribe un piloto —o que devuelve un modelo— a los
 * códigos canónicos del directorio.
 *
 * "gez - srdr", "GEZ SRDR" y "General Rodríguez" no pueden terminar como tres
 * aeródromos distintos en la bitácora. El formulario web ya canonicaliza; sin
 * esto el copiloto entra por la ventana y parte en dos el historial de un campo.
 *
 * Lo que no resuelve se deja tal cual, en mayúsculas: es preferible guardar un
 * código raro a inventar uno.
 */
export function canonicalRoute(raw: string): string {
  const original = (raw ?? "").trim();
  const tokens = original.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

  // Sólo se toca lo que tiene forma de código. Un split ciego sobre
  // "General Rodríguez" parte la Í y devuelve "GENERAL RODR GUEZ" — peor que
  // no haber hecho nada. Si no parece una ruta de códigos, se deja como vino.
  const looksLikeCodes =
    tokens.length > 0 && tokens.length <= 2 && tokens.every((t) => t.length >= 3 && t.length <= 4);
  if (!looksLikeCodes) return original;

  // Se normaliza también el separador: el formulario web siempre guarda
  // "ORIGEN DESTINO" con un espacio, y "SADF-SADM" convivía como una tercera
  // forma de escribir la misma ruta. Los códigos que no resuelven se dejan tal
  // cual — es preferible guardar uno raro a inventar uno.
  return tokens.map((code) => getAirport(code)?.icao ?? code).join(" ");
}
