import { NextRequest } from "next/server";
import { anotarEvento } from "@/lib/mail-envio";
import { pixelValido } from "@/lib/mail-seguimiento";

/** Un GIF transparente de 1×1. */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * La imagen de apertura de los mails (`lib/mail-seguimiento.ts`).
 *
 * **Contesta siempre la misma imagen**, con firma válida o sin ella: quien prueba links
 * no aprende nada de la respuesta, y un mail con el link roto no muestra un ícono de
 * imagen caída. Sólo se anota si la firma corresponde al envío.
 *
 * Sin cache, para que una segunda apertura vuelva a pedirla. Igual Gmail la guarda en su
 * servidor: por eso el panel cuenta mails abiertos y no cantidad de aperturas.
 */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const envioId = p.get("e") ?? "";
  if (pixelValido(envioId, p.get("f") ?? "", process.env.DOCUMENTS_ALERT_SECRET ?? "")) {
    await anotarEvento(envioId, "apertura");
  }
  return new Response(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
