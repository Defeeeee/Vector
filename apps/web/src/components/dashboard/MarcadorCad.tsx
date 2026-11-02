"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Compass, Star } from "lucide-react";

/** Lo deja "Pasar al CAD" (`ConElCad`) cuando el marcador ya conectó una vez. */
export const CLAVE_MARCADOR_USADO = "vector-cad-marcador";

/**
 * El marcador "Vector → CAD" para arrastrar a la barra de favoritos: un `javascript:` que,
 * tocado en la pestaña del CAD, carga `/cad/puente.js` de Vector (`src/cad/enlace.ts`), que abre "Pasar al CAD" y le hace de
 * puente.
 *
 * El `href` se pone después de montar: React bloquea los `javascript:` en las props, y así
 * además sale con el origen real (el de producción, o el local cuando se prueba).
 */
function Marcador() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const codigo = `javascript:(function(){var s=document.createElement('script');s.src='${window.location.origin}/cad/puente.js?t='+Date.now();document.body.appendChild(s);})();`;
    ref.current?.setAttribute("href", codigo);
  }, []);
  return (
    <a
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        alert('Arrastrá este botón a la barra de favoritos. Después, tocalo en la pestaña del CAD, adentro de "Registro horas vuelo".');
      }}
      className="inline-flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold cursor-grab active:cursor-grabbing select-none shadow-lg shadow-zinc-900/20 dark:shadow-none ring-4 ring-aviation-blue/15 dark:ring-aviation-cyan/20"
      title="Arrastrame a la barra de favoritos"
    >
      <span className="grid place-items-center w-6 h-6 rounded-full bg-white dark:bg-zinc-900">
        <Compass className="w-3.5 h-3.5 text-zinc-900 dark:text-white" aria-hidden="true" />
      </span>
      Vector → CAD
    </a>
  );
}

/**
 * El paso 1 de "Pasar al CAD": una barra de favoritos dibujada, con el lugar donde soltar el
 * marcador. Una vez que se usó (lo anota `ConElCad`), se achica a una línea.
 */
export default function PasoMarcador() {
  const [usado, setUsado] = useState(false);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    try {
      setUsado(localStorage.getItem(CLAVE_MARCADOR_USADO) === "1");
    } catch {
      /* sin almacenamiento, se muestra entero */
    }
  }, []);

  if (usado && !ver) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
          <Check className="w-4 h-4" aria-hidden="true" /> Ya tenés el marcador
        </span>
        <button type="button" onClick={() => setVer(true)} className="text-zinc-500 dark:text-zinc-400 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">
          Mostrarlo de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* La barra del navegador, dibujada: dónde va a quedar el marcador. */}
      <div aria-hidden="true" className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100/80 dark:bg-white/[0.04] overflow-hidden max-w-xl">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="flex gap-1">
            <i className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-white/15" />
            <i className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-white/15" />
            <i className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-white/15" />
          </span>
          <span className="flex-1 rounded-full bg-white dark:bg-white/5 px-3 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 data truncate">cad.anac.gob.ar</span>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span className="inline-flex items-center gap-1 shrink-0">
            <Star className="w-3 h-3" /> Favoritos
          </span>
          <span className="hidden sm:inline-block h-3 w-12 rounded bg-zinc-200 dark:bg-white/10" />
          <span className="flex-1 sm:flex-none rounded-full border-2 border-dashed border-aviation-blue/50 dark:border-aviation-cyan/50 px-3 py-1 text-center font-semibold text-aviation-blue dark:text-aviation-cyan">
            Soltalo acá
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Marcador />
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
          Arrastralo con el mouse a tu barra de favoritos. Si no la ves: Ctrl+Shift+B (⌘+Shift+B en Mac).
        </p>
      </div>
      <p className="md:hidden text-xs text-amber-700 dark:text-amber-400">El marcador funciona en la computadora: abrí esta pantalla desde ahí.</p>
    </div>
  );
}
