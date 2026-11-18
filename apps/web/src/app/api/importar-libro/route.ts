import { NextRequest, NextResponse, after } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";
import { TOPE_BYTES_LIBRO, TOPE_FOTOS, TOPE_PAGINAS_PDF } from "@/lib/importar-libro";
import { leerCsv, leerXlsx, lotesDePlanilla, type LotePlanilla } from "@/lib/planilla";
import { borrarImportacion, carpetaDeImportacion, procesarImportacion, type MetaImportacion } from "@/lib/importar-libro-servidor";

// Esperar a Gemini lote por lote puede llevar minutos: sólo importa donde el hosting corta la función.
export const maxDuration = 300;

/** Lotes de 80 filas: 40 son unos 3.000 vuelos. */
const TOPE_LOTES_PLANILLA = 40;

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/**
 * Subir el libro (PDF o fotos) para leerlo en segundo plano (Federico, 2026-11-17).
 *
 * Guarda el archivo en el server, crea el trabajo y **contesta enseguida** con su id; la lectura
 * sigue con `after()` y avisa por mail al terminar. El piloto no tiene que quedarse en la página.
 * Pide sesión (cada lectura gasta cuota de Gemini) y no escribe nada en la bitácora: eso lo hace
 * el piloto después, al revisar y confirmar.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionToken())) return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    const quien = await apiFetch("/profiles", { cache: "no-store" });
    if (quien.status === 401) return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
    if (!quien.ok) return NextResponse.json({ error: "No se pudo verificar tu sesión. Probá de nuevo." }, { status: 503 });
    if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "La lectura del libro no está configurada." }, { status: 500 });

    if (Number(req.headers.get("content-length") || 0) > TOPE_BYTES_LIBRO + 1024 * 1024) {
      return NextResponse.json({ error: "El libro pesa demasiado (máximo 60 MB)." }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const fotos = formData.getAll("fotos").filter((f): f is File => typeof f !== "string");

    let meta: MetaImportacion;
    let escribir: (dir: string) => Promise<void>;
    if (fotos.length > 0) {
      if (fotos.length > TOPE_FOTOS) return NextResponse.json({ error: `Subí hasta ${TOPE_FOTOS} fotos por libro.` }, { status: 400 });
      if (fotos.some((f) => !TIPOS_FOTO[f.type])) return NextResponse.json({ error: "Las fotos tienen que ser JPG, PNG o WebP." }, { status: 400 });
      if (fotos.reduce((t, f) => t + f.size, 0) > TOPE_BYTES_LIBRO) return NextResponse.json({ error: "Las fotos pesan demasiado (máximo 60 MB en total)." }, { status: 413 });
      const nombres = fotos.map((f, i) => `foto-${String(i + 1).padStart(3, "0")}${TIPOS_FOTO[f.type]}`);
      meta = { tipo: "fotos", hojas: fotos.length, archivos: nombres };
      escribir = async (dir) => {
        for (const [i, f] of fotos.entries()) await fs.writeFile(path.join(dir, nombres[i]), Buffer.from(await f.arrayBuffer()));
      };
    } else if (file && typeof file !== "string" && /\.(xlsx|csv|xls)$/i.test(file.name)) {
      // Una planilla de cualquier formato: se pasa a texto acá (así se sabe ya si se puede leer) y
      // Gemini la lee por lotes de filas, cada uno con el encabezado de su hoja (`lib/planilla.ts`).
      if (/\.xls$/i.test(file.name)) return NextResponse.json({ error: "El formato .xls viejo no se puede leer: guardá la planilla como .xlsx o .csv y subila de nuevo." }, { status: 400 });
      if (file.size > TOPE_BYTES_LIBRO) return NextResponse.json({ error: "La planilla pesa demasiado (máximo 60 MB)." }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      let lotes: LotePlanilla[];
      try {
        lotes = lotesDePlanilla(/\.csv$/i.test(file.name) ? leerCsv(bytes.toString("utf8")) : leerXlsx(bytes));
      } catch {
        return NextResponse.json({ error: "No pudimos abrir la planilla. Probá guardándola como .csv." }, { status: 400 });
      }
      if (lotes.length === 0) return NextResponse.json({ error: "La planilla está vacía." }, { status: 400 });
      if (lotes.length > TOPE_LOTES_PLANILLA) return NextResponse.json({ error: "La planilla es muy larga para leerla de una vez: subila en dos partes." }, { status: 400 });
      meta = { tipo: "planilla", hojas: lotes.length, archivos: ["planilla.json"] };
      escribir = async (dir) => fs.writeFile(path.join(dir, "planilla.json"), JSON.stringify(lotes));
    } else {
      if (!file || typeof file === "string") return NextResponse.json({ error: "No se subió ningún archivo." }, { status: 400 });
      if (file.size > TOPE_BYTES_LIBRO) return NextResponse.json({ error: "El PDF pesa demasiado (máximo 60 MB)." }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      let paginas = 0;
      try {
        paginas = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
      } catch {
        return NextResponse.json({ error: "No pudimos abrir el PDF. Probá con otro archivo o con fotos de las hojas." }, { status: 400 });
      }
      if (paginas < 1) return NextResponse.json({ error: "El PDF no tiene páginas." }, { status: 400 });
      if (paginas > TOPE_PAGINAS_PDF) return NextResponse.json({ error: `El PDF tiene ${paginas} páginas: el máximo por libro es ${TOPE_PAGINAS_PDF}. Subilo en dos partes.` }, { status: 400 });
      meta = { tipo: "pdf", hojas: paginas, archivos: ["libro.pdf"] };
      escribir = async (dir) => fs.writeFile(path.join(dir, "libro.pdf"), bytes);
    }

    const creada = await apiFetch("/importaciones-libro", { method: "POST", body: JSON.stringify({ paginas_total: meta.hojas }), cache: "no-store" });
    if (!creada.ok) return NextResponse.json({ error: "No pudimos registrar la importación. Probá de nuevo." }, { status: 502 });
    const { id } = (await creada.json()) as { id: string };

    try {
      const dir = carpetaDeImportacion(id);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await escribir(dir);
      await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
    } catch (err) {
      console.error("importar-libro: no se pudo guardar el archivo:", err);
      await borrarImportacion(id).catch(() => undefined);
      await apiFetch(`/importaciones-libro/${id}/descartar`, { method: "POST", cache: "no-store" }).catch(() => undefined);
      return NextResponse.json({ error: "No pudimos guardar el libro. Probá de nuevo." }, { status: 500 });
    }

    after(() => procesarImportacion(id));
    return NextResponse.json({ id, hojas: meta.hojas });
  } catch (err: any) {
    console.error("importar-libro API error:", err);
    return NextResponse.json({ error: err.message || "Error al subir el libro" }, { status: 500 });
  }
}
