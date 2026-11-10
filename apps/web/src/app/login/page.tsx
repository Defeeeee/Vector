"use client";

import { Lock, Mail } from "lucide-react";
import { login, setSession } from "@/actions/auth";
import GoogleButton from "@/components/GoogleButton";
import { useState, useTransition, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import OlvidarAlSalir from "@/components/OlvidarAlSalir";
import AuthShell, { BotonAuth, CampoAuth, ErrorAuth } from "@/components/acceso/AuthShell";

function LoginContent() {
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("expired") === "true") {
      setExpired(true);
    }
  }, [searchParams]);

  useEffect(() => {
    async function checkUrlForToken() {
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
          setIsGooglePending(true);
          localStorage.setItem("session_token", accessToken);
          await setSession(accessToken, refreshToken || undefined);
          router.push("/dashboard");
        } else if (query.get("error")) {
          setError(query.get("error_description") || "Authentication failed");
        }
      } catch (err) {
        console.error("Token check error:", err);
      }
    }
    
    checkUrlForToken();
  }, [router]);


  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* Si estás acá, no hay sesión: se borra del teléfono lo que era del
          piloto. Red de seguridad del borrado — ver `olvidar-datos.ts`. */}
      <OlvidarAlSalir />
      <AuthShell
        rotulo="Bienvenido de vuelta"
        titulo="Tu bitácora te está esperando."
        bajada="Cada vuelo, cada hora y cada vencimiento en un solo lugar."
        pie={
          <>
            <p>
              <Link href="/recover" className="hover:text-white transition-colors">¿Olvidaste tu contraseña?</Link>
            </p>
            <p>
              ¿Nuevo en Vector?{" "}
              <Link href="/register" className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-aviation-cyan">
                Crear cuenta
              </Link>
            </p>
          </>
        }
      >
        {expired && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" className="bg-carbon border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center space-y-6">
              <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-display font-extrabold tracking-[-0.03em]">Se cerró tu sesión</h2>
                <p className="text-sm text-niebla leading-relaxed">Por seguridad, la sesión terminó. Volvé a ingresar.</p>
              </div>
              <button
                onClick={() => {
                  setExpired(false);
                  router.replace("/login");
                }}
                className="w-full rounded-full bg-aviation-cyan text-noche font-bold text-sm py-3.5 hover:bg-sky-300 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        <form action={handleSubmit} className="space-y-5">
          {error && <ErrorAuth>{error}</ErrorAuth>}
          <CampoAuth rotulo="Correo electrónico" icono={Mail} name="email" type="email" autoComplete="email" placeholder="vos@ejemplo.com" required />
          <CampoAuth rotulo="Contraseña" icono={Lock} name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
          <div className="pt-2">
            <BotonAuth pendiente={isPending} disabled={isGooglePending}>Ingresar</BotonAuth>
          </div>
        </form>

        <div className="mt-6 space-y-4">
          <GoogleButton disabled={isPending} onError={(m) => setError(m || null)} onPendingChange={setIsGooglePending} />
        </div>
      </AuthShell>
    </>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-noche" />}>
      <LoginContent />
    </Suspense>
  );
}
