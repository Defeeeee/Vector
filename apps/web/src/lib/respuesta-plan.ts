/**
 * Qué contestó la oficina ARO/AIS a un plan de vuelo: limpiar lo citado, clasificar y resumir.
 *
 * Todo puro. Lo que sigue (Gemini cuando las reglas no deciden) está en
 * `respuesta-plan-gemini.ts`, para que esto se pueda testear sin red.
 *
 * **Las reglas van antes que el modelo** y con prioridad del más grave: un mail que dice
 * "recibido, pero falta la casilla 18" es `corregir`, no `recibido`. Equivocarse hacia lo
 * más grave le cuesta al piloto un vistazo de más; hacia lo más leve, volar con un plan
 * que la oficina no aceptó.
 */

export type ClasificacionRespuesta = "recibido" | "aceptado" | "rechazado" | "corregir" | "otra";

export const CLASIFICACIONES: readonly ClasificacionRespuesta[] = ["recibido", "aceptado", "rechazado", "corregir", "otra"];

export const esClasificacion = (v: unknown): v is ClasificacionRespuesta =>
  typeof v === "string" && (CLASIFICACIONES as readonly string[]).includes(v);

/* -------------------------------------------------------------------------- */
/* Texto                                                                      */
/* -------------------------------------------------------------------------- */

/** El HTML de un mail pasado a texto, para cuando la respuesta no trae parte de texto. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const ENCABEZADO_CITA = /^\s*(el|on)\b.{4,300}?(escribi[óo]|wrote)\s*:?\s*$/i;
const SEPARADORES = [
  /^\s*-{2,}\s*(mensaje original|original message|mensaje reenviado|forwarded message)\s*-{2,}\s*$/i,
  /^\s*_{5,}\s*$/,
  /^\s*-- ?$/,
  /^\s*(enviado desde|sent from|obtener outlook|get outlook)\b/i,
];
/** Las cabeceras que Outlook pega arriba de lo citado. */
const CABECERA_OUTLOOK = /^\s*(de|from)\s*:\s*\S.*$/i;

/**
 * Lo que escribió la oficina, sin lo citado de nuestro mail: las líneas con `>`, el
 * "El … escribió:" (aunque el cliente lo parta en dos líneas), el "Mensaje original", la
 * firma (`-- `) y el "Enviado desde mi …". Corta en lo primero que encuentra.
 */
export function sinLoCitado(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  const propias: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (SEPARADORES.some((r) => r.test(l))) break;
    if (ENCABEZADO_CITA.test(l)) break;
    // "El lun, 12 oct 2026 a las 10:00, Fulano <x@y>" + "escribió:" en la línea de abajo.
    if (/^\s*(el|on)\b/i.test(l) && i + 1 < lineas.length && ENCABEZADO_CITA.test(`${l} ${lineas[i + 1]}`)) break;
    // Un "De: …" sólo corta si vienen más cabeceras de Outlook abajo (Enviado/Para/Asunto).
    if (CABECERA_OUTLOOK.test(l) && lineas.slice(i + 1, i + 5).some((x) => /^\s*(enviado|sent|para|to|asunto|subject)\s*(el)?\s*:/i.test(x))) break;
    if (/^\s*>/.test(l)) continue;
    propias.push(l);
  }
  return propias.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Una o dos líneas para el aviso: el principio de lo escrito, cortado sin partir palabras. */
