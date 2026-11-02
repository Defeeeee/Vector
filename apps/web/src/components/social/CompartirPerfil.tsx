"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { conArroba, urlPerfil } from "@/lib/handle";

/**
 * Compartir el perfil: el menú nativo del teléfono si existe (WhatsApp está ahí), y si
 * no, copiar el link. La vista previa que ve el que lo recibe la arma
 * `/u/[handle]/opengraph-image`, con lo que vería un anónimo.
 *
 * Con `texto` y `etiqueta` es "Invitar": el mismo link, con un mensaje para sumarse.
 */
export default function CompartirPerfil({
  handle,
  compacto = false,
  texto,
  etiqueta = "Compartir perfil",
}: {
  handle: string;
  compacto?: boolean;
  /** El mensaje que acompaña al link en el menú de compartir. */
  texto?: string;
  etiqueta?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const compartir = async () => {
    const url = urlPerfil(handle, window.location.origin);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${conArroba(handle)} en Vector`, ...(texto ? { text: texto } : {}), url });
        return;
      } catch (e) {
        // Cerrar el menú sin elegir nada tira `AbortError`: no es un error, y
        // tampoco es motivo para copiar el link por detrás.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copiá el link de tu perfil:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={compartir}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors ${
        compacto ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-sm"
      }`}
    >
      {copiado ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
      {copiado ? "Link copiado" : etiqueta}
    </button>
  );
}
