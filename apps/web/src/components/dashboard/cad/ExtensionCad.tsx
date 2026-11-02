"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bookmark, Check, Download } from "lucide-react";
import PasoMarcador from "@/components/dashboard/MarcadorCad";
import { estadoExtension, VERSION_EXTENSION } from "@/lib/extension-cad";

/**
 * El paso 1 de "Pasar al CAD": la extensión "Vector → CAD" (`extension/`, 2026-10-29), o el
 * marcador para quien no la quiera. Desde la 2.36.0 las dos son un puente: conectan la pestaña
 * del CAD con esta pantalla, y el panel está acá (`ConElCad`).
 *
 * Instalada, la extensión deja `data-vector-cad-extension` en `<html>` (`extension/vector.js`).
 * Se lee después de montar: el server no lo sabe.
 *
 * Todavía no está en la Chrome Web Store: se carga descomprimida, en modo de desarrollador.
 */
export default function PasoExtension() {
  const [instalada, setInstalada] = useState<string | null>(null);
  const [marcador, setMarcador] = useState(false);
  useEffect(() => {
    setInstalada(document.documentElement.dataset.vectorCadExtension ?? null);
  }, []);

  const estado = estadoExtension(instalada);
  if (estado === "sin-puente" || estado === "vieja") return <ExtensionVieja instalada={instalada!} />;

  if (instalada) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <Check className="w-4 h-4" aria-hidden="true" /> Ya tenés la extensión de Vector
      </p>
    );
  }

  if (marcador) {
    return (
      <div className="space-y-4">
        <PasoMarcador />
        <button onClick={() => setMarcador(false)} className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          Mejor la extensión
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
        La extensión conecta tu pestaña del CAD con Vector: con el CAD abierto, pasás tus vuelos desde esta pantalla. Se cargan desde tu sesión del CAD,
        en tu navegador: Vector nunca ve tu contraseña y la extensión no pide ningún permiso. Anda en Chrome, Edge y Brave, en la compu.
      </p>
      <a
        href="/cad/vector-cad.zip"
        download
        className="inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold"
      >
        <Download className="w-4 h-4" aria-hidden="true" /> Bajar la extensión
      </a>
      <ol className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed list-decimal pl-5 max-w-prose">
        <li>Descomprimí el archivo: queda una carpeta <span className="font-mono text-[13px]">vector-cad</span>.</li>
        <li>
          Abrí <span className="font-mono text-[13px]">chrome://extensions</span> y prendé el <b className="font-semibold text-zinc-900 dark:text-white">Modo de desarrollador</b>, arriba a la derecha.
        </li>
        <li>
          Tocá <b className="font-semibold text-zinc-900 dark:text-white">Cargar descomprimida</b> y elegí la carpeta. Después recargá esta página.
        </li>
      </ol>
      <button
        onClick={() => setMarcador(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
      >
        <Bookmark className="w-4 h-4" aria-hidden="true" /> Prefiero el marcador
      </button>
    </div>
  );
}

/**
 * Hay una versión nueva de la extensión: una cargada descomprimida no se actualiza sola. Se
 * baja y se reemplaza la carpeta; "Recargar" en `chrome://extensions` la toma.
 */
export function ExtensionVieja({ instalada }: { instalada: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/[0.07] px-4 py-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        Tenés la extensión {instalada} y hay una nueva, la {VERSION_EXTENSION}.
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
        Bajala y descomprimila en la misma carpeta de antes, reemplazando los archivos. Después, en{" "}
        <span className="font-mono text-[13px]">chrome://extensions</span>, tocá <b className="font-semibold text-zinc-900 dark:text-white">Recargar</b>{" "}
        en &quot;Vector → CAD&quot; y recargá esta página.
      </p>
      <a
        href="/cad/vector-cad.zip"
        download
        className="inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold"
      >
        <Download className="w-4 h-4" aria-hidden="true" /> Bajar la {VERSION_EXTENSION}
      </a>
    </div>
  );
}