export function resumir(texto: string, largo = 140): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= largo) return limpio;
  const corte = limpio.slice(0, largo);
  const ultimoEspacio = corte.lastIndexOf(" ");
  // Si lo que sigue es un espacio, la última palabra entró entera.
  const entero = limpio[largo] === " " ? corte : ultimoEspacio > largo * 0.5 ? corte.slice(0, ultimoEspacio) : corte;
  return `${entero.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/* -------------------------------------------------------------------------- */
/* Clasificación por reglas                                                   */
/* -------------------------------------------------------------------------- */

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const RECHAZADO = [
  /\brechazad/,
  /\brechaza(mos)?\b/,
  /\bno (se )?(acepta|aceptamos|admite|procede|autoriza)/,
  /\bno (fue|ha sido|es|esta|queda) (aceptad|aprobad|autorizad|admitid)/,
  /\bno aceptad/,
  /\bdenegad/,
  /\bno autorizad/,
  /\binvalid[oa]\b/,
];
const CORREGIR = [
  /\bcorregir\b/,
  /\bcorrija\b/,
  /\bcorrecci[oó]n/,
  /\brectific/,
  /\bfalta(n)?\b/,
  /\bverific(ar|ue|a)\b/,
  /\berror(es)? (en|de)\b/,
  /\bhay (un )?error/,
  /\bmodific(ar|ue|a)\b/,
  /\bcomplet(ar|e)\b/,
  /\bre-?envi(ar|e)\b/,
  /\bcasilla\b.*\b(incorrecta|erronea|mal|falt)/,
  /\bpor favor (indique|aclare|confirme|informe)/,
];
const ACEPTADO = [
  /\baceptad/,
  /\bconforme\b/,
  /\baprobad/,
  /\bautorizad/,
  /\bfpl (aceptado|accepted)/,
  /\baccepted\b/,
];
const RECIBIDO = [/\brecibid/, /\brecibimos\b/, /\bacuse( de recibo)?\b/, /\brecepcion\b/, /\breceived\b/, /\bwe have received\b/];

/** "Sin errores", "no falta nada": lo que nombra la palabra de corregir para negarla. */
const NEGACION_CORREGIR = /\b(sin|ningun|no (hay|tiene|presenta|detecta)) (error|errores|observaciones|novedad)|\bno (falta|faltan)\b/g;

/**
 * La clasificación por palabras, o `null` si no decide. Prioridad:
 * rechazado > corregir > aceptado > recibido.
 */
export function clasificarPorReglas(textoOficina: string): ClasificacionRespuesta | null {
  const t = sinTildes(textoOficina).replace(/\s+/g, " ");
  if (!t.trim()) return null;
  if (RECHAZADO.some((r) => r.test(t))) return "rechazado";
  if (CORREGIR.some((r) => r.test(t.replace(NEGACION_CORREGIR, " ")))) return "corregir";
  if (ACEPTADO.some((r) => r.test(t))) return "aceptado";
  if (RECIBIDO.some((r) => r.test(t))) return "recibido";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Quién escribe                                                              */
/* -------------------------------------------------------------------------- */

/** La dirección de `"Nombre <a@b.c>"` o de `a@b.c`, en minúsculas. */
export function direccionDe(campo: string | null | undefined): string {
  const s = (campo ?? "").trim();
  const adentro = /<([^>]+)>/.exec(s)?.[1] ?? s;
  return adentro.trim().toLowerCase();
}

const dominioDe = (direccion: string) => direccion.split("@")[1] ?? "";

export type Remitente = "oficina" | "piloto" | "otro";

/**
 * ¿Quién mandó la respuesta? **La oficina** si el `from` es una de las direcciones a las que
 * se mandó el plan (los envíos a la oficina, no las pruebas) o tiene su mismo dominio; **el
 * piloto** si es él (se ignora: es su propio "responder a todos"); **otro** en cualquier otro
 * caso (se guarda, sin aviso).
 */
export function quienEscribe(de: string, enviosAOficina: string[], correoPiloto: string): Remitente {
  const origen = direccionDe(de);
  if (!origen.includes("@")) return "otro";
  if (origen === direccionDe(correoPiloto)) return "piloto";
  const oficinas = enviosAOficina.map(direccionDe).filter((a) => a.includes("@") && a !== direccionDe(correoPiloto));
  if (oficinas.includes(origen)) return "oficina";
  const dominio = dominioDe(origen);
  return oficinas.some((o) => dominioDe(o) === dominio) ? "oficina" : "otro";
}

/** ¿El piloto ya recibió esta respuesta? Si no estaba en `to` ni en `cc`, se la reenviamos. */
/** Las direcciones de un encabezado To o Cc (`"Lucía <a@b.com>, c@d.com"`, o una lista). Sin encabezado, `null`. */
export function direccionesDeEncabezado(valor: unknown): string[] | null {
  const textos = typeof valor === "string" ? [valor] : Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : null;
  if (!textos || !textos.length) return null;
  return textos.flatMap((t) => t.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? []).map((d) => d.toLowerCase());
}

/**
 * ¿Hay que reenviarle al piloto la respuesta de la oficina? **Sólo si se sabe que no la recibió**: los
 * encabezados To y Cc del mail (los que trae `GET /emails/receiving/{id}` de Resend) no lo nombran.
 *
 * Hasta el 2026-11-12 se miraban el `to` y el `cc` del aviso del webhook, y a Federico le llegó la
 * respuesta de la oficina **y** el reenvío "contestó sólo a Vector": el aviso de Resend trae los
 * destinatarios de su dominio, no los del mail (su documentación no lo dice; su ejemplo lo sugiere).
 * Sin encabezados no se reenvía: el plan sale con el piloto en `reply_to`, así que "responder" ya le
 * llega, y la respuesta igual queda en el plan y en el push.
 */
export function reenviarAlPiloto(correoPiloto: string, encabezados: { to?: unknown; cc?: unknown } | null | undefined): boolean {
  const mio = direccionDe(correoPiloto);
  const para = direccionesDeEncabezado(encabezados?.to);
  if (!mio || para === null) return false;
  return ![...para, ...(direccionesDeEncabezado(encabezados?.cc) ?? [])].includes(mio);
}

/* -------------------------------------------------------------------------- */
/* El aviso                                                                   */
/* -------------------------------------------------------------------------- */

export const ETIQUETA_ESTADO: Record<ClasificacionRespuesta, string> = {
  recibido: "recibido",
  aceptado: "aceptado",
  rechazado: "rechazado",
  corregir: "piden corregir",
  otra: "respuesta de la oficina",
};

/** Tope del texto que se guarda de cada respuesta. */
export const MAX_TEXTO_RESPUESTA = 4000;

/** "11/11 15:30Z": sin `toLocaleString`, igual en el server y en el navegador (invariante 1). */
export function cuandoRespuesta(iso: string | null | undefined): string {
  if (!iso || iso.length < 16) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}Z`;
}
