import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

/**
 * El estado de una importación, para la barra de progreso (se pide cada pocos segundos mientras
 * la página está abierta). **Sólo lee** (invariante 15) y no trae el resultado: los vuelos se
 * abren en la revisión. Del backend sale sólo lo del piloto de la sesión.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const res = await apiFetch(`/importaciones-libro/${id}`, { cache: "no-store" });
  if (res.status === 401) return NextResponse.json({ error: "Tu sesión venció." }, { status: 401 });
  if (!res.ok) return NextResponse.json({ error: "No encontramos esa importación." }, { status: res.status === 404 ? 404 : 502 });
  const f = await res.json();
  return NextResponse.json({
    id: f.id,
    estado: f.estado,
    paginas_total: f.paginas_total,
    paginas_leidas: f.paginas_leidas,
    lotes_fallidos: f.lotes_fallidos ?? [],
    error: f.error ?? null,
  });
}
