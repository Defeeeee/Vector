"use client";

import { useTransition } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { logout } from "@/actions/auth";
import { olvidarDatosPersonales } from "@/lib/olvidar-datos";

export function LogoutButton({ isMobile = false, variant = "default" }: { isMobile?: boolean; variant?: "default" | "rail" }) {
  const [isPending, startTransition] = useTransition();

  async function handleLogout() {
    /*
      **Primero se borra el teléfono, después se sale.** Si la acción falla por red, lo
      guardado ya no está — que es el orden correcto. Y hace falta hacerlo desde acá
      porque esto es una server action (`POST` con `Next-Action`), y el service worker
      no se mete con nada que no sea `GET`: si confiara sólo en interceptar
      `/api/auth/logout`, el camino más común no borraría nada.
    */
    await olvidarDatosPersonales();
    startTransition(async () => {
      await logout();
    });
  }

  if (variant === "rail") {
    return (
      <button
        disabled={isPending}
        onClick={handleLogout}
        className="group flex items-center gap-3 w-full h-12 rounded-2xl px-3.5 transition-colors text-zinc-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-aviation-cyan"
      >
        <span className="w-5 flex justify-center shrink-0">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" strokeWidth={2} />}
        </span>
        <span className="rail-rotulo text-sm font-semibold">Cerrar sesión</span>
      </button>
    );
  }

  if (isMobile) {
    return (
      <button
        disabled={isPending}
        onClick={handleLogout}
        className="p-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-500 border border-transparent hover:border-zinc-200 dark:hover:border-white/10 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" strokeWidth={2} />}
      </button>
    );
  }

  return (
    <button 
      disabled={isPending}
      onClick={handleLogout}
      className="w-full flex items-center justify-center space-x-2 py-3 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl transition-all text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-500 hover:border-red-200 dark:hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-95 shadow-sm font-semibold text-sm disabled:opacity-50"
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" strokeWidth={2} />}
      <span>{isPending ? "Cerrando..." : "Cerrar Sesión"}</span>
    </button>
  );
}
