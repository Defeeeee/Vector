/**
 * Envío de correo, por Resend.
 *
 * ## Por qué existe y por qué es tan chico
 *
 * El repo no tenía nada de mail: el único cron que había —el de vencimientos— entrega por
 * WhatsApp. Esto es lo mínimo para que el briefing del vuelo de mañana llegue solo.
 *
 * ## **No configurado no es un error**
 *
 * Sin `RESEND_API_KEY` esto no manda y **no rompe nada**: devuelve `enviado: false` con el
 * motivo, y el cron lo registra y sigue. Es deliberado. La alternativa —tirar una
 * excepción— haría que una feature que todavía no se activó ensucie los logs y, peor, que
 * el barrido se caiga antes de procesar al resto.
 *
 * Para activarlo alcanza con la variable de entorno. **No hace falta verificar un dominio**
 * para empezar: el remitente de prueba de Resend entrega al mail del titular de la cuenta,
 * que es exactamente este caso —el piloto se lo manda a sí mismo—.
 *
 * ## El remitente: `RESEND_FROM`
 *
 * Con un dominio verificado en Resend, el remitente se cambia **sólo con esta variable**, en
 * el formato `Nombre <casilla@dominio>`:
 *
 *     RESEND_FROM="Vector <briefing@vector.fdiaznem.com.ar>"
 *
 * El dominio de la casilla **tiene que ser uno verificado en Resend**, y no hay forma de
 * chequearlo desde acá: Resend contesta 403 y el motivo queda en el log del barrido.
 *
 * Sin la variable se usa el remitente de prueba, que sigue funcionando pero cae en spam más
 * seguido y sólo entrega al titular de la cuenta.
 */

/** De dónde sale el mail. El de prueba de Resend sirve sin verificar dominio. */
const REMITENTE_POR_DEFECTO = "Vector <onboarding@resend.dev>";

/**
 * El remitente configurado, o el de prueba.
 *
 * Un `RESEND_FROM` sin arroba se descarta **avisando**, en vez de mandarse a Resend para que
 * conteste un 422. El caso que atrapa es el más fácil de escribir mal: poner el dominio
 * pelado —`vector.fdiaznem.com.ar`— en vez de una casilla.
 */
export function remitente(): { from: string; aviso?: string } {
  const configurado = process.env.RESEND_FROM?.trim();
  if (!configurado) return { from: REMITENTE_POR_DEFECTO };
  if (!configurado.includes("@")) {
    return {
      from: REMITENTE_POR_DEFECTO,
      aviso: `RESEND_FROM no es una dirección ("${configurado}"): falta la casilla antes del dominio. Se usó el remitente de prueba.`,
    };
  }
  return { from: configurado };
}

export interface ResultadoEnvio {
  enviado: boolean;
  /** Por qué no se mandó. Vacío cuando salió bien. */
  motivo?: string;
  /** El id que devuelve el proveedor, para poder rastrearlo. */
  id?: string;
}

export interface Mail {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  /** Cabeceras extra, como `List-Unsubscribe` en el resumen del mes. */
  cabeceras?: Record<string, string>;
  /** Copias: el plan de vuelo va a la oficina con copia al piloto. */
  cc?: string[];
  /** A quién van las respuestas: al piloto, no a Vector. */
  responderA?: string;
  /** Archivos adjuntos, en base64: el PDF del plan. */
  adjuntos?: { nombre: string; base64: string }[];
  /**
   * El nombre que se ve como remitente, con la misma casilla de `RESEND_FROM`: el plan de
   * vuelo sale como "Lucía Ferrari vía Vector", para que la oficina sepa de quién es.
   */
  nombreRemitente?: string;
  /**
   * La casilla, sin el dominio, cuando no es la de `RESEND_FROM`: el plan sale de
   * `plandevuelo@`. El dominio es siempre el de `RESEND_FROM`, que es el verificado.
   */
  casilla?: string;
}

/**
 * El `from` de un mail: el de `RESEND_FROM`, con otro nombre o con otra casilla del mismo
 * dominio. Con el remitente de prueba de Resend la casilla no se cambia: no es nuestro.
 */
export function direccionDeEnvio(configurado: string, mail: Pick<Mail, "nombreRemitente" | "casilla">): string {
  const original = /<([^>]+)>/.exec(configurado)?.[1] ?? configurado;
  const dominio = original.split("@")[1] ?? "";
  const casilla = mail.casilla && dominio !== "resend.dev" ? `${mail.casilla}@${dominio}` : original;
  if (mail.nombreRemitente) return `${mail.nombreRemitente.replace(/[<>"]/g, "")} <${casilla}>`;
  if (casilla === original) return configurado;
  const nombre = /^(.*?)\s*</.exec(configurado)?.[1];
  return nombre ? `${nombre} <${casilla}>` : casilla;
}

export async function enviarMail(mail: Mail): Promise<ResultadoEnvio> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    /*
      Se avisa una vez y con la instrucción adentro, no con un "misconfigured" pelado: el
      que lee este log seis meses después no tiene por qué acordarse de qué variable era.
    */
    return {
      enviado: false,
      motivo: "Falta RESEND_API_KEY: el briefing por mail está apagado. Se activa con esa variable, sin tocar DNS.",
    };
  }

  if (!mail.para.includes("@")) {
    return { enviado: false, motivo: `Destinatario inválido: ${mail.para}` };
  }

  const { from: configurado, aviso } = remitente();
  const from = direccionDeEnvio(configurado, mail);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [mail.para],
        subject: mail.asunto,
        text: mail.texto,
        html: mail.html,
        ...(mail.cabeceras ? { headers: mail.cabeceras } : {}),
        ...(mail.cc?.length ? { cc: mail.cc } : {}),
        ...(mail.responderA ? { reply_to: mail.responderA } : {}),
        ...(mail.adjuntos?.length ? { attachments: mail.adjuntos.map((a) => ({ filename: a.nombre, content: a.base64 })) } : {}),
      }),
    });

    if (!res.ok) {
      /*
        El 403 de Resend acá es casi siempre el mismo: el dominio del remitente no está
        verificado. Se nombra, porque el texto que devuelve Resend habla de "domain" sin
        decir cuál variable lo controla.
      */
      const pista = res.status === 403 ? ` (¿el dominio de "${from}" está verificado en Resend?)` : "";
      return {
        enviado: false,
        motivo: `Resend contestó ${res.status}${pista}: ${(await res.text()).slice(0, 200)}`,
      };
    }
    const datos = await res.json().catch(() => ({}));
    // El aviso viaja aunque el envío haya salido: se mandó, pero no desde donde se creía.
    return { enviado: true, id: datos?.id, motivo: aviso };
  } catch (err) {
    return { enviado: false, motivo: `No se pudo llamar a Resend: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Si el envío de correo está activado. Lo usa el cron para no barrer al pedo. */
export function mailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
