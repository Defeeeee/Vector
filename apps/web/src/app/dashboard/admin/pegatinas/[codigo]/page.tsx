import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import AsignarPegatina from "@/components/admin/AsignarPegatina";
import { haceCuanto, momento, numero, type PegatinaAdmin } from "@/lib/admin";
import { normalizarCodigo } from "@/lib/pegatinas";

/**
 * Una pegatina: adónde llega el admin cuando escanea una (`/q/[codigo]`). Si todavía no está
 * asignada, pregunta dónde quedó pegada; si ya lo está, muestra cómo le va y deja cambiarla.
 */
export const metadata: Metadata = { title: "Pegatina · Vector", robots: { index: false, follow: false } };

const tarjeta = "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8";

export default async function PegatinaAdmin({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigo) notFound();
  const res = await apiFetch(`/admin/qr/${codigo}`, { cache: "no-store" });
  if (res.status === 401) redirect("/api/auth/logout?redirect=/?expired=true");
  if (!res.ok) notFound();
  const p = (await res.json()) as PegatinaAdmin;
  const ahora = new Date().toISOString();

  return (
    <div className="space-y-8 pb-16 max-w-2xl">
      <PageHeader
        eyebrow="Pegatina con QR"
        title={p.codigo}
        action={
          <Link href="/dashboard/admin/pegatinas" className="text-sm font-semibold px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5">
            Todas
          </Link>
        }
      />

      <AsignarPegatina codigo={p.codigo} etiqueta={p.etiqueta} />

      <a
        href={`/api/admin/pegatinas/archivos?codigo=${p.codigo}`}
        download={`Vector-${p.codigo}.png`}
        className="inline-block text-sm font-semibold text-aviation-blue hover:underline"
      >
        Bajar el PNG de esta pegatina
      </a>

      <section className={`${tarjeta} grid grid-cols-3 gap-4`}>
        {[
          ["Escaneos", numero(p.escaneos), `${numero(p.escaneos_sin_sesion)} sin sesión`],
          ["Cuentas nuevas", numero(p.cuentas), "dentro de los 30 días"],
          ["Último escaneo", haceCuanto(p.ultimo_escaneo, ahora), p.asignado_at ? `pegada el ${momento(p.asignado_at)}` : "sin asignar"],
        ].map(([titulo, valor, nota]) => (
          <div key={titulo}>
            <p className="eyebrow">{titulo}</p>
            <p className="data text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white mt-2 leading-none">{valor}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{nota}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
