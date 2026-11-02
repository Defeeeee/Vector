import { sumarDias } from "@/lib/planned-flights";
import type { ExpiryRule, OffsetUnit, PilotDocument } from "@/types";

/**
 * Vencimientos que se mueven solos.
 *
 * El CMA y la licencia vencen el día que dice el papel. La otra mitad de lo que
 * condiciona a un piloto de escuela no tiene fecha, tiene una **regla**: "si pasás
 * 60 días sin volar necesitás un vuelo de adaptación", "la autorización del
 * instructor caduca a los 90 días del último vuelo". Escrita a mano, una fecha así
 * está mal desde el día siguiente.
 *
 * **La cuenta la hace el backend y la guarda en `expiry_date`.** Ver
 * `migrations/011_documents_expiry_rule.sql` y `src/services/derived_expiries.py`:
 * el barrido de avisos corre de noche sobre todos los pilotos filtrando por esa
 * columna, así que derivarla en cada lectura obligaría a ese barrido a traerse los
 * vuelos de cada uno.
 *
 * Lo de acá es el otro lado: **explicarle la regla al piloto**. Sin esto ve una
 * fecha que se le mueve sola y no sabe por qué. Y `vencimientoDerivado` repite la
 * aritmética del backend a propósito, para que el formulario pueda mostrar la fecha
 * resultante antes de guardar.
 */

export type { ExpiryRule, OffsetUnit };

/**
 * Topes del offset por unidad, espejo del CHECK de la migración 013.
 *
 * No son regulatorios: son guardarraíles contra un dedo de más en el formulario, los
 * dos del orden de diez años. Un vencimiento a 300 años no es un vencimiento.
 */
export const MAX_OFFSET: Record<OffsetUnit, number> = { dias: 3650, meses: 120 };

/** Compatibilidad: quedó de cuando la unidad no existía. */
export const MAX_OFFSET_DAYS = MAX_OFFSET.dias;

/**
 * Lo que ofrece el formulario. "No vence" no es una regla: es `expiry_date` en null.
 *
 * `"vuelo_ancla"` cuenta desde un vuelo puntual y `"ultimo_vuelo"` desde el más
 * reciente. Se parecen en el formulario y no en lo que hacen: el primero da una
 * fecha que no se mueve, el segundo una que se corre con cada vuelo.
 */
export type ModoVencimiento = "fecha" | "ultimo_vuelo" | "vuelo_ancla" | "no_vence";

/**
 * En qué modo está un documento ya guardado.
 *
 * `expiry_rule` puede faltar: un backend sin la migración 011, o una fila leída de
 * una caché vieja. Ausente significa `'fijo'`, que es lo que eran todas las filas
 * antes de esa migración.
 */
export function modoDe(doc: PilotDocument | undefined): ModoVencimiento {
  if (!doc) return "fecha";
  if (doc.expiry_rule === "ultimo_vuelo") return "ultimo_vuelo";
  if (doc.expiry_rule === "vuelo_ancla") return "vuelo_ancla";
  return doc.expiry_date ? "fecha" : "no_vence";
}

/**
 * `desde` más `cantidad` días o meses, en ISO. Espejo de `derived_expiries.sumar_offset`.
 *
 * **Los meses no son 30 días.** El repaso de 61.135 son 24 meses calendario, y
 * resolverlo con 730 días se corre uno o dos según los bisiestos. Sumar meses satura
 * el día al último del mes destino: 31 de enero + 1 mes es el 28 de febrero.
 *
 * Todo en UTC, como `sumarDias`: con un `Date` local, el 1 de agosto a las 00:00 en
 * Argentina es el 31 de julio en UTC y la cuenta se corre un día.
 */
export function sumarOffset(desdeIso: string, cantidad: number, unidad: OffsetUnit): string {
  const iso = desdeIso.slice(0, 10);
  if (unidad !== "meses") return sumarDias(iso, cantidad);

  const [y, m, d] = iso.split("-").map(Number);
  // Meses desde cero para que el módulo funcione con enero.
  const total = y * 12 + (m - 1) + cantidad;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  // Día 0 del mes siguiente es el último del mes destino. Sin esto, 31 de enero + 1
  // mes intentaría construir el 31 de febrero y `Date` lo correría a marzo.
  const ultimoDelMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(d, ultimoDelMes)))
    .toISOString()
    .slice(0, 10);
}

