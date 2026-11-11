import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { idDeVisitanteValido, tokenValido } from "@/lib/seguimiento";

/**
 * Lo que la página pública `/seguir/[token]` vuelve a pedir cada ~15 s: el seguimiento tal como lo
 * devuelve el backend (`GET /publico/seguimientos/{token}`), sin sesión (`anonimo`: lo ve cualquiera
 * que tenga el link, aunque haya una cookie) y sin cache. Un token que no existe y uno que ya no se
 * puede ver dan el mismo 404.
 *
 * `X-Visitante` (migración 044): el id al azar del navegador de quien mira, que se le pasa al backend
 * tal cual si tiene la forma. Sin él, o mal formado, se consulta igual y no se anota. No se reenvía
 * nada más del pedido (ni IP ni user agent).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404 });

  const visitante = req.headers.get("x-visitante");
  const headers: Record<string, string> = idDeVisitanteValido(visitante) ? { "X-Visitante": visitante } : {};
  const res = await apiFetch(`/publico/seguimientos/${token}`, { cache: "no-store", headers }, { anonimo: true }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });
  if (res.status === 404) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!res.ok) return NextResponse.json({ detail: "No se pudo leer el seguimiento." }, { status: 502 });
  return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
}
