import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import ChecklistPantalla from "@/components/dashboard/checklists/ChecklistPantalla";
import type { Aircraft } from "@/types";

export const metadata = { title: "Checklist | Vector" };

/** Una checklist: por defecto se usa; «Editar» pasa al editor. Sin cache, se edita desde acá. */
const FRESCO = { cache: "no-store" } as const;

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editar?: string }>;
}) {
  const { id } = await params;
  const { editar } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [res, avionesRes] = await Promise.all([apiFetch(`/checklists/${id}`, FRESCO), apiFetch("/aircraft", FRESCO)]);
  if (res.status === 401 || avionesRes.status === 401) redirect("/api/auth/logout?redirect=/login?expirada=1");
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("No se pudo leer la checklist.");
  const checklist = (await res.json()) as { id: string; nombre: string; texto: string };
  const aviones: Aircraft[] = avionesRes.ok ? await avionesRes.json().catch(() => []) : [];

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="space-y-4">
        <Link href="/dashboard/tools/checklists" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Checklists
        </Link>
        <PageHeader eyebrow="Checklist" title={checklist.nombre} />
      </div>
      <ChecklistPantalla
        checklist={checklist}
        aviones={aviones.filter((a) => !a.is_simulator).map((a) => ({ id: a.id, registration: a.registration, type: a.type, checklist_id: a.checklist_id ?? null }))}
        editarAlEntrar={editar === "1"}
      />
    </div>
  );
}
