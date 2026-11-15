"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { getGoogleLoginUrl } from "@/actions/auth";
import { CLAVE_VOLVER_TRACKER, volverSeguroTracker } from "@/lib/tracker";

/**
 * "Entrar con Google" del tracker: el mismo flujo de la web (`getGoogleLoginUrl`), que vuelve por
 * `/auth/callback` **de este host** (el backend toma el `Origin`, `WEBS_ACEPTADAS`). Antes de salir
 * deja a dónde volver (una invitación o un vuelo) en el `sessionStorage`.
 */
export default function BotonGoogleTracker({ volver, texto = "Entrar con Google" }: { volver?: string; texto?: string }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar() {
    setPendiente(true);
    setError(null);
    try {
      try {
        const v = volverSeguroTracker(volver);
        if (v) sessionStorage.setItem(CLAVE_VOLVER_TRACKER, v);
        else sessionStorage.removeItem(CLAVE_VOLVER_TRACKER);
      } catch {
        /* sin almacenamiento: entra igual y cae en el inicio */
      }
      const r = await getGoogleLoginUrl();
      if (r.error || !r.url) {
        setError("No se pudo conectar con Google. Probá de nuevo en un rato.");
        setPendiente(false);
        return;
      }
      window.location.href = r.url;
    } catch {
      setError("No se pudo conectar con Google. Probá de nuevo en un rato.");
      setPendiente(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void entrar()}
        disabled={pendiente}
        className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-aviation-cyan px-6 text-lg font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-60"
      >
        {pendiente ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )}
        {texto}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
