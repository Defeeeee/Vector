"use client";

import { useEffect, useState } from "react";
import { EVENTO_CONSENTIMIENTO, PIXEL_META_ID, guardarConsentimiento, leerConsentimiento, type Consentimiento } from "@/lib/pixel-meta";

/**
 * En la política de privacidad: qué elegiste sobre el píxel de Meta, y cambiarlo.
 * La elección vive en este navegador (`lib/pixel-meta.ts`).
 */
export default function CambiarConsentimientoMeta() {
  const [montado, setMontado] = useState(false);
  const [eleccion, setEleccion] = useState<Consentimiento | null>(null);

  useEffect(() => {
    setEleccion(leerConsentimiento(window.localStorage));
    setMontado(true);
  }, []);

  if (!PIXEL_META_ID) return <p>Hoy Vector no tiene el píxel de Meta activado.</p>;
  if (!montado) return null;

  const elegir = (valor: Consentimiento) => {
    guardarConsentimiento(window.localStorage, valor);
    setEleccion(valor);
    window.dispatchEvent(new Event(EVENTO_CONSENTIMIENTO));
  };

  return (
    <div className="not-prose flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 p-4">
      <p className="text-sm text-zinc-700 dark:text-zinc-300 w-full">
        En este navegador:{" "}
        <strong>{eleccion === "si" ? "aceptaste el píxel" : eleccion === "no" ? "no aceptaste el píxel" : "todavía no elegiste"}</strong>.
      </p>
      <button
        type="button"
        onClick={() => elegir("si")}
        disabled={eleccion === "si"}
        className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold disabled:opacity-40"
      >
        Aceptar
      </button>
      <button
        type="button"
        onClick={() => elegir("no")}
        disabled={eleccion === "no"}
        className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 text-sm font-semibold disabled:opacity-40"
      >
        No aceptar
      </button>
    </div>
  );
}
