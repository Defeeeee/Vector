import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { codigosDeLaHoja } from "@/lib/pegatinas";
import { hojaDePegatinas } from "@/lib/pegatinas-hoja";
import { SITIO_URL } from "@/lib/sitio";

/**
 * La hoja A4 para imprimir pegatinas: `?codigos=K7P2,M3XA` (o `?sin_asignar=1`, todas las que
 * todavía no se pegaron). Sólo admin: si el backend no lo reconoce, 404 como el panel.
 */
export async function GET(req: NextRequest) {
  const r = await apiFetch("/admin/qr", { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return new NextResponse("No encontrado", { status: 404 });
  const url = new URL(req.url);
  let codigos = codigosDeLaHoja(url.searchParams.get("codigos"));
  if (url.searchParams.get("sin_asignar") === "1") {
    const { pegatinas } = (await r.json()) as { pegatinas: { codigo: string; etiqueta: string | null }[] };
    codigos = pegatinas.filter((p) => !p.etiqueta).map((p) => p.codigo).slice(0, 200);
  }
  if (!codigos.length) return new NextResponse("No hay pegatinas para imprimir", { status: 400 });
  return new NextResponse(await hojaDePegatinas(codigos, SITIO_URL), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
