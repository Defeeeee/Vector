import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { tokenValido } from "@/lib/seguimiento";

/**
 * Lo que la página pública `/seguir/[token]` vuelve a pedir cada ~15 s: el seguimiento tal como lo
 * devuelve el backend (`GET /publico/seguimientos/{token}`), sin sesión (`anonimo`: lo ve cualquiera
 * que tenga el link, aunque haya una cookie) y sin cache. Un token que no existe y uno que ya no se
 * puede ver dan el mismo 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404 });

  const res = await apiFetch(`/publico/seguimientos/${token}`, { cache: "no-store" }, { anonimo: true }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });
  if (res.status === 404) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!res.ok) return NextResponse.json({ detail: "No se pudo leer el seguimiento." }, { status: 502 });
  return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
}
