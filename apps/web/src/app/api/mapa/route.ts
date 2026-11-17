import { NextResponse } from "next/server";
import { armarMapa } from "@/lib/mapa-datos";

/**
 * GET /api/mapa — las capas fijas del Mapa: aeródromos, radioayudas, espacios aéreos y FIR
 * (3.1.0), cada uno con quién se habla.
 *
 * Una sola respuesta, compacta (arrays y no objetos, coordenadas a 4 decimales: ~11 m), y
 * cacheada un día como el resto de lo que sale del AIP: cambia con un deploy. El service
 * worker la guarda para que el mapa ande sin señal en vuelo; y si ni eso hay, la contesta con
 * el paquete de `/api/sin-senal/datos` (`lib/sin-senal.ts`). Se arma en `lib/mapa-datos.ts`.
 */
export async function GET() {
  return NextResponse.json(armarMapa(), { headers: { "Cache-Control": "public, max-age=86400" } });
}
