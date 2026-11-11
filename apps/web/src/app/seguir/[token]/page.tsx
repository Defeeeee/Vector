import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeguimientoVivo from "@/components/seguimiento/SeguimientoVivo";
import { apiFetch } from "@/lib/api";
import { tokenValido, type SeguimientoPublico } from "@/lib/seguimiento";

/**
 * El vuelo de un piloto en vivo: `/seguir/<token>`, el link que manda desde el Mapa ("Compartir mi
 * vuelo", migración 041 del backend).
 *
 * **Se abre sin cuenta**, como el perfil público (`/u/...`): lo recibe la familia por WhatsApp. Vive
 * fuera de `/dashboard` y `src/proxy.ts` no la toca. **Siempre como anónimo** (`anonimo`), aunque
 * quien lo abra tenga sesión: es lo que ve cualquiera que tenga el link.
 *
 * - **La vista previa no dice nada del vuelo**: "Seguí el vuelo", sin nombre, ruta ni posición. El link
 *   lo reenvía quien lo recibe, y el título lo lee cualquier app que lo pegue.
 * - `noindex` (y `/seguir` fuera de `robots.ts`): no es contenido para buscadores.
 * - Un link que no existe o ya no se puede ver (terminó hace más de 2 h, o venció) es un 404, igual.
 *   Un backend caído **no** es "no existe": tira, y lo agarra `src/app/error.tsx`.
 */

export const metadata: Metadata = {
  title: "Seguí el vuelo | Vector",
  description: "Seguí el vuelo en vivo.",
  robots: { index: false, follow: false },
  openGraph: { title: "Seguí el vuelo", description: "Seguí el vuelo en vivo.", siteName: "Vector", locale: "es_AR", type: "website" },
};

// El seguimiento cambia cada pocos segundos: nada de cachear la página.
export const dynamic = "force-dynamic";

export default async function SeguirPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) notFound();

  const res = await apiFetch(`/publico/seguimientos/${token}`, { cache: "no-store" }, { anonimo: true });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`El seguimiento no se pudo leer (${res.status}).`);
  const inicial = (await res.json()) as SeguimientoPublico;

  return <SeguimientoVivo token={token} inicial={inicial} />;
}
