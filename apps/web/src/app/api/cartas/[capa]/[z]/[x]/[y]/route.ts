import fs from "node:fs/promises";
import path from "node:path";
import { carpetaDeDatos } from "@/lib/madhel-descargado";
import { teselaValida } from "@/lib/cartas-aip";

export const runtime = "nodejs";

/**
 * GET /api/cartas/<capa>/<z>/<x>/<y> — una tesela de las cartas del AIP (`lib/cartas-aip.ts`),
 * del disco del VPS. Pública, como el AIP. Sin tesela (fuera de la carta), 404: el Mapa pone
 * una transparente. Se guarda una semana en el navegador; la URL lleva el ciclo AIRAC.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ capa: string; z: string; x: string; y: string }> }) {
  const { capa, z, x, y } = await params;
  const t = teselaValida(capa, z, x, y);
  if (!t) return new Response(null, { status: 404 });
  const archivo = path.join(carpetaDeDatos(), "cartas", t.capa.id, String(t.z), String(t.x), `${t.y}.webp`);
  try {
    const datos = await fs.readFile(archivo);
    return new Response(new Uint8Array(datos), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=604800, immutable" },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
  }
}
