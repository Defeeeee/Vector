"use client";

import { Lock, Mail, User } from "lucide-react";
import { register } from "@/actions/auth";
import GoogleButton from "@/components/GoogleButton";
import { useState, useTransition } from "react";
import Link from "next/link";
import { registroCompleto } from "@/lib/pixel-meta";
import AuthShell, { BotonAuth, CampoAuth, ErrorAuth } from "@/components/acceso/AuthShell";

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await register(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setIsSuccess(true);
        // Para medir los anuncios: sólo llega a Meta si el visitante aceptó el píxel.
        registroCompleto();
      }
    });
  }

  if (isSuccess) {
    return (
      <AuthShell
        rotulo="Un paso más"
        titulo="Verificá tu email."
        bajada="Te mandamos un enlace de confirmación. Abrilo para activar tu cuenta de Vector."
      >
        <Link href="/" className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold hover:border-white/40 hover:bg-white/[0.04] transition-colors">
          Volver al inicio
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      rotulo="Crear cuenta"
      titulo="Empezá a registrar tus vuelos hoy."
      pie={
        <p>
          ¿Ya tenés una cuenta?{" "}
          <Link href="/login" className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-aviation-cyan">
            Ingresá
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        {error && <ErrorAuth>{error}</ErrorAuth>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoAuth rotulo="Nombre" icono={User} name="first_name" type="text" autoComplete="given-name" placeholder="Julián" required />
          <CampoAuth rotulo="Apellido" icono={User} name="last_name" type="text" autoComplete="family-name" placeholder="Rossi" required />
        </div>
        <CampoAuth rotulo="Correo electrónico" icono={Mail} name="email" type="email" autoComplete="email" placeholder="vos@ejemplo.com" required />
        <CampoAuth rotulo="Contraseña" icono={Lock} name="password" type="password" autoComplete="new-password" placeholder="••••••••" required />
        <div className="pt-2">
          <BotonAuth pendiente={isPending}>Crear mi cuenta</BotonAuth>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Al continuar, aceptás los{" "}
          <Link href="/legal/terminos" className="underline decoration-white/20 underline-offset-2 hover:text-white">Términos</Link> y la{" "}
          <Link href="/legal/privacidad" className="underline decoration-white/20 underline-offset-2 hover:text-white">Política de privacidad</Link>.
        </p>
      </form>

      {/*
        Google crea la cuenta si no existe, así que acá el mismo botón que
        en login es un alta.
      */}
      <div className="mt-6 space-y-4">
        <GoogleButton disabled={isPending} onError={(m) => setError(m || null)} label="Registrarme con Google" />
      </div>
    </AuthShell>
  );
}
