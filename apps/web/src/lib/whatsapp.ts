/**
 * Outbound WhatsApp delivery through Kapso.
 *
 * Lives here rather than inside the webhook route because the expiry-alert cron
 * (`/api/cron/document-alerts`) sends messages too, and it has to know whether
 * delivery actually succeeded before marking a document as notified — a
 * fire-and-forget send would silently burn the 60/30/7 day warning.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  dynamicPhoneId?: string
): Promise<boolean> {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || dynamicPhoneId;

  if (!apiKey || !phoneNumberId) {
    console.error("Missing Kapso API configuration (KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID)");
    return false;
  }

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Error sending WhatsApp message via Kapso:", errText, "URL:", url);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send WhatsApp message:", err);
    return false;
  }
}

/**
 * El resultado de un envío por plantilla, que **no es un booleano**.
 *
 * `accepted` quiere decir que Kapso tomó el mensaje, no que el piloto lo haya
 * recibido: Meta resuelve la entrega después y avisa por webhook. Son dos hechos
 * distintos y el barrido necesita los dos —uno para no reenviar mañana, otro para
 * poder reintentar si la entrega termina fallando—, así que colapsarlos en un
 * `true` es justamente lo que hacía que un aviso fallido se perdiera para siempre.
 *
 * `messageId` es el wamid con el que después llega ese veredicto. Puede ser
 * `null` con `accepted: true`: el envío salió, pero perdimos la forma de
 * relacionarlo con su resultado.
 */
export interface TemplateSendResult {
  accepted: boolean;
  messageId: string | null;
}

/** Nada salió: ni hay mensaje ni hay id que esperar. */
const RECHAZADO: TemplateSendResult = { accepted: false, messageId: null };

/**
 * Envío por **plantilla aprobada**, que es la única forma de escribirle a un
 * piloto que no habló primero.
 *
 * Meta sólo permite texto libre dentro de las **24 horas** desde el último
 * mensaje del usuario. Un aviso de vencimiento es proactivo por definición:
 * llega justo cuando el piloto no escribió nada. Por eso `sendWhatsAppMessage`
 * —que manda `type: "text"`— sirve para el copiloto, que responde, y **no puede
 * servir para el barrido**, que inicia. Comprobado en producción el 2026-08-11:
 *
 *   "Cannot send non-template messages outside the 24-hour window."
 *
 * El nombre de la plantilla y el idioma van por entorno porque los fija Meta al
 * aprobarlas, no el código: si mañana se aprueba una variante, se cambia la
 * variable y no hace falta desplegar.
 *
 * Kapso expone la Cloud API de Meta tal cual —la URL es `/meta/whatsapp/v24.0/`—
 * así que el cuerpo es el de Meta. Header, footer y botón sin variables no
 * necesitan componente propio: sólo van los parámetros del body, en orden.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
): Promise<TemplateSendResult> {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    console.error("Missing Kapso API configuration (KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID)");
    return RECHAZADO;
  }
  if (!templateName) {
    console.error("No template name configured for this alert — nothing sent.");
    return RECHAZADO;
  }

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: bodyParams.length
            ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
            : [],
        },
      }),
    });

    if (!res.ok) {
      // El texto de Kapso dice exactamente qué rechazó Meta —plantilla sin
      // aprobar, idioma que no coincide, cantidad de parámetros— y sin eso el
      // diagnóstico son horas. No incluye el teléfono, que va en el cuerpo.
      console.error(
        "Error sending WhatsApp template via Kapso:",
        await res.text(),
        "| template:", templateName, "| lang:", languageCode, "| params:", bodyParams.length
      );
      return RECHAZADO;
    }

    // El wamid viaja en `messages[0].id`, con el cuerpo de la Cloud API tal cual
    // porque Kapso la expone sin envolver.
    //
    // Si el JSON no se puede leer, el envío **igual fue aceptado**: un 2xx ya
    // significa que Meta lo tomó. Por eso el parseo va en su propio try y no
    // degrada `accepted` — tratarlo como fallo mandaría el aviso de nuevo mañana
    // sobre un mensaje que el piloto ya recibió.
    let messageId: string | null = null;
    try {
      const data = await res.json();
      messageId = data?.messages?.[0]?.id ?? null;
    } catch {
      messageId = null;
    }
    if (!messageId) {
      // No es fatal, pero sí una pérdida concreta: sin id, un `failed` posterior
      // no se puede atribuir a este documento y el aviso no se reintenta solo.
      console.warn(
        "Kapso aceptó la plantilla pero no devolvió un id de mensaje — este aviso no se va a poder reintentar si falla la entrega.",
        "| template:", templateName
      );
    }
    return { accepted: true, messageId };
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    return RECHAZADO;
  }
}

/**
 * Manda un archivo (el libro de vuelo en PDF) como documento de WhatsApp, en dos pasos de
 * la Cloud API que Kapso expone tal cual: se sube a `/{phone_number_id}/media`, que devuelve
 * un id, y se manda un mensaje `document` con ese id. Probado el 2026-10-21 que Kapso acepta
 * la subida (200 con `id`).
 *
 * Es una respuesta del copiloto, dentro de las 24 h del último mensaje del piloto: por eso
 * no va por plantilla. Devuelve si el mensaje salió.
 */
export async function sendWhatsAppDocument(
  to: string,
  archivo: { bytes: Uint8Array; nombre: string; tipo?: string },
  caption: string,
  dynamicPhoneId?: string
): Promise<boolean> {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || dynamicPhoneId;
  if (!apiKey || !phoneNumberId) {
    console.error("Missing Kapso API configuration (KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID)");
    return false;
  }
  const base = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}`;
  const tipo = archivo.tipo ?? "application/pdf";
  try {
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("type", tipo);
    fd.append("file", new Blob([Buffer.from(archivo.bytes)], { type: tipo }), archivo.nombre);
    const subida = await fetch(`${base}/media`, { method: "POST", headers: { "X-API-Key": apiKey }, body: fd });
    if (!subida.ok) {
      console.error("Error uploading WhatsApp media via Kapso:", await subida.text());
      return false;
    }
    const { id } = (await subida.json()) as { id?: string };
    if (!id) {
      console.error("Kapso no devolvió el id del archivo subido.");
      return false;
    }
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { id, filename: archivo.nombre, caption },
      }),
    });
    if (!res.ok) {
      console.error("Error sending WhatsApp document via Kapso:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send WhatsApp document:", err);
    return false;
  }
}