/**
 * La fecha que resulta de la regla, o `null` si todavía no hay de dónde sacarla.
 *
 * Sin vuelos no hay ancla, y `null` significa "no vence" desde la migración 007:
 * ni vencido ni avisos. Es lo correcto y no un caso degradado — una cuenta que
 * arranca con el último vuelo, sin ningún vuelo, no arrancó.
 */
export function vencimientoDerivado(
  anclaIso: string | null | undefined,
  offset: number | null | undefined,
  unidad: OffsetUnit = "dias"
): string | null {
  if (!anclaIso || !offset || offset <= 0) return null;
  return sumarOffset(anclaIso, offset, unidad);
}

/**
 * La regla en una línea, para poner debajo de la fecha.
 *
 * Devuelve `null` cuando no hay nada que explicar: un vencimiento fijo es la fecha
 * y nada más, y agregarle una leyenda es ruido en la lista de todos los pilotos que
 * no usan reglas.
 */
export function descripcionRegla(doc: PilotDocument, anclaIso?: string | null): string | null {
  const n = doc.expiry_offset_days;
  if (!n) return null;

  const cantidad = plazo(n, doc.expiry_offset_unit ?? "dias");

  if (doc.expiry_rule === "ultimo_vuelo") return `${cantidad} después de tu último vuelo`;
  if (doc.expiry_rule === "vuelo_ancla") {
    // La fecha del vuelo ancla, si la tenemos, es lo que hace verificable la
    // afirmación: sin ella la línea dice "24 meses desde un vuelo" y el piloto no
    // sabe cuál.
    return anclaIso
      ? `${cantidad} desde tu vuelo del ${anclaIso}`
      : `${cantidad} desde un vuelo que elegiste`;
  }
  return null;
}

/** "24 meses", "1 día". Separado porque lo usan la descripción y la ayuda. */
function plazo(cantidad: number, unidad: OffsetUnit): string {
  if (unidad === "meses") return `${cantidad} ${cantidad === 1 ? "mes" : "meses"}`;
  return `${cantidad} ${cantidad === 1 ? "día" : "días"}`;
}

/**
 * Qué decirle al piloto sobre una regla derivada, dado lo que sabemos hoy.
 *
 * Los tres casos son distintos y el del medio es el que importa: **volar corre la
 * fecha hacia adelante**. Es al revés que todo el resto de los vencimientos de
 * Vector, donde lo único que ayuda es un trámite, y si no se dice el piloto lee la
 * cuenta regresiva como una amenaza en vez de como lo que es.
 */
export function ayudaRegla(
  offset: number,
  ultimoVueloIso: string | null,
  unidad: OffsetUnit = "dias"
): string {
  if (!ultimoVueloIso) {
    return "Todavía no tenés vuelos cargados, así que la cuenta no empezó. " +
      "En cuanto cargues uno, el vencimiento aparece solo.";
  }
  const vence = vencimientoDerivado(ultimoVueloIso, offset, unidad);
  return `Tu último vuelo es del ${ultimoVueloIso}, así que hoy vence el ${vence}. ` +
    "Cada vuelo que cargues lo corre hacia adelante.";
}

/**
 * Lo mismo para un ancla fija, y el texto dice lo contrario a propósito.
 *
 * Con `ultimo_vuelo`, volar corre la fecha; acá **no la mueve nada**, y el piloto
 * tiene que saber cuál de las dos eligió. Es la única diferencia visible entre los
 * dos modos una vez guardados, y confundirlas es creer que estás cubierto cuando no.
 */
export function ayudaAncla(
  offset: number,
  vueloIso: string | null,
  unidad: OffsetUnit = "dias"
): string {
  if (!vueloIso) return "Elegí desde qué vuelo se cuenta.";
  const vence = vencimientoDerivado(vueloIso, offset, unidad);
  return `${plazo(offset, unidad)} desde el ${vueloIso}: vence el ${vence}. ` +
    "Volar no lo mueve — si corregís la fecha de ese vuelo, se ajusta solo.";
}
