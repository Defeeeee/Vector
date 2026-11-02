import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";
import { mensajeDeErrorApi } from "@/lib/social";

/**
 * La foto de perfil: subirla (`POST`, el archivo en el campo `archivo`) o sacarla
 * (`DELETE`). Una ruta y no una acción por lo mismo que `publicaciones/`: el cuerpo.
 *
 * Después de cualquiera de las dos se revalida el layout —la foto está en el
 * encabezado de todas las pantallas— y los perfiles públicos.
 */

function revalidarFoto() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/u/[handle]", "page");
}

async function responder(res: Response, porDefecto: string) {
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const mensaje = res.status === 503 ? "No se pudo contactar al servidor. Probá de nuevo en un momento." : porDefecto;
    return NextResponse.json({ error: mensajeDeErrorApi(cuerpo, mensaje) }, { status: res.status });
  }
  revalidarFoto();
  return NextResponse.json(cuerpo ?? { ok: true });
}

export async function POST(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer la foto. Probá de nuevo." }, { status: 400 });
  }
  // Por forma y no con `instanceof Blob`: el `File` de `req.formData()` puede venir de
  // otra copia de undici que la del global, y ahí `instanceof` da falso con un archivo.
  const archivo = formulario.get("archivo");
  if (!archivo || typeof archivo === "string" || typeof archivo.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Elegí una foto." }, { status: 400 });
  }
  const res = await apiFetch("/perfil-publico/avatar", { method: "POST", body: formulario }, { timeoutMs: 30_000 });
  return responder(res, "No se pudo subir la foto.");
}

export async function DELETE() {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  const res = await apiFetch("/perfil-publico/avatar", { method: "DELETE" });
  return responder(res, "No se pudo sacar la foto.");
}
