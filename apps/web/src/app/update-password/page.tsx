"use client";

import { Lock } from "lucide-react";
import { updatePassword, setSession } from "@/actions/auth";
import { useState, useEffect, useTransition, Suspense } from "react";
import Link from "next/link";
import AuthShell, { BotonAuth, CampoAuth, ErrorAuth } from "@/components/acceso/AuthShell";

function UpdatePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function initializeSession() {
      // Parse hash fragment (#access_token=...)
      const hash = window.location.hash;
      const urlParams = new URLSearchParams(window.location.search);
      let token = urlParams.get("token") || urlParams.get("access_token");

      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        token = token || params.get("access_token");
      }

      if (token) {
        try {
          await setSession(token, undefined, 3600);
          setIsSessionReady(true);
          console.log("Session established from token");
        } catch (e) {
          setError("Error al establecer la sesión de recuperación.");
        }
      } else {
        setError("Token de recuperación no encontrado. Por favor, solicita un nuevo correo.");
      }
    }

    initializeSession();
  }, []);

  async function handleSubmit(formData: FormData) {
    const password = formData.get("password");
    const confirm = formData.get("confirm_password");

    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!isSessionReady) {
      setError("La sesión aún no está lista. Por favor espera un segundo.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updatePassword(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setIsSuccess(true);
      }
    });
  }

  if (isSuccess) {
    return (
      <AuthShell rotulo="Listo" titulo="Contraseña actualizada." bajada="Ya podés ingresar con la nueva." volverA="/login">
        <Link href="/login" className="inline-flex items-center justify-center rounded-full bg-aviation-cyan text-noche px-6 py-3.5 text-sm font-bold hover:bg-sky-300 transition-colors">
          Ingresar
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell rotulo="Nueva contraseña" titulo="Elegí tu contraseña nueva." volverA="/login">
      <form action={handleSubmit} className="space-y-5">
        {error && <ErrorAuth>{error}</ErrorAuth>}
        {!error && !isSessionReady && (
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-aviation-cyan animate-pulse">Validando el enlace…</p>
        )}
        <CampoAuth rotulo="Nueva contraseña" icono={Lock} name="password" type="password" autoComplete="new-password" placeholder="••••••••" required />
        <CampoAuth rotulo="Repetila" icono={Lock} name="confirm_password" type="password" autoComplete="new-password" placeholder="••••••••" required />
        <div className="pt-2">
          <BotonAuth pendiente={isPending} disabled={!isSessionReady && !error}>Guardar la contraseña</BotonAuth>
        </div>
      </form>
    </AuthShell>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-noche" />}>
      <UpdatePasswordForm />
    </Suspense>
  );
}
