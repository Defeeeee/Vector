"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { getGoogleLoginUrl } from "@/actions/auth";

/**
 * "Continuar con Google", con su separador.
 *
 * Vive acá y no inline en cada pantalla porque **lo usan login y registro**, y
 * hasta ahora sólo lo tenía login: la única pantalla que dice "Crear cuenta" era
 * la que no ofrecía el camino más corto. Las cuentas de Google que existen se
 * crearon entrando por la pantalla de login.
 *
 * Google no distingue alta de ingreso —el mismo `getGoogleLoginUrl` crea la
 * cuenta si no existe—, así que el botón es literalmente el mismo en las dos
 * pantallas. Sólo cambia el texto.
 *
 * `disabled` viene de afuera para que el formulario de credenciales de cada
 * página pueda bloquearlo mientras está enviando.
 */
export default function GoogleButton({
  disabled = false,
  onError,
  onPendingChange,
  label = "Google",
}: {
  disabled?: boolean;
  onError?: (mensaje: string) => void;
  /** Para que la página pueda bloquear su propio formulario mientras redirige. */
  onPendingChange?: (pending: boolean) => void;
  label?: string;
}) {
  const [isPending, setPending] = useState(false);
  const setIsPending = (v: boolean) => {
    setPending(v);
    onPendingChange?.(v);
  };

  async function handleClick() {
    setIsPending(true);
    onError?.("");
    try {
      const result = await getGoogleLoginUrl();
      if (result.error) {
        onError?.(result.error);
        setIsPending(false);
      } else if (result.url) {
        // Navegación completa a propósito: el flujo sigue en el proveedor y
        // vuelve por /auth/callback, así que no hay estado local que preservar.
        window.location.href = result.url;
      }
    } catch {
      onError?.("Error al continuar con Google");
      setIsPending(false);
    }
  }

  return (
    <>
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-white/10"></div>
        </div>
        <div className="relative flex justify-center text-[8px] font-bold uppercase tracking-[0.3em]">
          <span className="bg-white dark:bg-black px-4 text-zinc-400 dark:text-zinc-500 transition-colors">
            O continuar con
          </span>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={disabled || isPending}
        className="w-full bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-semibold text-sm py-5 rounded-2xl transition-all hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-50 flex items-center justify-center space-x-3 shadow-sm dark:shadow-none"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>{label}</span>
          </>
        )}
      </motion.button>
    </>
  );
}
