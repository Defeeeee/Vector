import { NextRequest, NextResponse } from "next/server";
import { leerHojasConGemini } from "@/lib/leer-libro-gemini";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";

/** Un libro escaneado entero entra holgado; más que esto no es un libro de vuelo. */
const PDF_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Las fotos de las hojas (2.28.0): llegan ya achicadas desde el navegador (`comprimirImagen`,
 * a 2400 px), así que doce hojas entran en el mismo tope que el PDF.
 */
const MAX_FOTOS = 12;
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Importar el libro de papel: el PDF va a Gemini, que devuelve los vuelos.
 *
 * **Pide sesión antes de tocar nada.** Hasta el 2026-09-23 no la pedía: `/api/*` no
 * pasa por el proxy, así que cualquiera podía mandar PDFs y gastar la cuota de Gemini
 * del proyecto. La cookie sola no alcanza —el proxy no verifica firmas—, así que se le
 * pregunta al backend quién es.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionToken())) {
      return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    }
    const quien = await apiFetch("/profiles", { cache: "no-store" });
    if (quien.status === 401) {
      return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    }
    if (!quien.ok) {
      return NextResponse.json({ error: "No se pudo verificar tu sesión. Probá de nuevo." }, { status: 503 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API Key no configurada" }, { status: 500 });
    }

    // Antes de leer el cuerpo: un archivo enorme ni se baja a memoria.
    if (Number(req.headers.get("content-length") || 0) > PDF_MAX_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "El PDF pesa demasiado (máximo 15 MB)." }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const fotos = formData.getAll("fotos").filter((f): f is File => typeof f !== "string");

    // Un PDF, o fotos de las hojas: lo mismo para Gemini, una parte por archivo.
    let partes: { inlineData: { data: string; mimeType: string } }[];
    if (fotos.length > 0) {
      if (fotos.length > MAX_FOTOS) return NextResponse.json({ error: `Subí hasta ${MAX_FOTOS} fotos por vez.` }, { status: 400 });
      if (fotos.some((f) => !TIPOS_FOTO.has(f.type))) return NextResponse.json({ error: "Las fotos tienen que ser JPG, PNG o WebP." }, { status: 400 });
      if (fotos.reduce((t, f) => t + f.size, 0) > PDF_MAX_BYTES) return NextResponse.json({ error: "Las fotos pesan demasiado (máximo 15 MB en total)." }, { status: 413 });
      partes = await Promise.all(
        fotos.map(async (f) => ({ inlineData: { data: Buffer.from(await f.arrayBuffer()).toString("base64"), mimeType: f.type } }))
      );
    } else {
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No se subió ningún archivo." }, { status: 400 });
      }
      if (file.size > PDF_MAX_BYTES) {
        return NextResponse.json({ error: "El PDF pesa demasiado (máximo 15 MB)." }, { status: 413 });
      }
      partes = [{ inlineData: { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType: "application/pdf" } }];
    }

    const descripcion = fotos.length ? (fotos.length === 1 ? "una foto de una hoja del libro de papel" : `${fotos.length} fotos de hojas del libro de papel`) : "un PDF";
    const flights = await leerHojasConGemini(partes, descripcion, fotos.length > 0);

    return NextResponse.json({ flights });
  } catch (err: any) {
    console.error("parse-logbook API error:", err);
    return NextResponse.json({ error: err.message || "Error al procesar el libro de vuelo" }, { status: 500 });
  }
}
