import { NextResponse } from "next/server";
import { armarPaquete } from "@/lib/sin-senal-servidor";

/**
 * GET /api/sin-senal/datos — el paquete para usar Vector sin señal (`lib/sin-senal.ts`): los
 * aeródromos argentinos con su ficha, las aerovías y las capas del Mapa.
 *
 * **Estático, igual para todos y sin datos del piloto**: sale de los TSV commiteados, así que cambia
 * sólo con un deploy y se arma una vez, en el build. El service worker lo baja al instalarse una
 * versión y cuando el piloto toca "Actualizar ahora" (siempre salteando el cache HTTP: acá el
 * `Cache-Control` es largo, y es para el navegador común, no para esa bajada).
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(armarPaquete(), { headers: { "Cache-Control": "public, max-age=86400" } });
}
