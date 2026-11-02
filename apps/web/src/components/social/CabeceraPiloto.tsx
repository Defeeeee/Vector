import { Lock } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import { conArroba } from "@/lib/handle";
import type { PilotoPublico } from "@/types";

/**
 * Quién es un piloto: foto, nombre, @, licencia, bio y contadores, con sus acciones
 * abajo (seguir, editar, compartir…). La usan el perfil público y el de la app: lo que
 * cambia entre los dos son las acciones, que pone cada página.
 */
export default function CabeceraPiloto({
  piloto,
  acciones,
  nota,
}: {
  piloto: PilotoPublico;
  acciones?: React.ReactNode;
  /** Una línea chica debajo de las acciones. */
  nota?: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <AvatarPiloto nombre={piloto.nombre_visible} avatarUrl={piloto.avatar_url} tamano="lg" />
        <div className="flex-1 min-w-0 space-y-2">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight leading-tight break-words text-zinc-900 dark:text-white">
            {piloto.nombre_visible}
          </h1>
          <p className="flex flex-wrap items-center gap-2 font-mono text-sm text-zinc-500 dark:text-zinc-400">
            <span>{conArroba(piloto.handle)}</span>
            {piloto.licencia && (
              <span className="rounded-full border border-zinc-200 dark:border-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                {piloto.licencia}
              </span>
            )}
            {piloto.visibilidad === "privado" && (
              <span className="inline-flex items-center gap-1 text-[12px]">
                <Lock className="w-3 h-3" /> Privado
              </span>
            )}
          </p>
          {piloto.bio && (
            <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-words">{piloto.bio}</p>
          )}
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="data font-bold text-zinc-900 dark:text-white">{piloto.seguidores}</span>{" "}
            {piloto.seguidores === 1 ? "seguidor" : "seguidores"}
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
            <span className="data font-bold text-zinc-900 dark:text-white">{piloto.siguiendo}</span> siguiendo
          </p>
        </div>
      </div>
      {acciones && <div className="mt-6 flex flex-wrap items-center gap-2">{acciones}</div>}
      {nota && <p className="mt-4 text-[13px] text-zinc-500 dark:text-zinc-400">{nota}</p>}
    </section>
  );
}
