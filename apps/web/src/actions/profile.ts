"use server";

import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { normalizarWhatsapp } from "@/lib/whatsapp-numero";

/**
 * Devuelve `{ error }` en vez de tirar: el mensaje de un `throw` en una server action no
 * llega al navegador en producción (Next lo reemplaza por uno genérico), y el del número
 * de WhatsApp es justamente el que el piloto tiene que leer.
 */
export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get("id") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;
  const license_type = formData.get("license_type") as string;
  const whatsapp_phone = formData.get("whatsapp_phone") as string;
  // Van en el encabezado del libro en PDF (migración 020). Vacío es `null`, no "".
  const textoOpcional = (campo: string) => String(formData.get(campo) ?? "").trim().slice(0, 30) || null;

  if (!id) {
    return { error: "No se encontró tu perfil. Recargá la página." };
  }

  // Sólo si el formulario trae el campo: el paso 1 del alta no lo tiene, y no por eso
  // tiene que borrar un número que el piloto ya cargó.
  let whatsappNormalizado: string | null | undefined;
  if (formData.has("whatsapp_phone")) {
    const r = normalizarWhatsapp(whatsapp_phone);
    if (!r.ok) return { error: r.error };
    whatsappNormalizado = r.numero || null;
  }

  // The medical lives in the `documents` table (see src/actions/document.ts).
  // `profiles.cma_expiry` was the old home and is being dropped — nothing here
  // writes it, and re-adding it would recreate the split source of truth.
  const response = await apiFetch(`/profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      first_name,
      last_name,
      license_type,
      ...(whatsappNormalizado !== undefined ? { whatsapp_phone: whatsappNormalizado } : {}),
      // Sólo lo que el formulario trae: al alumno no se le muestran (no lleva libro), y
      // mandarlos vacíos borraría lo que tuviera cargado de antes.
      ...(formData.has("licencia_numero") ? { licencia_numero: textoOpcional("licencia_numero") } : {}),
      ...(formData.has("legajo") ? { legajo: textoOpcional("legajo") } : {}),
      // Aparece sólo al pasar de alumno a PPA, o si ya estaba cargada (migración 022).
      ...(formData.has("fecha_ppa") ? { fecha_ppa: String(formData.get("fecha_ppa") || "") || null } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo guardar el perfil." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return {};
}

/**
 * Guarda sólo el número de WhatsApp, normalizado. Lo usa el paso "Tus vuelos" del alta,
 * que no tiene el resto del perfil a mano (y un PATCH con campos vacíos los borraría).
 */
export async function conectarWhatsapp(entrada: string): Promise<{ error?: string; numero?: string }> {
  const r = normalizarWhatsapp(entrada);
  if (!r.ok) return { error: r.error };
  if (!r.numero) return { error: "Escribí tu número de celular." };

  const perfil = await apiFetch("/profiles");
  if (!perfil.ok) return { error: "No se pudo leer tu perfil. Probá de nuevo." };
  const [yo] = await perfil.json();
  if (!yo?.id) return { error: "No se encontró tu perfil." };

  const response = await apiFetch(`/profiles/${yo.id}`, {
    method: "PATCH",
    body: JSON.stringify({ whatsapp_phone: r.numero }),
  });
  if (!response.ok) return { error: "No se pudo guardar el número. Probá de nuevo." };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { numero: r.numero };
}

export async function regenerateApiKey() {
  const response = await apiFetch("/profiles/apikey/regenerate", {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Error al regenerar el token");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}
