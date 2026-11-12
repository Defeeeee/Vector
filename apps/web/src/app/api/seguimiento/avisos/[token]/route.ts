import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { endpointDePushValido, leerSuscripcionVuelo } from "@/lib/avisos-vuelo";
import { tokenValido } from "@/lib/seguimiento";

/**
 * Pedir (`POST`) o dejar (`DELETE`) los avisos de "despegó" y "aterrizó" de un vuelo compartido,
 * desde la página pública `/seguir/[token]` (migración 046). Sin sesión (`anonimo`): lo hace cualquiera
 * que tenga el link. Se reenvía **sólo** la suscripción del navegador, ya validada; el backend vuelve
 * a validarla. Un token que no existe, vencido o terminado da el mismo 404 de siempre.
 */
const NO_EXISTE = { detail: "Ese seguimiento no existe." };

async function reenviar(req: NextRequest, params: Promise<{ token: string }>, baja: boolean) {
  const { token } = await params;
  if (!tokenValido(token)) return NextResponse.json(NO_EXISTE, { status: 404 });
  const j = (await req.json().catch(() => null)) as unknown;

  let cuerpo: SuscripcionOEndpoint | null;
  if (baja) {
    const endpoint = (j as { endpoint?: unknown } | null)?.endpoint;
    cuerpo = endpointDePushValido(endpoint) ? { endpoint } : null;
  } else {
    cuerpo = leerSuscripcionVuelo(j);
  }
  if (!cuerpo) return NextResponse.json({ detail: "Suscripción inválida." }, { status: 400 });

  const res = await apiFetch(
    `/publico/seguimientos/${token}/avisos${baja ? "/baja" : ""}`,
    { method: "POST", body: JSON.stringify(cuerpo), cache: "no-store" },
    { anonimo: true }
  ).catch(() => null);
  if (!res) return NextResponse.json({ detail: "Sin conexión con el servidor." }, { status: 502 });
  const datos = await res.json().catch(() => ({}));
  return NextResponse.json(res.ok ? { ok: true } : { detail: typeof datos?.detail === "string" ? datos.detail : "No se pudo." }, {
    status: res.ok ? 200 : res.status,
    headers: { "Cache-Control": "no-store" },
  });
}

type SuscripcionOEndpoint = { endpoint: string } | NonNullable<ReturnType<typeof leerSuscripcionVuelo>>;

export function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return reenviar(req, params, false);
}

export function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return reenviar(req, params, true);
}
