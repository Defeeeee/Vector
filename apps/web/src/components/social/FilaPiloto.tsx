import Link from "next/link";
import { Lock } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import { conArroba, rutaPerfilApp } from "@/lib/handle";
import type { PilotoResumen } from "@/types";

/**
 * Un piloto en una lista: la búsqueda, a quién seguís, tus seguidores, tus solicitudes,
 * los sugeridos.
 *
 * Sin hooks a propósito, para que la usen tanto las páginas del server como el
 * buscador, que es cliente. La acción de la derecha la pone quien la dibuja. Todas las
 * listas viven adentro del dashboard, así que el link es al perfil adentro de la app.
 */
export default function FilaPiloto({ piloto, accion }: { piloto: PilotoResumen; accion?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Link href={rutaPerfilApp(piloto.handle)} className="group flex items-center gap-3 min-w-0 flex-1">
        <AvatarPiloto nombre={piloto.nombre_visible} avatarUrl={piloto.avatar_url} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:underline underline-offset-2">
            {piloto.nombre_visible}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
            <span className="truncate">{conArroba(piloto.handle)}</span>
            {piloto.licencia && <span className="shrink-0">· {piloto.licencia}</span>}
            {piloto.visibilidad === "privado" && <Lock className="w-3 h-3 shrink-0" aria-label="Perfil privado" />}
          </p>
        </div>
      </Link>
      {accion}
    </div>
  );
}
