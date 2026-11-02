"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { aceptarSolicitud, rechazarSolicitud, sacarSeguidor } from "@/actions/social";
import { conArroba } from "@/lib/handle";

/**
 * Los botones de las listas propias: aceptar o rechazar una solicitud, o sacar a un
 * seguidor. Sacar pide confirmación; aceptar y rechazar no, porque son la respuesta a
 * una pregunta que el otro hizo.
 */
export default function AccionSocial({
  tipo,
  handle,
  miHandle,
}: {
  tipo: "solicitud" | "seguidor";
  handle: string;
  miHandle: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const correr = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const boton =
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60";

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-2">
        {pendiente && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
        {tipo === "solicitud" ? (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => aceptarSolicitud(handle, miHandle))}
              className={`${boton} bg-aviation-blue text-white hover:bg-aviation-blue-dark`}
            >
              Aceptar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => rechazarSolicitud(handle, miHandle))}
              className={`${boton} border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5`}
            >
              Rechazar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (window.confirm(`¿Sacar a ${conArroba(handle)} de tus seguidores?`)) {
                correr(() => sacarSeguidor(handle, miHandle));
              }
            }}
            className={`${boton} border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5`}
          >
            Sacar
          </button>
        )}
      </div>
      {error && <p className="text-[12px] font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
