import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { endpointDePushValido, leerSuscripcionVuelo } from "@/lib/avisos-vuelo";

/**
 * Prender (`POST`) o apagar (`DELETE`) los avisos de esta cuenta en este navegador (`/tracker/avisos` del
 * backend, migración 056). Con sesión: la suscripción es de la cuenta, no de un vuelo. Se reenvía sólo la
 * suscripción del navegador, ya validada; el backend la vuelve a validar.
 */
async function reenviar(req: NextRequest, baja: boolean) {
  const j = (await req.json().catch(() => null)) as unknown;
  const cuerpo = baja ? (endpointDePushValido((j as { endpoint?: unknown } | null)?.endpoint) ? { endpoint: (j as { endpoint: string }).endpoint } : null) : leerSuscripcionVuelo(j);
  if (!cuerpo) return NextResponse.json({ detail: "Suscripción inválida." }, { status: 400 });
  const res = await apiFetch(`/tracker/avisos${baja ? "/baja" : ""}`, { method: "POST", body: JSON.stringify(cuerpo), cache: "no-store" }).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });
  const datos = await res.json().catch(() => ({}));
  return NextResponse.json(res.ok ? { ok: true } : { detail: typeof datos?.detail === "string" ? datos.detail : "No se pudo." }, { status: res.ok ? 200 : res.status, headers: { "Cache-Control": "no-store" } });
}

export function POST(req: NextRequest) {
  return reenviar(req, false);
}

export function DELETE(req: NextRequest) {
  return reenviar(req, true);
}
