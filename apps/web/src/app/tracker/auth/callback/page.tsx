"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { setSession } from "@/actions/auth";
import { CLAVE_VOLVER_TRACKER, volverSeguroTracker } from "@/lib/tracker";

/**
 * La vuelta de Google en el tracker (`/auth/callback` de este host, reescrita por `src/proxy.ts`): Supabase
 * redirige acá con el token en el hash (o en la query), se arma la sesión —la misma cookie `.vectoraero.ar` que
 * la web— y se va al inicio del tracker, o a la invitación/vuelo que se estaba abriendo. **Nunca al
 * dashboard**: quien entra acá no es piloto. Sin `console.log` de la URL (lleva el token).
 */
export default function CallbackTracker() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    async function entrar() {
      try {
        const query = new URLSearchParams(window.location.search);
        let accessToken = query.get("access_token");
        let refreshToken = query.get("refresh_token");
        if (!accessToken && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
        }
        if (accessToken) {
          try {
            await setSession(accessToken, refreshToken || undefined);
          } catch {
            // Si falla, el proxy manda a /ingresar al abrir el inicio: no hay nada mejor que hacer acá.
          }
          // Un respiro para que la cookie quede escrita antes de navegar.
          espera = setTimeout(() => {
            let destino = "/";
            try {
              destino = volverSeguroTracker(sessionStorage.getItem(CLAVE_VOLVER_TRACKER)) ?? destino;
              sessionStorage.removeItem(CLAVE_VOLVER_TRACKER);
            } catch {}
            window.location.href = destino;
          }, 500);
        } else if (query.get("error")) {
          setError(query.get("error_description") || "Google no completó el ingreso.");
        } else {
          espera = setTimeout(() => setError("No llegó la sesión desde Google. Probá de nuevo."), 5000);
        }
      } catch {
        setError("Ocurrió un error inesperado al ingresar.");
      }
    }
    void entrar();
    return () => clearTimeout(espera);
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6 px-5 py-12">
        <h1 className="text-3xl font-bold tracking-tight">No pudimos entrar</h1>
        <p role="alert" className="text-lg text-red-300">
          {error}
        </p>
        <Link href="/ingresar" className="inline-flex min-h-12 items-center justify-center rounded-full bg-aviation-cyan px-6 text-base font-bold text-noche">
          Volver a probar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6 px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Un segundo…</h1>
      <p className="text-lg text-white/75">Estamos abriendo tu sesión.</p>
      <div role="status" aria-label="Ingresando" className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 rounded-full bg-aviation-cyan animate-[cargando_1.1s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
