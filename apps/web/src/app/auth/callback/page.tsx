"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setSession } from "@/actions/auth";
import { Loader2, Compass } from "lucide-react";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuth() {
      try {
        console.log("AuthCallback: FULL URL:", window.location.href);
        const hash = window.location.hash;
        const query = new URLSearchParams(window.location.search);
        
        console.log("AuthCallback: Hash:", hash);
        console.log("AuthCallback: Query:", query.toString());
        
        let accessToken = query.get("access_token");
        let refreshToken = query.get("refresh_token");

        if (!accessToken && hash) {
          console.log("AuthCallback: Found token in hash, parsing...");
          const params = new URLSearchParams(hash.substring(1));
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
        }

        if (accessToken) {
          console.log("AuthCallback: Token detected, updating session...");
          localStorage.setItem("session_token", accessToken);
          try {
            await setSession(accessToken, refreshToken || undefined);
            console.log("AuthCallback: setSession call completed");
          } catch (e) {
            console.error("AuthCallback: setSession failed:", e);
          }
          
          console.log("AuthCallback: Session set, waiting for propagation...");
          // Small delay to ensure cookies are committed before redirect
          setTimeout(() => {
              console.log("AuthCallback: Success, hard redirecting to /dashboard");
              window.location.href = "/dashboard";
          }, 500);
          
        } else if (query.get("error")) {
          console.error("AuthCallback: Supabase error:", query.get("error"), query.get("error_description"));
          setError(query.get("error_description") || "Authentication failed");
        } else {
          console.log("AuthCallback: No token found. URL might be incorrect or Supabase didn't redirect with tokens.");
          const timeout = setTimeout(() => {
             if (!accessToken) {
               console.error("AuthCallback: Timeout - no token received");
               setError("No se pudo encontrar el token de sesión. Verifica la URL.");
             }
          }, 5000);
          return () => clearTimeout(timeout);
        }
      } catch (err) {
        console.error("Callback error:", err);
        setError("Ocurrió un error inesperado al procesar el inicio de sesión.");
      }
    }

    handleAuth();
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#0a0a0a] text-white">
      <div className="flex flex-col items-center space-y-8">
        <div className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.1)]">
          <Compass className="w-8 h-8 animate-pulse" strokeWidth={1.5} />
        </div>
        
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {error ? "Error de autenticación" : "Autenticando"}
          </h1>

          {error ? (
            <div className="space-y-6">
              <p className="text-red-500 text-sm font-medium max-w-xs mx-auto">
                {error}
              </p>
              <button
                onClick={() => router.push("/")}
                className="text-sm font-semibold text-zinc-500 hover:text-white transition-colors border-b border-white/10 pb-1"
              >
                Volver al inicio
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              <p className="text-sm font-medium text-zinc-500">
                Preparando tu bitácora digital...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
