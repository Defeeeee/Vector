"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check, Clock, Loader2, UserPlus } from "lucide-react";
import { dejarDeSeguirPiloto, desbloquearPiloto, seguirPiloto } from "@/actions/social";
import { conArroba } from "@/lib/handle";
import type { RelacionSocial, Visibilidad } from "@/types";

/**
 * Seguir, pedir para seguir, cancelar la solicitud o dejar de seguir.
 *
 * Lo que dice el botón depende de la privacidad del otro: a un perfil público se lo
 * sigue directo ("Seguir"); a uno privado se le pide ("Pedir para seguir"), porque
 * hasta que acepte no vas a ver nada nuevo y el botón no puede prometer lo contrario.
 *
 * Dejar de seguir pide confirmación y cancelar una solicitud no: lo primero puede
 * costar volver a pedir permiso; lo segundo, no.
 *
 * A alguien que bloqueaste no se lo sigue: el botón es para desbloquearlo, y seguirlo
 * después es otro paso (desbloquear no devuelve los seguimientos).
 */
export default function BotonSeguir({
  handle,
  relacion: relacionInicial,
  visibilidad,
  tieneHandle,
  compacto = false,
}: {
  handle: string;
  relacion: RelacionSocial;
  visibilidad: Visibilidad;
  /** Si el que mira ya tiene su @. Sin @ no se puede seguir: el otro no sabría quién es. */
  tieneHandle: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [relacion, setRelacion] = useState(relacionInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const tamano = compacto ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-sm";
  const base = `inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:opacity-60 ${tamano}`;

  if (relacion === "propio") return null;

  if (relacion === "anonimo") {
    return (
      <Link href="/register" className={`${base} bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200`}>
        <UserPlus className="w-4 h-4" />
        Creá tu cuenta para seguir
      </Link>
    );
  }

  if (!tieneHandle) {
    // A la Red, que lo crea en el lugar (`CrearHandleRapido`), y no al Hangar.
    return (
      <Link
        href="/dashboard/pilotos#crear-handle"
        className={`${base} border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5`}
      >
        Creá tu @ para seguir
      </Link>
    );
  }

  const alTocar = () => {
    if (relacion === "siguiendo" && !window.confirm(`¿Dejar de seguir a ${conArroba(handle)}?`)) return;
    setError(null);
    startTransition(async () => {
      const r =
        relacion === "bloqueado"
          ? await desbloquearPiloto(handle)
          : relacion === "ninguna"
            ? await seguirPiloto(handle)
            : await dejarDeSeguirPiloto(handle);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRelacion(r.relacion);
      // Los contadores y, si ahora lo seguís, sus horas: los arma el server.
      router.refresh();
    });
  };

  const { texto, icono, estilo, titulo } =
    relacion === "bloqueado"
      ? {
          texto: "Desbloquear",
          icono: <Ban className="w-4 h-4" />,
          estilo: "border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5",
          titulo: `Bloqueaste a ${conArroba(handle)}`,
        }
      : relacion === "siguiendo"
      ? {
          texto: "Siguiendo",
          icono: <Check className="w-4 h-4" />,
          estilo: "border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5",
          titulo: "Dejar de seguir",
        }
      : relacion === "pendiente"
        ? {
            texto: "Solicitud enviada",
            icono: <Clock className="w-4 h-4" />,
            estilo: "border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5",
            titulo: "Cancelar la solicitud",
          }
        : {
            texto: visibilidad === "publico" ? "Seguir" : "Pedir para seguir",
            icono: <UserPlus className="w-4 h-4" />,
            estilo: "bg-aviation-blue text-white hover:bg-aviation-blue-dark",
            titulo: undefined,
          };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={alTocar} disabled={pendiente} title={titulo} className={`${base} ${estilo}`}>
        {pendiente ? <Loader2 className="w-4 h-4 animate-spin" /> : icono}
        {texto}
      </button>
      {error && <p className="text-[12px] font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
