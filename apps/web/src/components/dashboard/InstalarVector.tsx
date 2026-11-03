"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/** El evento de Chrome en Android para instalar; Safari no lo tiene. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

const CLAVE = "vector_instalar_cerrado";

/**
 * "Instalá Vector en tu inicio" (3.4.0): arriba del inicio, sólo en el teléfono y sólo en el
 * navegador (`app:hidden`: instalada no tiene sentido). En Android, "Cómo" abre el diálogo de
 * Chrome; en el iPhone, Safari no deja hacerlo desde la página, así que explica los dos toques.
 *
 * Arranca escondido y aparece después de montar: si lo cerraste, lo dice el `localStorage`, que
 * el server no ve. Cerrarlo es por navegador, una comodidad; si el almacenamiento falla, vuelve.
 */
export default function InstalarVector() {
  const [visible, setVisible] = useState(false);
  const [explicando, setExplicando] = useState(false);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    let cerrado = false;
    try {
      cerrado = localStorage.getItem(CLAVE) === "1";
    } catch {}
    if (!cerrado) setVisible(true);
    const guardar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", guardar);
    return () => window.removeEventListener("beforeinstallprompt", guardar);
  }, []);

  if (!visible) return null;

  const cerrar = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE, "1");
    } catch {}
  };

  const como = async () => {
    if (evento) {
      await evento.prompt();
      setEvento(null);
      return;
    }
    setExplicando((v) => !v);
  };

  return (
    <section className="lg:hidden app:hidden rounded-2xl border border-blue-200 dark:border-aviation-blue/30 bg-blue-50 dark:bg-aviation-blue/10 py-3 pl-3.5 pr-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-blue-950 dark:text-white">Instalá Vector en tu inicio</p>
          <p className="text-[12.5px] leading-snug text-blue-800 dark:text-blue-200">Pantalla completa, sin las barras del navegador.</p>
        </div>
        <button
          type="button"
          onClick={como}
          className="shrink-0 px-3.5 py-2.5 rounded-xl bg-aviation-blue text-white text-[13px] font-extrabold active:scale-95 transition-transform"
        >
          Cómo
        </button>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="shrink-0 w-8 h-8 flex items-center justify-center text-blue-800 dark:text-blue-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {explicando && (
        <p className="mt-2 pr-2 text-[12.5px] leading-snug text-blue-900 dark:text-blue-100">
          En el iPhone, desde Safari: tocá Compartir y después “Agregar a inicio”. En Android, desde Chrome: el menú ⋮ y
          “Instalar app” o “Agregar a la pantalla principal”.
        </p>
      )}
    </section>
  );
}
