"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { setSession } from "@/actions/auth";
import AuthShell, { ErrorAuth } from "@/components/acceso/AuthShell";
import { CLAVE_VOLVER, volverSeguro } from "@/lib/sesion";

/**
 * La vuelta de Google: Supabase redirige acá con el token en el hash (o en la query), se arma la
 * sesión y se va al dashboard. Con el armado de las pantallas de acceso (3.13.0).
 *
 * Sin `console.log` de la URL: llevaba el token de sesión a la consola del navegador.
 */
export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    async function handleAuth() {
      try {
        const hash = window.location.hash;
        const query = new URLSearchParams(window.location.search);

        let accessToken = query.get("access_token");
        let refreshToken = query.get("refresh_token");

        if (!accessToken && hash) {
          const params = new URLSearchParams(hash.substring(1));
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
        }

        if (accessToken) {
          localStorage.setItem("session_token", accessToken);
          try {
            await setSession(accessToken, refreshToken || undefined);
          } catch {
            // Si falla, el proxy manda al login al entrar al dashboard: no hay nada mejor que hacer acá.
          }
          // Un respiro para que la cookie quede escrita antes de navegar.
          espera = setTimeout(() => {
            let destino = "/dashboard";
            try {
              destino = volverSeguro(sessionStorage.getItem(CLAVE_VOLVER)) ?? destino;
              sessionStorage.removeItem(CLAVE_VOLVER);
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

    handleAuth();
    return () => clearTimeout(espera);
  }, []);

  if (error) {
    return (
      <AuthShell rotulo="Ingresar con Google" titulo="No pudimos ingresar." volverA="/login">
        <div className="space-y-6">
          <ErrorAuth>{error}</ErrorAuth>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-aviation-cyan text-noche px-6 py-3.5 text-sm font-bold hover:bg-sky-300 transition-colors"
          >
            Volver a ingresar
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell rotulo="Ingresar con Google" titulo="Preparando tu bitácora." bajada="Un segundo: estamos abriendo tu sesión.">
      <div role="status" aria-label="Ingresando" className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 rounded-full bg-aviation-cyan animate-[cargando_1.1s_ease-in-out_infinite]" />
      </div>
    </AuthShell>
  );
}
