"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rutaDeInvitacionPegada } from "@/lib/tracker-instalar";

/**
 * "¿Te mandaron un link de invitación? Pegalo acá". Al instalar la app, el link que abriste en el
 * navegador no viaja con ella (en iPhone, sobre todo): esto lleva a la invitación sin volver a buscarla.
 * Sólo acepta una invitación de este mismo sitio (`rutaDeInvitacionPegada`): ninguna redirección abierta.
 */
export default function PegarInvitacion() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState(false);

  function ir(e: React.FormEvent) {
    e.preventDefault();
    const ruta = rutaDeInvitacionPegada(texto);
    if (!ruta) {
      setError(true);
      return;
    }
    router.push(ruta);
  }

  return (
    <form onSubmit={ir} className="space-y-2 border-t border-white/10 pt-5">
      <label htmlFor="pegar-invitacion" className="block text-base font-semibold text-white/80">
        ¿Te mandaron un link de invitación? Pegalo acá
      </label>
      <div className="flex gap-2">
        <input
          id="pegar-invitacion"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(false);
          }}
          placeholder="https://tracker.vectoraero.ar/invitacion/…"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-transparent px-3 text-base text-white placeholder:text-white/35 focus:border-aviation-cyan focus:outline-none"
        />
        <button type="submit" className="min-h-12 shrink-0 rounded-full border border-white/25 px-5 text-base font-bold text-white hover:bg-white/10">
          Abrir
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          Ese no es un link de invitación de Vector Tracker.
        </p>
      )}
    </form>
  );
}
