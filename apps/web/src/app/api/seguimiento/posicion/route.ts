import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

/**
 * La posición del vuelo que se está compartiendo (`POST /seguimientos/{id}/posicion`), cada ~15 s
 * desde el teléfono. Es una ruta y no una server action porque las actions se encolan de a una y
 * se cortan al navegar; acá un pedido que se pierde sin señal simplemente no llega, y el hook manda
 * el siguiente con la lectura más nueva.
 *
 * Con la sesión del piloto (`apiFetch` pone el token); el backend verifica que el seguimiento sea
 * suyo. Pasa el estado tal cual: 410 = terminó, 404 = no existe (el teléfono deja de mandar).
 */
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: NextRequest) {
  const j = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof j?.id === "string" && /^[0-9a-f-]{36}$/i.test(j.id) ? j.id : null;
  const lat = num(j?.lat);
  const lon = num(j?.lon);
  if (!id || lat === null || lon === null) return NextResponse.json({ detail: "Posición inválida." }, { status: 400 });

  const res = await apiFetch(`/seguimientos/${id}/posicion`, {
    method: "POST",
    body: JSON.stringify({ lat, lon, alt_ft: num(j?.alt_ft), gs_kt: num(j?.gs_kt), track: num(j?.track) }),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });

  const cuerpo = await res.json().catch(() => ({}));
  return NextResponse.json(cuerpo, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
