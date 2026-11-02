import { NextRequest, NextResponse } from "next/server";
import { firmaValida, tipoDeBaja } from "@/lib/baja-mail";

const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

/**
 * Da de baja de un mail —el resumen del mes o las novedades— o vuelve a suscribir, con
 * `volver=1`.
 *
 * **Sólo POST.** Los filtros de correo de algunas empresas abren los links de los mails
 * para revisarlos: si la baja fuera un GET, darían de baja a la gente sin que se entere.
 * Por eso el link del mail lleva a una página con un botón (`/mail/baja`), y esto lo
 * reciben ese botón y el "Desuscribirse" de Gmail (`List-Unsubscribe-Post`, RFC 8058).
 *
 * Desde la página vuelve a ella con el resultado; desde el cliente de correo contesta 200.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  const volver = url.searchParams.get("volver") === "1";
  const desdeLaPagina = url.searchParams.get("desde") === "pagina";
  const secreto = process.env.DOCUMENTS_ALERT_SECRET ?? "";
  // De qué mail es la baja: el resumen del mes (sin `m`) o las novedades.
  const tipo = tipoDeBaja(url.searchParams.get("m"));

  if (!firmaValida(u, t, secreto, tipo)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/mails/baja`, {
    method: "POST",
    headers: { "X-Cron-Secret": secreto, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: u, tipo, baja: !volver }),
  }).catch(() => null);
  const ok = !!res?.ok;

  if (desdeLaPagina) {
    const q = new URLSearchParams({ u, t, ...(tipo === "resumen" ? {} : { m: tipo }), hecho: ok ? (volver ? "alta" : "baja") : "error" });
    /*
      303: el navegador vuelve con un GET, y recargar no reenvía el formulario. El
      `Location` va relativo: detrás de Traefik, `req.url` puede traer el host interno
      (127.0.0.1:3010) en vez del dominio público.
    */
    return new NextResponse(null, { status: 303, headers: { Location: `/mail/baja?${q}` } });
  }
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No se pudo registrar" }, { status: 502 });
}
