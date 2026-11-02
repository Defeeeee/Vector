import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";
import { mensajeDeErrorApi } from "@/lib/social";

/**
 * Publicar: reenvía al backend el multipart que arma `ComposerPublicacion`, con la sesión.
 *
 * **Es una ruta y no una server action** porque las acciones cortan el cuerpo en 1 MB
 * y cuatro fotos lo pasan. Las fotos van en campos `foto_0`…`foto_3`, que es lo que lee
 * `POST /publicaciones` del backend: un campo repetido (`fotos`, `fotos`…) lo ignora, y
 * la publicación sale sin fotos y sin error.
 *
 * El error vuelve como `{ error }`, ya en castellano para el piloto: nunca el JSON
 * crudo del backend.
 */

/** Procesar cuatro fotos y subirlas a us-east-1 tarda bastante más que un GET. */
const TIMEOUT_PUBLICAR_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer lo que mandaste. Probá de nuevo." }, { status: 400 });
  }

  const res = await apiFetch(
    "/publicaciones",
    { method: "POST", body: formulario },
    { timeoutMs: TIMEOUT_PUBLICAR_MS },
  );
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const porDefecto =
      res.status === 503 ? "No se pudo contactar al servidor. Probá de nuevo en un momento." : "No se pudo publicar.";
    return NextResponse.json({ error: mensajeDeErrorApi(cuerpo, porDefecto) }, { status: res.status });
  }
  return NextResponse.json(cuerpo, { status: 201 });
}
