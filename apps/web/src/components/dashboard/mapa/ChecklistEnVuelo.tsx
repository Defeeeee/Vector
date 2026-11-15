"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ListChecks, X } from "lucide-react";
import { checklistDelAvion } from "@/actions/checklists";
import UsarChecklist from "@/components/dashboard/checklists/UsarChecklist";

/**
 * La checklist del avión elegido, a mano en la pantalla de vuelo (3.39.0). Abre una hoja de
 * pantalla completa (un portal sobre `body`: lo `fixed` dentro de una página queda atrapado por el
 * `transform` de su animación de entrada).
 *
 * **Sin señal**: la última que se leyó de cada avión queda en el `localStorage` y se usa si el
 * pedido falla. Si el pedido anda y el avión no tiene checklist, no se usa la guardada (la
 * pudieron desasignar).
 */

type Leida = { id: string; nombre: string; texto: string };
const claveCache = (aircraftId: string) => `vector-checklist-avion:${aircraftId}`;

function deLaCache(aircraftId: string): Leida | null {
  try {
    const c = JSON.parse(window.localStorage.getItem(claveCache(aircraftId)) ?? "null") as Leida | null;
    return c && typeof c.id === "string" && typeof c.texto === "string" ? c : null;
  } catch {
    return null;
  }
}

function aLaCache(aircraftId: string, c: Leida | null) {
  try {
    if (c) window.localStorage.setItem(claveCache(aircraftId), JSON.stringify(c));
    else window.localStorage.removeItem(claveCache(aircraftId));
  } catch {
    /* sin almacenamiento, no hay copia sin señal */
  }
}

export default function ChecklistEnVuelo({ aircraftId }: { aircraftId: string | null }) {
  const [estado, setEstado] = useState<"leyendo" | "sin" | { checklist: Leida; sinSenal: boolean }>("leyendo");
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!aircraftId) {
      setEstado("sin");
      return;
    }
    let vivo = true;
    setEstado("leyendo");
    checklistDelAvion(aircraftId)
      .then((c) => {
        if (!vivo) return;
        aLaCache(aircraftId, c);
        setEstado(c ? { checklist: c, sinSenal: false } : "sin");
      })
      .catch(() => {
        if (!vivo) return;
        const guardada = deLaCache(aircraftId);
        setEstado(guardada ? { checklist: guardada, sinSenal: true } : "sin");
      });
    return () => {
      vivo = false;
    };
  }, [aircraftId]);

  // Mientras se lee, el botón ya está: no se parpadea entre "asigná" y "checklist".
  if (estado === "sin") {
    return (
      <Link href="/dashboard/tools/checklists" className="flex items-center justify-between gap-2 min-h-12 px-4 rounded-2xl border border-white/10 text-sm font-semibold text-aviation-cyan">
        <span className="inline-flex items-center gap-2"><ListChecks className="w-4 h-4" /> Asigná una checklist a tu avión</span>
      </Link>
    );
  }
  if (estado === "leyendo") {
    return <div className="min-h-12 px-4 rounded-2xl border border-white/10 flex items-center text-sm text-zinc-500">Checklist del avión…</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="w-full min-h-12 px-4 rounded-2xl bg-aviation-cyan text-noche text-sm font-bold inline-flex items-center justify-center gap-2"
      >
        <ListChecks className="w-4 h-4" /> Checklist del avión
      </button>
      {abierta &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={estado.checklist.nombre} className="fixed inset-0 z-[3000] bg-noche flex flex-col pt-[env(safe-area-inset-top)]">
            <div className="flex items-center gap-3 px-4 min-h-14 border-b border-white/10 shrink-0">
              <p className="flex-1 min-w-0 truncate font-display font-bold text-lg text-white">{estado.checklist.nombre}</p>
              {estado.sinSenal && <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-400 shrink-0">Copia guardada</span>}
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
              <UsarChecklist id={estado.checklist.id} texto={estado.checklist.texto} pegajoso />
            </div>
            <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-noche">
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="w-full min-h-14 rounded-full bg-aviation-cyan text-noche text-base font-bold inline-flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" /> Cerrar
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
