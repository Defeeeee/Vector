import { NextResponse } from "next/server";
import { VERSION, VERSION_MINIMA } from "@/lib/pwa";

/**
 * La versión que corre el servidor y la más vieja de la app que todavía sirve (3.13.0). Lo pide
 * la app al abrir y al volver de segundo plano: una pestaña más vieja que `minima` se actualiza
 * sin opción (`comoActualizar`). Sin cache: tiene que contestar el servidor de ahora.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ version: VERSION, minima: VERSION_MINIMA }, { headers: { "Cache-Control": "no-store" } });
}
