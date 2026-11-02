"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, Loader2, Compass, ChevronLeft, Plane } from "lucide-react";
import { login, setSession } from "@/actions/auth";
import GoogleButton from "@/components/GoogleButton";
import { useState, useTransition, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import OlvidarAlSalir from "@/components/OlvidarAlSalir";

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
    <div className="flex min-h-screen w-full bg-white dark:bg-black relative transition-colors duration-300">
      {/* Si estás acá, no hay sesión: se borra del teléfono lo que era del
          piloto. Red de seguridad del borrado — ver `olvidar-datos.ts`. */}
      <OlvidarAlSalir />
      {/* Minimal Top Bar — constrained to the form half so it does not float
          over the context panel on wide screens. */}
      <div className="absolute top-6 left-0 w-full lg:w-1/2 px-6 flex justify-between items-center z-20">
        <Link href="/" className="p-3 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-full shadow-md hover:bg-zinc-50 dark:hover:bg-white/5 transition-all group">
            <ChevronLeft className="w-5 h-5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
        </Link>
        <ThemeToggle />
      </div>

      {/* Context panel — right half, desktop only. A centered card on an empty
          page gives the eye nothing to rest on; this fills the other half with
          product rather than with decoration, which is what FlightDeck does.
          Deliberately carries no personal numbers: it renders before anyone is
          authenticated, so anything that looked like logbook data would be a
          lie dressed as a dashboard. */}
      <div className="hidden lg:flex lg:w-1/2 order-2 bg-zinc-100 dark:bg-[#0a0a0a] border-l border-zinc-200 dark:border-white/5 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full border border-zinc-200 dark:border-white/5 opacity-40 -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full border border-zinc-200 dark:border-white/5 opacity-40 -ml-32 -mb-32 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 w-full max-w-md bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] p-10 shadow-xl dark:shadow-none space-y-8"
        >
          <p className="eyebrow">Bienvenido de vuelta</p>

          <h2 className="text-3xl font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
            Tu bitácora te está esperando.
          </h2>

          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Cada vuelo, cada hora y cada vencimiento en un solo lugar — con el
            desglose ANAC ya calculado.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <span className="data text-sm font-bold text-zinc-900 dark:text-white">SADM</span>
            <span className="flex-1 border-t border-dashed border-zinc-300 dark:border-white/15" />
            <Plane className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />
            <span className="flex-1 border-t border-dashed border-zinc-300 dark:border-white/15" />
            <span className="data text-sm font-bold text-zinc-900 dark:text-white">SAEZ</span>
          </div>
        </motion.div>
      </div>

      {/* Content Area */}
      <div className="flex flex-col items-center justify-center w-full lg:w-1/2 order-1 max-w-md lg:max-w-none mx-auto lg:mx-0 px-4 md:px-6 lg:px-16 xl:px-24 py-12 md:py-20 relative z-10">
        {/* Session Expired Alert */}
        <AnimatePresence>
            {expired && (
            <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm"
            >
                <motion.div 
                className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] p-10 max-w-sm w-full text-center space-y-8 shadow-2xl"
                >
                <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto">
                    <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight font-display">Sesión Expirada</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">Tu sesión ha terminado por seguridad. Por favor, vuelve a ingresar.</p>
                </div>
                <button
                    onClick={() => {
                    setExpired(false);
                    router.replace("/login");
                    }}
                    className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 rounded-2xl shadow-lg transition-all active:scale-95 hover:opacity-90"
                >
                    Entendido
                </button>
                </motion.div>
            </motion.div>
            )}
        </AnimatePresence>

        {/* Branding */}
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md flex flex-col items-center lg:items-start space-y-4 mb-8 md:mb-10 text-center lg:text-left"
        >
            <div className="w-12 h-12 md:w-14 md:h-14 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl flex items-center justify-center shadow-2xl">
                <Compass className="w-6 h-6 md:w-7 md:h-7" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display transition-colors">Bienvenido</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Accedé a tu logbook</p>
            </div>
        </motion.div>

        {/* Login Card */}
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            /* On desktop the two-panel split already supplies the structure, so
               the card sheds its border and shadow — a white card floating on a
               white half just draws a box around nothing. Below lg it keeps
               them, because there it *is* the only structure on the page. */
            className="w-full max-w-md p-8 md:p-10 lg:p-0 rounded-[2.5rem] md:rounded-[3rem] lg:rounded-none border border-zinc-200 dark:border-white/10 lg:border-0 shadow-2xl dark:shadow-none lg:shadow-none bg-white dark:bg-[#0a0a0a] lg:bg-transparent dark:lg:bg-transparent space-y-10 transition-all"
        >
            <form action={handleSubmit} className="space-y-6">
                {error && (
                    <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4 text-red-600 dark:text-red-500 text-xs font-bold text-center uppercase tracking-wider shadow-sm"
                    >
                    {error}
                    </motion.div>
                )}

                <div className="space-y-5">
                    <div className="space-y-2 text-left group">
                        <label className="font-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Correo electrónico</label>
                        <div className="relative">
                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
                            <input 
                                name="email"
                                type="email" 
                                placeholder="name@airline.com" 
                                required
                                className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl py-5 pl-14 pr-6 outline-none focus:ring-2 focus:ring-aviation-blue/20 dark:focus:ring-aviation-cyan/20 focus:border-aviation-blue dark:focus:border-aviation-cyan transition-all text-sm font-bold tracking-wide placeholder:text-zinc-400 dark:placeholder:text-zinc-600 dark:text-white shadow-sm"
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2 text-left group">
                        <label className="font-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Contraseña</label>
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
                </div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isPending || isGooglePending}
                    className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-6 rounded-2xl shadow-xl dark:shadow-none transition-all disabled:opacity-50 mt-2 hover:opacity-90"
                >
                    {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                    <span>Iniciar sesión</span>
                    )}
                </motion.button>
            </form>

            <GoogleButton
              disabled={isPending}
              onError={(m) => setError(m || null)}
              onPendingChange={setIsGooglePending}
            />


            <div className="flex flex-col items-center space-y-6 pt-6 border-t border-zinc-200 dark:border-white/10 transition-colors">
                <Link href="/recover" className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    ¿Olvidaste tu contraseña?
                </Link>

                <div className="flex items-center space-x-2 text-sm font-medium">
                    <span className="text-zinc-500 dark:text-zinc-400">¿Nuevo en Vector?</span>
                    <Link href="/register" className="text-zinc-900 dark:text-white hover:opacity-70 transition-opacity border-b border-zinc-200 dark:border-white/20 pb-0.5">
                        Crear cuenta
                    </Link>
                </div>
            </div>
        </motion.div>

        {/* Version Tag */}
        <div className="mt-12 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.5em]">
            Vector Aviation v2.7.0
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-900 dark:text-white font-display font-bold animate-pulse bg-zinc-100 dark:bg-black transition-colors duration-300">Cargando Vector...</div>}>
      <LoginContent />
    </Suspense>
  );
}
