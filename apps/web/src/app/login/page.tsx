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
    // `expirada=1` desde la 3.13.0; `expired=true` es el de antes, por si quedó en un link.
    if (searchParams.get("expirada") === "1" || searchParams.get("expired") === "true") {
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
      {/*
        La sesión expirada (3.13.0): en vez del cartel que tapaba la pantalla, el login mismo lo
        dice y deja el formulario a mano. Llega con `?expirada=1` del proxy o de un 401.
      */}
      <AuthShell
        rotulo={expired ? "Sesión vencida" : "Bienvenido de vuelta"}
        titulo={expired ? "Tu sesión expiró." : "Tu bitácora te está esperando."}
        bajada={
          expired
            ? "Por seguridad, la cerramos después de una semana sin usar Vector. Ingresá de nuevo para seguir: tus vuelos y tus datos están como los dejaste."
            : "Cada vuelo, cada hora y cada vencimiento en un solo lugar."
        }
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
