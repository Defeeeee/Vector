import { apiFetch } from "@/lib/api";
import { Aircraft, Profile } from "@/types";
import { esAlumno } from "@/lib/licencias";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import LogbookImportClient from "@/components/dashboard/LogbookImportClient";

async function getAircraftList() {
  const acRes = await apiFetch("/aircraft");
  if (acRes.status === 401) {
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  const aircraft: Aircraft[] = acRes.ok ? await acRes.json() : [];
  return aircraft;
}

export default async function ImportLogbookPage() {
  // Importar es traer un libro de papel, y el alumno piloto no lleva libro de vuelo
  // (ver `lib/licencias.ts`): se le ofrece el formulario simple.
  const perfilRes = await apiFetch("/profiles");
  const perfiles: Profile[] = perfilRes.ok ? await perfilRes.json() : [];
  if (esAlumno(perfiles[0]?.license_type)) redirect("/dashboard/log-flight");

  const aircraft = await getAircraftList();

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full max-w-6xl mx-auto pb-20 px-4 pt-4 md:pt-8">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2 md:space-y-4">
          <div className="flex items-center space-x-3 md:space-x-4">
            <Link 
              href="/dashboard/log-flight" 
              className="p-2 md:p-3 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors group bg-white dark:bg-[#111111] shadow-sm border border-zinc-200 dark:border-white/10 md:border-transparent md:bg-transparent md:shadow-none"
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
            </Link>
            <h2 className="text-4xl md:text-6xl font-display font-bold tracking-tighter text-zinc-900 dark:text-white leading-none">
              Importar tu libro
            </h2>
          </div>
          <p className="eyebrow ml-14 md:ml-16">
            PDF o fotos de las hojas
          </p>
        </div>
      </div>

      {/* Main Interactive Client Interface */}
      <LogbookImportClient aircraftList={aircraft} />

    </div>
  );
}
