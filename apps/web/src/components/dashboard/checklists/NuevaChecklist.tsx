"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { crearChecklist } from "@/actions/checklists";
import { campo, principal } from "@/components/dashboard/firmas/comun";

/** "Nueva checklist": se le pone un nombre y se lleva al editor, a pegar el texto. */
export default function NuevaChecklist() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await crearChecklist(nombre);
      if ("error" in r) setError(r.error);
      else router.push(`/dashboard/tools/checklists/${r.id}?editar=1`);
    });
  }

  return (
    <form onSubmit={crear} className="space-y-2 max-w-xl">
      <label htmlFor="nueva-checklist" className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
        Nueva checklist
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="nueva-checklist"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          placeholder="Por ejemplo: Astore, general"
          className={campo}
        />
        <button type="submit" disabled={pendiente || !nombre.trim()} className={`${principal} gap-2 shrink-0`}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {pendiente ? "Creando…" : "Crear"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
