"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { useAvisos } from "@/components/dashboard/Avisos";
import { relacionConPiloto, seguirPiloto } from "@/actions/social";
import { conArroba } from "@/lib/handle";
import { CLAVE_INVITACION, leerInvitacion } from "@/lib/invitacion";

/**
 * "Llegaste por el perfil de @fulano: ¿lo seguís?", en la Red, para quien se sumó a
 * Vector desde un link (`RecordarInvitacion`). Se lee del navegador al montar, así que
 * el server no se entera ni lo dibuja: aparece un instante después, y sólo acá.
 *
 * Seguir o "Ahora no" lo borran: se ofrece una vez. Antes de ofrecerlo se pregunta la
 * relación: si ya lo seguís, se lo pediste o no existe más, se borra sin mostrar nada.
 */
export default function InvitacionPendiente({ miHandle }: { miHandle: string }) {
  const [handle, setHandle] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const { notificar } = useAvisos();
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    let invito: string | null = null;
    try {
      invito = leerInvitacion(localStorage.getItem(CLAVE_INVITACION), Date.now(), miHandle);
    } catch {
      invito = null;
    }
    if (!invito) return;
    void relacionConPiloto(invito).then((relacion) => {
      if (cancelado) return;
      if (relacion === "ninguna") {
        setHandle(invito);
        return;
      }
      // Ya lo sigue, se lo pidió, lo bloqueó, o no está: no hay nada que ofrecer. Si no
      // se pudo preguntar (`null`), queda guardado para la próxima.
      if (relacion !== null) {
        try {
          localStorage.removeItem(CLAVE_INVITACION);
        } catch {
          // Sin almacenamiento, nada que borrar.
        }
      }
    });
    return () => {
      cancelado = true;
    };
  }, [miHandle]);

  if (!handle) return null;

  const olvidar = () => {
    try {
      localStorage.removeItem(CLAVE_INVITACION);
    } catch {
      // Nada que hacer: sin almacenamiento, tampoco va a volver a aparecer.
    }
    setHandle(null);
  };

  const seguir = () => {
    startTransition(async () => {
      const r = await seguirPiloto(handle);
      olvidar();
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      notificar({
        tipo: "exito",
        titulo: r.relacion === "pendiente" ? `Le pediste seguir a ${conArroba(handle)}` : `Ahora seguís a ${conArroba(handle)}`,
      });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-[2rem] border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.06] dark:bg-aviation-cyan/[0.06] p-5">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-aviation-blue dark:bg-aviation-cyan text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
          <UserPlus className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            Llegaste por el perfil de <span className="font-mono">{conArroba(handle)}</span>
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">¿Lo seguís? Vas a ver lo que publica acá, en tu Red.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={seguir}
          disabled={pendiente}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-aviation-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-aviation-blue-dark transition-colors disabled:opacity-60"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />}
          Seguir
        </button>
        <button
          type="button"
          onClick={olvidar}
          className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
          Ahora no
        </button>
      </div>
    </div>
  );
}
