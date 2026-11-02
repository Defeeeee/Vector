"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, PartyPopper, UserPlus, UserRoundCheck } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import { marcarActividadVista } from "@/actions/social";
import { rutaPerfilApp } from "@/lib/handle";
import type { EventoActividad } from "@/types";

const claveDe = (e: EventoActividad) => `${e.tipo}|${e.piloto.handle}|${e.created_at}`;

const ICONO = {
  seguidor: UserRoundCheck,
  solicitud: UserPlus,
  aplauso: PartyPopper,
  comentario: MessageCircle,
} as const;

/**
 * La actividad del piloto: quién lo empezó a seguir, quién le pidió, y quién aplaudió o
 * comentó lo suyo. Lo nuevo —posterior a la última vez que la abrió— va resaltado.
 *
 * Al montarse la marca como vista (`marcarActividadVista`), lo que apaga el punto rojo.
 * **Lo resaltado se congela al abrir**: marcar como vista hace que el server vuelva a
 * dibujar la pantalla con todo en `nuevo: false`, y sin esto el resaltado se borraría
 * en el mismo instante en que aparece.
 */
export default function ListaActividad({
  eventos,
  marcarVista,
  miHandle,
}: {
  eventos: EventoActividad[];
  /** Si hay algo que apagar: sin novedades no hace falta escribir nada. */
  marcarVista: boolean;
  miHandle: string;
}) {
  const [nuevos] = useState(() => new Set(eventos.filter((e) => e.nuevo).map(claveDe)));

  useEffect(() => {
    if (marcarVista) void marcarActividadVista();
  }, [marcarVista]);

  if (eventos.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 py-2">
        Todavía no hay actividad. Cuando alguien te siga, o aplauda o comente lo que publicás, lo vas a ver acá.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-white/10">
      {eventos.map((e) => {
        const nuevo = nuevos.has(claveDe(e));
        const Icono = ICONO[e.tipo];
        return (
          <li key={claveDe(e)} className="relative flex items-start gap-3 py-3.5">
            {nuevo && (
              <span
                aria-hidden="true"
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500"
              />
            )}
            <Link href={rutaPerfilApp(e.piloto.handle)} className="relative shrink-0">
              <AvatarPiloto nombre={e.piloto.nombre_visible} avatarUrl={e.piloto.avatar_url} tamano="sm" />
              <span className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center">
                <Icono className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${nuevo ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-300"}`}>
                {nuevo && <span className="sr-only">Nuevo: </span>}
                <Link
                  href={rutaPerfilApp(e.piloto.handle)}
                  className="font-semibold text-zinc-900 dark:text-white hover:underline underline-offset-2"
                >
                  {e.piloto.nombre_visible}
                </Link>{" "}
                {e.tipo === "seguidor" && "empezó a seguirte."}
                {e.tipo === "solicitud" && "te pidió seguirte."}
                {e.tipo === "aplauso" && "aplaudió tu publicación."}
                {e.tipo === "comentario" && "comentó tu publicación:"}
              </p>
              {e.texto && (e.tipo === "comentario" || e.tipo === "aplauso") && (
                <Link
                  href={rutaPerfilApp(miHandle)}
                  className="mt-1 block text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-2 break-words hover:text-zinc-900 dark:hover:text-white"
                >
                  “{e.texto}”
                </Link>
              )}
              <p className="mt-0.5 text-[12px] text-zinc-400" title={e.fecha_titulo}>
                {e.fecha_texto}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
