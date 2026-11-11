import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { climaDelDestino } from "@/lib/clima-destino";
import { tokenValido } from "@/lib/seguimiento";

/**
 * El METAR del destino de un seguimiento, para la página pública `/seguir/[token]`. **Sólo** el
 * destino de ese seguimiento: el código sale de la ruta guardada en el backend, nunca del pedido, así
 * que no sirve para consultar un aeródromo cualquiera. Sin sesión (`anonimo`), cacheado unos minutos
 * (`CACHE_CLIMA_S`). No toca ANAC. Sin clima (`clima: null`) no es un error: la página lo dice.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404 });

  const res = await apiFetch(`/publico/seguimientos/${token}`, { next: { revalidate: 60 } }, { anonimo: true }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });
  if (res.status === 404) return NextResponse.json({ detail: "Ese seguimiento no existe." }, { status: 404 });
  if (!res.ok) return NextResponse.json({ detail: "No se pudo leer el seguimiento." }, { status: 502 });

  const { puntos } = (await res.json()) as { puntos?: unknown };
  const clima = await climaDelDestino(puntos);
  return NextResponse.json({ clima }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
