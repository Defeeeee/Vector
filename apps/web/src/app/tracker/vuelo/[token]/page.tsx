import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import SeguimientoVivo from "@/components/seguimiento/SeguimientoVivo";
import { apiFetch } from "@/lib/api";
import { tokenValido, type SeguimientoPublico } from "@/lib/seguimiento";

/**
 * El detalle de un vuelo en el tracker (`/vuelo/<token>`): el mismo visor de `/seguir/<token>`
 * (`SeguimientoVivo`) dentro del layout del tracker. **Sólo si ese vuelo está asignado a esta cuenta**:
 * si no (o si el piloto la quitó), 404, igual que un vuelo que no existe. El visor sigue pidiendo lo
 * público por token, como hoy. Un backend caído no es "no existe": tira y lo agarra `error.tsx`.
 */
export const metadata: Metadata = { title: "Vuelo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VueloTracker({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) notFound();

  const permiso = await apiFetch(`/tracker/vuelos/${token}`, { cache: "no-store" });
  if (permiso.status === 401) redirect("/api/auth/logout?redirect=/ingresar");
  if (permiso.status === 404) notFound();
  if (!permiso.ok) throw new Error(`El vuelo no se pudo leer (${permiso.status}).`);

  const res = await apiFetch(`/publico/seguimientos/${token}`, { cache: "no-store" }, { anonimo: true });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`El seguimiento no se pudo leer (${res.status}).`);
  const inicial = (await res.json()) as SeguimientoPublico;

  return <SeguimientoVivo token={token} inicial={inicial} enTracker />;
}
