import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import NuevaChecklist from "@/components/dashboard/checklists/NuevaChecklist";
import type { Aircraft } from "@/types";

export const metadata = { title: "Checklists | Vector" };

/**
 * Las checklists de tus aviones (3.39.0): la de tu escuela o tu avión, tal cual está en papel.
 * Cuelga de Herramientas. Se piden sin cache: se crean y se asignan desde estas mismas pantallas.
 */
const FRESCO = { cache: "no-store" } as const;

interface Breve {
  id: string;
  nombre: string;
}

export default async function ChecklistsPage() {
  const [listaRes, avionesRes] = await Promise.all([apiFetch("/checklists", FRESCO), apiFetch("/aircraft", FRESCO)]);
  if (listaRes.status === 401 || avionesRes.status === 401) redirect("/api/auth/logout?redirect=/login?expirada=1");
  const lista: Breve[] = listaRes.ok ? await listaRes.json().catch(() => []) : [];
  const aviones: Aircraft[] = avionesRes.ok ? await avionesRes.json().catch(() => []) : [];

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="space-y-4">
        <Link href="/dashboard/tools" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Herramientas
        </Link>
        <PageHeader eyebrow="Para usar en tierra y en vuelo" title="Checklists" />
      </div>

      <section className="space-y-5 border-t border-white/10 pt-8">
        {lista.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
            Cargá la checklist de tu escuela o de tu avión, tal cual está en papel, y usala tildando paso por paso, en tierra y en
            vuelo. Vector no trae ninguna: muestra exactamente lo que cargues vos.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {lista.map((c) => {
              const matriculas = aviones.filter((a) => a.checklist_id === c.id).map((a) => a.registration);
              return (
                <li key={c.id}>
                  <Link href={`/dashboard/tools/checklists/${c.id}`} className="flex items-center gap-3 min-h-16 py-3 hover:bg-white/[0.03] transition-colors">
                    <span className="flex-1 min-w-0">
                      <span className="block text-lg font-semibold text-zinc-900 dark:text-white truncate">{c.nombre}</span>
                      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 truncate">
                        {matriculas.length ? matriculas.join(" · ") : "Sin avión asignado"}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <NuevaChecklist />
      </section>
    </div>
  );
}
