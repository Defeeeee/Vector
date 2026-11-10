"use client";

import { Mail } from "lucide-react";
import AuthShell, { BotonAuth, CampoAuth, ErrorAuth } from "@/components/acceso/AuthShell";
import { recoverPassword } from "@/actions/auth";
import { useState, useTransition } from "react";
import Link from "next/link";

export default function RecoverPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recoverPassword(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setIsSuccess(true);
      }
    });
  }

  if (isSuccess) {
    return (
      <AuthShell
        rotulo="Recuperar acceso"
        titulo="Revisá tu correo."
        bajada="Si el email tiene una cuenta en Vector, te llega un enlace para elegir una contraseña nueva."
        volverA="/login"
      >
        <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold hover:border-white/40 hover:bg-white/[0.04] transition-colors">
          Volver a ingresar
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      rotulo="Recuperar acceso"
      titulo="Te ayudamos a volver a entrar."
      bajada="Escribí el email de tu cuenta y te mandamos un enlace para elegir una contraseña nueva."
      volverA="/login"
      pie={
        <p>
          <Link href="/login" className="hover:text-white transition-colors">Volver a ingresar</Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        {error && <ErrorAuth>{error}</ErrorAuth>}
        <CampoAuth rotulo="Correo electrónico" icono={Mail} name="email" type="email" autoComplete="email" placeholder="vos@ejemplo.com" required />
        <div className="pt-2">
          <BotonAuth pendiente={isPending}>Mandarme el enlace</BotonAuth>
        </div>
      </form>
    </AuthShell>
  );
}
