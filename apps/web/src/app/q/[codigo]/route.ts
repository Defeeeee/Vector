import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { COOKIE_QR, DIAS_DE_LA_COOKIE, destinoDelEscaneo, normalizarCodigo, valorCookieQr } from "@/lib/pegatinas";

const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

/**
 * El QR de una pegatina (migración 033 del backend): `/q/K7P2`.
 *
 * Anota el escaneo —sólo cuándo y si había sesión, sin IP ni navegador; los del admin no— y
 * redirige según `destinoDelEscaneo`: el admin va a asignar la pegatina, un piloto a su inicio
 * y un visitante a la portada con la cookie del escaneo. Si el backend no contesta, igual redirige: del otro
 * lado hay alguien con el teléfono en la mano.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  const conSesion = Boolean((await cookies()).get("session_token")?.value);

  // ¿Es el admin? El backend contesta 404 a cualquier otro. Sus escaneos —los de pegar y
  // asignar cada pegatina— no se anotan: inflarían la cuenta de cada lugar.
  let esAdmin = false;
  if (codigo && conSesion) {
    const r = await apiFetch(`/admin/qr/${codigo}`, { cache: "no-store" }).catch(() => null);
    esAdmin = Boolean(r?.ok);
  }

  let existe = esAdmin;
  if (codigo && !esAdmin) {
    const r = await fetch(`${API_URL}/qr/escaneos`, {
      method: "POST",
      headers: { "X-Cron-Secret": process.env.DOCUMENTS_ALERT_SECRET ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, con_sesion: conSesion }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
    if (r?.ok) existe = Boolean((await r.json().catch(() => null))?.existe);
  }

  const { destino, cookie } = destinoDelEscaneo({ codigo, existe, conSesion, esAdmin });
  // El `Location` va relativo: detrás de Traefik, la URL del pedido puede traer el host interno.
  const res = new NextResponse(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
  if (cookie && codigo) {
    res.cookies.set(COOKIE_QR, valorCookieQr(codigo, new Date()), {
      maxAge: DIAS_DE_LA_COOKIE * 86400,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return res;
}
