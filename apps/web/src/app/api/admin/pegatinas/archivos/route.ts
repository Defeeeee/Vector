import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { codigosDeLaHoja } from "@/lib/pegatinas";
import { pngDePegatina } from "@/lib/pegatina-png";
import { SITIO_URL } from "@/lib/sitio";
import { armarZip } from "@/lib/zip";

export const runtime = "nodejs";

/**
 * Las pegatinas para mandar a hacer: un ZIP con un PNG por código (`Vector-K7P2.png`), que es
 * lo que pide la imprenta. `?codigos=K7P2,M3XA` o `?sin_asignar=1`; con `?codigo=K7P2` baja
 * ese solo, sin ZIP. Sólo admin: 404 para el resto, como el panel.
 */
export async function GET(req: NextRequest) {
  const r = await apiFetch("/admin/qr", { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return new NextResponse("No encontrado", { status: 404 });
  const url = new URL(req.url);

  const uno = codigosDeLaHoja(url.searchParams.get("codigo"), 1)[0];
  if (uno) {
    return new NextResponse(Buffer.from(await pngDePegatina(uno, SITIO_URL)), {
      headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="Vector-${uno}.png"`, "Cache-Control": "no-store" },
    });
  }

  let codigos = codigosDeLaHoja(url.searchParams.get("codigos"), 100);
  if (url.searchParams.get("sin_asignar") === "1") {
    const { pegatinas } = (await r.json()) as { pegatinas: { codigo: string; etiqueta: string | null }[] };
    codigos = pegatinas.filter((p) => !p.etiqueta).map((p) => p.codigo).slice(0, 100);
  }
  if (!codigos.length) return new NextResponse("No hay pegatinas", { status: 400 });

  // De a una: cada PNG es un render de satori, y en paralelo cien se comerían la memoria.
  const archivos: { nombre: string; datos: Uint8Array }[] = [];
  for (const c of codigos) archivos.push({ nombre: `Vector-${c}.png`, datos: await pngDePegatina(c, SITIO_URL) });

  return new NextResponse(Buffer.from(armarZip(archivos)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="pegatinas-vector-${codigos.length}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
