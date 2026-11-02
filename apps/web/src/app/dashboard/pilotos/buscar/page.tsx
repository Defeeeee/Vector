import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import BuscadorPilotos from "@/components/social/BuscadorPilotos";
import FilaPiloto from "@/components/social/FilaPiloto";
import BotonSeguir from "@/components/social/BotonSeguir";
import AccionSocial from "@/components/social/AccionSocial";
import AvatarPiloto from "@/components/social/AvatarPiloto";
import CompartirPerfil from "@/components/social/CompartirPerfil";
import CrearHandleRapido from "@/components/social/CrearHandleRapido";
import { conArroba, rutaPerfil, rutaPerfilApp } from "@/lib/handle";
import { leerMiPerfilPublico } from "@/lib/publicaciones-servidor";
import { leerDatosParaElHandle, leerResumenSocial } from "@/lib/resumen-social";
import type { PilotoResumen } from "@/types";

export const metadata = { title: "Buscar pilotos | Vector" };

/**
 * Buscar pilotos, a quién seguís y quién te sigue.
 *
 * Buscar anda aunque todavía no tengas @ —encontrar a alguien no le cuenta nada de
 * vos—, pero para seguir hace falta: el otro tiene que poder ver quién es. Por eso sin
 * @ arriba está `CrearHandleRapido`, y no un link al Hangar.
 */
async function lista(ruta: string): Promise<PilotoResumen[]> {
  const res = await apiFetch(ruta, { cache: "no-store" });
  return res.ok ? ((await res.json()) as PilotoResumen[]) : [];
}

export default async function BuscarPilotosPage() {
  const resumen = await leerResumenSocial();
  const handle = resumen.handle;

  const [siguiendo, seguidores, datos, perfil] = await Promise.all([
    handle ? lista("/social/siguiendo") : Promise.resolve([]),
    handle ? lista("/social/seguidores") : Promise.resolve([]),
    handle || !resumen.disponible ? Promise.resolve(null) : leerDatosParaElHandle(),
    handle ? leerMiPerfilPublico() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8 md:space-y-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader eyebrow="La red de pilotos de Vector" title="Buscar" />

      {handle ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
          <Link href={rutaPerfilApp(handle)} className="group flex items-center gap-3 flex-1 min-w-0">
            <AvatarPiloto nombre={perfil?.nombre_visible ?? handle} avatarUrl={resumen.avatar_url} />
            <div className="min-w-0">
              <p className="eyebrow">Tu perfil</p>
              <p className="font-mono text-lg font-semibold text-zinc-900 dark:text-white group-hover:underline underline-offset-2 truncate">
                {conArroba(handle)}
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <CompartirPerfil handle={handle} compacto />
            <Link
              href={`${rutaPerfil(handle)}?vista=publica`}
              className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Cómo te ven
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        datos && (
          <div id="crear-handle" className="scroll-mt-24">
            <CrearHandleRapido nombreSugerido={datos.nombre} licenciaSugerida={datos.licencia} />
          </div>
        )
      )}

      <BuscadorPilotos tieneHandle={!!handle} />

      {handle && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Lista titulo="Siguiendo" vacio="Todavía no seguís a nadie. Buscá a alguien arriba.">
            {siguiendo.map((p) => (
              <FilaPiloto
                key={p.handle}
                piloto={p}
                accion={
                  <BotonSeguir handle={p.handle} relacion={p.relacion} visibilidad={p.visibilidad} tieneHandle compacto />
                }
              />
            ))}
          </Lista>
          <Lista titulo="Seguidores" vacio="Nadie te sigue todavía. Compartí tu perfil para empezar.">
            {seguidores.map((p) => (
              <FilaPiloto key={p.handle} piloto={p} accion={<AccionSocial tipo="seguidor" handle={p.handle} miHandle={handle} />} />
            ))}
          </Lista>
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">{titulo}</h3>
        <span className="data text-sm font-bold text-zinc-400 dark:text-zinc-500">{children.length}</span>
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 py-3">{vacio}</p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-white/10">{children}</div>
      )}
    </section>
  );
}
