"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import FilaPiloto from "./FilaPiloto";
import { useAvisos } from "@/components/dashboard/Avisos";
import { desbloquearPiloto } from "@/actions/social";
import { conArroba } from "@/lib/handle";
import type { PilotoResumen } from "@/types";

/**
 * A quiénes bloqueaste, en el Hangar: para desbloquear a alguien sin tener que acordarse
 * de su @ ni buscar su perfil. Si no bloqueaste a nadie, no se dibuja.
 */
export default function ListaBloqueados({ bloqueados }: { bloqueados: PilotoResumen[] }) {
  const [lista, setLista] = useState(bloqueados);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { notificar } = useAvisos();

  if (lista.length === 0) return null;

  const desbloquear = (handle: string) => {
    setTrabajando(handle);
    startTransition(async () => {
      const r = await desbloquearPiloto(handle);
      setTrabajando(null);
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      setLista((l) => l.filter((p) => p.handle !== handle));
      notificar({ tipo: "exito", titulo: `Desbloqueaste a ${conArroba(handle)}` });
    });
  };

  return (
    <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 md:p-6">
      <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Bloqueados</h4>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        No ven tu perfil ni lo que publicás, y vos no ves lo suyo. No saben que los bloqueaste.
      </p>
      <div className="mt-1 divide-y divide-zinc-100 dark:divide-white/5">
        {lista.map((p) => (
          <FilaPiloto
            key={p.handle}
            piloto={p}
            accion={
              <button
                type="button"
                onClick={() => desbloquear(p.handle)}
                disabled={trabajando === p.handle}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 px-3.5 py-2 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
              >
                {trabajando === p.handle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Desbloquear
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}
