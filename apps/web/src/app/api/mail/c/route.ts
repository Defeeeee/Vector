import { NextRequest, NextResponse } from "next/server";
import { anotarEvento } from "@/lib/mail-envio";
import { clicValido, destinoDe } from "@/lib/mail-seguimiento";
import { SITIO_URL } from "@/lib/sitio";

const APP_URL = SITIO_URL;

/**
 * La redirección de los links de los mails (`lib/mail-seguimiento.ts`): anota el clic y
 * manda al destino.
 *
 * **Sólo redirige a un destino firmado.** Sin esa verificación esto sería una redirección
 * abierta: un link de vectoraero.ar que lleva a cualquier sitio, que es justo lo
 * que busca alguien armando un phishing. Con la firma mal o vencida, va al inicio.
 *
 * Lo que se guarda es a dónde iba el link, sin query string (`destinoDe`).
 */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const envioId = p.get("e") ?? "";
  const destino = p.get("u") ?? "";
  if (!clicValido(envioId, destino, p.get("f") ?? "", process.env.DOCUMENTS_ALERT_SECRET ?? "")) {
    return NextResponse.redirect(APP_URL, 302);
  }
  await anotarEvento(envioId, "clic", destinoDe(destino, APP_URL));
  return NextResponse.redirect(destino, 302);
}
