import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

/**
 * La clave pública VAPID para pedir avisos de un vuelo sin cuenta (`GET /publico/push/clave`).
 * `clave: null` si este servidor no tiene los avisos configurados: la página no ofrece el botón.
 */
export async function GET() {
  const res = await apiFetch("/publico/push/clave", { cache: "no-store" }, { anonimo: true }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ clave: null }, { headers: { "Cache-Control": "no-store" } });
  const d = (await res.json().catch(() => null)) as { clave?: unknown } | null;
  return NextResponse.json({ clave: typeof d?.clave === "string" ? d.clave : null }, { headers: { "Cache-Control": "no-store" } });
}
