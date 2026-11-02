import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import NuevasPegatinas from "@/components/admin/NuevasPegatinas";
import { haceCuanto, numero, type PegatinaAdmin } from "@/lib/admin";

/**
 * Las pegatinas con QR (migración 033 del backend): cuántos escanearon cada una y cuántas
 * cuentas salieron de ella, y el formulario para imprimir un lote nuevo. Como el panel: sin
 * link desde la app y 404 para quien no es admin. Mirar no escribe (invariante 15).
 */
export const metadata: Metadata = { title: "Pegatinas · Vector", robots: { index: false, follow: false } };

const tarjeta = "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8";

export default async function PegatinasAdmin() {
  const res = await apiFetch("/admin/qr", { cache: "no-store" });
  if (res.status === 401) redirect("/api/auth/logout?redirect=/?expired=true");
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Administración" title="Pegatinas con QR" />
        <p className={`${tarjeta} text-sm text-zinc-600 dark:text-zinc-300`}>No se pudieron leer las pegatinas (HTTP {res.status}).</p>
      </div>
    );
  }
  const { pegatinas } = (await res.json()) as { pegatinas: PegatinaAdmin[] };
  const ahora = new Date().toISOString();
  const asignadas = pegatinas.filter((p) => p.etiqueta);
  const sinAsignar = pegatinas.length - asignadas.length;
  const escaneos = pegatinas.reduce((t, p) => t + p.escaneos, 0);
  const cuentas = pegatinas.reduce((t, p) => t + p.cuentas, 0);

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        eyebrow="Administración"
        title="Pegatinas con QR"
        action={
          <Link href="/dashboard/admin" className="text-sm font-semibold px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5">
            Volver al panel
          </Link>
        }
      >
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Imprimí un lote, pegalas y escaneá cada una con tu teléfono: como sos admin, Vector te pregunta dónde quedó. Una cuenta cuenta para una pegatina si se crea dentro de los 30 días del escaneo.
        </p>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["Pegadas", numero(asignadas.length)],
          ["Sin asignar", numero(sinAsignar)],
          ["Escaneos", numero(escaneos)],
          ["Cuentas nuevas", numero(cuentas)],
        ].map(([titulo, valor]) => (
          <div key={titulo} className={`${tarjeta} !p-5 md:!p-6`}>
            <p className="eyebrow">{titulo}</p>
            <p className="data text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mt-2 leading-none">{valor}</p>
          </div>
        ))}
      </div>

      <NuevasPegatinas sinAsignar={sinAsignar} />

      <section className={tarjeta}>
        <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">Cada pegatina</h3>
        {pegatinas.length === 0 ? (
          <p className="text-sm text-zinc-500 mt-4">Todavía no imprimiste ninguna. Creá un lote arriba.</p>
        ) : (
          <div className="mt-5 overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400">
                  <th className="px-2 py-2 font-semibold">Código</th>
                  <th className="px-2 py-2 font-semibold">Dónde</th>
                  <th className="px-2 py-2 font-semibold text-right">Escaneos</th>
                  <th className="px-2 py-2 font-semibold text-right">Sin sesión</th>
                  <th className="px-2 py-2 font-semibold text-right">Cuentas</th>
                  <th className="px-2 py-2 font-semibold">Último</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {pegatinas.map((p) => (
                  <tr key={p.codigo}>
                    <td className="px-2 py-2.5">
                      <Link href={`/dashboard/admin/pegatinas/${p.codigo}`} className="font-mono font-semibold text-aviation-blue hover:underline">
                        {p.codigo}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-zinc-900 dark:text-white">
                      {p.etiqueta ?? <span className="text-zinc-400">Sin asignar{p.lote ? ` · ${p.lote}` : ""}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right data">{numero(p.escaneos)}</td>
                    <td className="px-2 py-2.5 text-right data text-zinc-500">{numero(p.escaneos_sin_sesion)}</td>
                    <td className="px-2 py-2.5 text-right data font-semibold">{numero(p.cuentas)}</td>
                    <td className="px-2 py-2.5 text-zinc-500 whitespace-nowrap">{haceCuanto(p.ultimo_escaneo, ahora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
