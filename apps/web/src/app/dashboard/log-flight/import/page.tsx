import { apiFetch } from "@/lib/api";
import { Aircraft, Profile } from "@/types";
import { esAlumno } from "@/lib/licencias";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import LogbookImportClient, { type Importacion } from "@/components/dashboard/LogbookImportClient";
import PageHeader from "@/components/dashboard/PageHeader";

async function getAircraftList() {
  const acRes = await apiFetch("/aircraft");
  if (acRes.status === 401) {
    redirect("/api/auth/logout?redirect=/login?expirada=1");
  }
  const aircraft: Aircraft[] = acRes.ok ? await acRes.json() : [];
  return aircraft;
}

/** Las lecturas en curso o esperando revisión (sin los vuelos: pesan). Si no se pueden leer, ninguna. */
async function getImportaciones(): Promise<Importacion[]> {
  try {
    const res = await apiFetch("/importaciones-libro", { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

async function getImportacion(id: string): Promise<Importacion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await apiFetch(`/importaciones-libro/${id}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export default async function ImportLogbookPage({ searchParams }: { searchParams: Promise<{ importacion?: string }> }) {
  // Importar es traer un libro de papel, y el alumno piloto no lleva libro de vuelo
  // (ver `lib/licencias.ts`): se le ofrece el formulario simple.
  const perfilRes = await apiFetch("/profiles");
  const perfiles: Profile[] = perfilRes.ok ? await perfilRes.json() : [];
  if (esAlumno(perfiles[0]?.license_type)) redirect("/dashboard/log-flight");

  const { importacion: idPedido } = await searchParams;
  const [aircraft, otras, actual] = await Promise.all([getAircraftList(), getImportaciones(), idPedido ? getImportacion(idPedido) : Promise.resolve(null)]);

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full pb-20">
      <Link
        href="/dashboard/log-flight"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Registrar vuelo
      </Link>
      <PageHeader eyebrow="PDF o fotos de las hojas" title="Importar tu libro" />

      <LogbookImportClient aircraftList={aircraft} importacion={actual} pedida={!!idPedido} otras={otras.filter((o) => o.id !== actual?.id)} />
    </div>
  );
}
