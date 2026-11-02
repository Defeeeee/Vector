"use client";

import { motion } from "framer-motion";
import { Lock, Loader2, Compass, CheckCircle, AlertCircle } from "lucide-react";
import { updatePassword, setSession } from "@/actions/auth";
import { useState, useEffect, useTransition, Suspense } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  return (
    <div className="flex min-h-screen w-full bg-zinc-100 dark:bg-black relative overflow-hidden transition-colors duration-300">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full border border-zinc-200 dark:border-white/5 opacity-[0.4] -mr-64 -mt-64 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full border border-zinc-200 dark:border-white/5 opacity-[0.4] -ml-32 -mb-32 pointer-events-none" />

      {/* Minimal Top Bar */}
      <div className="absolute top-6 left-0 w-full px-6 flex justify-end items-center z-20">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto px-4 md:px-6 py-12 md:py-20 relative z-10">
        {isSuccess ? (
          <div className="flex flex-col items-center text-center space-y-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-2xl"
            >
              <CheckCircle className="w-10 h-10" />
            </motion.div>

            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Contraseña actualizada</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                Tu contraseña se actualizó correctamente. Ya podés iniciar sesión.
              </p>
            </div>

            <Link href="/login" className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 px-12 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95">
              Ir al login
            </Link>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center space-y-4 mb-8 md:mb-10 text-center"
            >
              <div className="w-12 h-12 md:w-14 md:h-14 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl flex items-center justify-center shadow-2xl">
                <Compass className="w-6 h-6 md:w-7 md:h-7" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display transition-colors">Nueva contraseña</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Restablecé tu acceso de piloto</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="w-full p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border border-zinc-200 dark:border-white/10 shadow-2xl dark:shadow-none bg-white dark:bg-[#0a0a0a] space-y-10 transition-all"
            >
              <form action={handleSubmit} className="space-y-6">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4 text-red-600 dark:text-red-500 text-xs font-bold text-center flex items-center justify-center space-x-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {!error && !isSessionReady && (
                  <div className="text-xs font-semibold text-aviation-blue-dark dark:text-aviation-cyan text-center animate-pulse mb-2">
                    Validando sesión de seguridad...
                  </div>
                )}

                <div className="space-y-5">
                  <div className="space-y-2 text-left group">
                    <label className="font-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Nueva contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
                      <input
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl py-5 pl-14 pr-6 outline-none focus:ring-2 focus:ring-aviation-blue/20 dark:focus:ring-aviation-cyan/20 focus:border-aviation-blue dark:focus:border-aviation-cyan transition-all text-sm font-bold tracking-wide placeholder:text-zinc-400 dark:placeholder:text-zinc-600 dark:text-white shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-left group">
                    <label className="font-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Confirmar contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
                      <input
                        name="confirm_password"
                        type="password"
                        placeholder="••••••••"
                        required
                        className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl py-5 pl-14 pr-6 outline-none focus:ring-2 focus:ring-aviation-blue/20 dark:focus:ring-aviation-cyan/20 focus:border-aviation-blue dark:focus:border-aviation-cyan transition-all text-sm font-bold tracking-wide placeholder:text-zinc-400 dark:placeholder:text-zinc-600 dark:text-white shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isPending || (!isSessionReady && !error)}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-6 rounded-2xl shadow-xl dark:shadow-none transition-all disabled:opacity-50 mt-2 hover:opacity-90"
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    <span>Actualizar contraseña</span>
                  )}
                </motion.button>
              </form>
            </motion.div>

            {/* Version Tag */}
            <div className="mt-12 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.5em]">
              Vector Aviation v2.5.0
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black transition-colors duration-300">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400 dark:text-white/20" />
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  );
}
