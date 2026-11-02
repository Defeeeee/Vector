"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { COOKIE_QR, leerCookieQr, normalizarCodigo } from "@/lib/pegatinas";
import { esErrorDeRedirect } from "@/lib/redirect-error";

/**
 * La cuenta viene de una pegatina: la llama `AnotarOrigenQr` desde el navegador, la primera
 * vez que se entra al dashboard con la cookie del escaneo (invariante 15: no en el render).
 * El backend decide si cuenta (creada después del escaneo y dentro de los 30 días) y nunca
 * pisa un origen ya anotado. La cookie se borra igual: es de un solo uso.
 */
export async function anotarOrigenQr() {
  const almacen = await cookies();
  const leido = leerCookieQr(almacen.get(COOKIE_QR)?.value);
  try {
    if (leido) {
      const r = await apiFetch("/qr/origen", {
        method: "POST",
        body: JSON.stringify({ codigo: leido.codigo, escaneado_at: leido.escaneadoAt }),
      });
      // Si el backend no contestó, se reintenta en la próxima entrada.
      if (r.status >= 500) return;
    }
    almacen.delete(COOKIE_QR);
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
}

/** Un lote de pegatinas nuevas para imprimir. Sólo admin: el backend contesta 404 al resto. */
export async function crearPegatinas(cantidad: number, lote: string): Promise<{ codigos?: string[]; error?: string }> {
  const n = Math.round(Number(cantidad));
  if (!(n >= 1 && n <= 200)) return { error: "Entre 1 y 200 pegatinas por vez." };
  try {
    const r = await apiFetch("/admin/qr", { method: "POST", body: JSON.stringify({ cantidad: n, lote: lote.trim().slice(0, 40) || null }) });
    if (!r.ok) return { error: "No se pudieron crear." };
    revalidatePath("/dashboard/admin/pegatinas");
    return { codigos: ((await r.json()) as { codigos: string[] }).codigos };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudieron crear." };
  }
}

/** Dónde quedó pegada. Vacío la desasigna. */
export async function asignarPegatina(codigo: string, etiqueta: string): Promise<{ error?: string }> {
  const c = normalizarCodigo(codigo);
  if (!c) return { error: "Código inválido." };
  try {
    const r = await apiFetch(`/admin/qr/${c}`, { method: "PATCH", body: JSON.stringify({ etiqueta: etiqueta.trim().slice(0, 80) || null }) });
    if (!r.ok) return { error: "No se pudo guardar." };
    revalidatePath("/dashboard/admin/pegatinas");
    revalidatePath(`/dashboard/admin/pegatinas/${c}`);
    return {};
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "No se pudo guardar." };
  }
}
