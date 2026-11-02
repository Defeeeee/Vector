"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import PublicacionCard, { type ContextoPublicacion } from "./PublicacionCard";
import { cargarMasPublicaciones } from "@/actions/social";
import type { OrigenPublicaciones } from "@/lib/publicaciones-servidor";
import type { Publicacion } from "@/types";

/**
 * Una lista de publicaciones con "Ver más": la Red, o las de un perfil.
 *
 * La primera página la trae el server con la pantalla; las siguientes, una acción
 * (`cargarMasPublicaciones`), de a quince, con el cursor del backend.
 *
 * Si el server vuelve a dibujar la pantalla —después de publicar, `router.refresh()`—
 * llega otra primera página, y la lista vuelve a arrancar de ella: la publicación nueva
 * tiene que aparecer arriba aunque el piloto ya hubiera cargado más.
 */
export default function ListaPublicaciones({
  inicial,
  siguiente: siguienteInicial,
  origen,
  contexto,
  vacio,
}: {
  inicial: Publicacion[];
  siguiente: string | null;
  origen: OrigenPublicaciones;
  contexto: ContextoPublicacion;
  /** Lo que se muestra si no hay ninguna. */
  vacio?: React.ReactNode;
}) {
  const firma = `${inicial.map((p) => p.id).join(",")}|${siguienteInicial ?? ""}`;
  const [firmaVista, setFirmaVista] = useState(firma);
  const [publicaciones, setPublicaciones] = useState(inicial);
  const [siguiente, setSiguiente] = useState(siguienteInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ajustar el estado cuando cambian las props, sin efecto: el patrón que recomienda
  // React para esto, y el que evita dibujar una vez la lista vieja.
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setPublicaciones(inicial);
    setSiguiente(siguienteInicial);
    setError(null);
  }

  const verMas = async () => {
    if (!siguiente || cargando) return;
    setCargando(true);
    setError(null);
    const r = await cargarMasPublicaciones(origen, siguiente);
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPublicaciones((actuales) => {
      const vistas = new Set(actuales.map((p) => p.id));
      return [...actuales, ...r.publicaciones.filter((p) => !vistas.has(p.id))];
    });
    setSiguiente(r.siguiente);
  };

  if (publicaciones.length === 0) return <>{vacio ?? null}</>;

  return (
    <div className="space-y-4">
      {publicaciones.map((p) => (
        <PublicacionCard key={p.id} publicacion={p} contexto={contexto} />
      ))}
      {siguiente && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => void verMas()}
            disabled={cargando}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
          >
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
            Ver más
          </button>
          {error && <p className="text-[13px] font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
