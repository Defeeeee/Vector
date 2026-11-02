"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { conectarCad, desconectarCad, sincronizarCad } from "@/actions/cad-vector";

const campo =
  "w-full bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 outline-none focus:border-zinc-900 dark:focus:border-white/50 text-zinc-900 dark:text-white font-semibold placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:font-medium";

/**
 * Conectar la cuenta de ANAC para pasar los vuelos desde Vector (`/cad/conexion` del backend).
 * La contraseña va derecho al backend, que la prueba contra ANAC y sólo si entra la guarda
 * cifrada. Este componente no la guarda en ningún lado.
 */
export default function ConexionCad({ rechazada, usuarioAnterior }: { rechazada?: string | null; usuarioAnterior?: string | null }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState(usuarioAnterior ?? "");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  function conectar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await conectarCad(usuario, clave);
      if (!r.ok) {
        setError(r.error ?? "No pudimos conectar tu cuenta de ANAC.");
        return;
      }
      setClave("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={conectar} className="space-y-4">
      {rechazada && (
        <p className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          ANAC dejó de aceptar la contraseña guardada ({rechazada}). Escribila de nuevo: no la volvemos a probar sola, para no bloquearte la cuenta.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Usuario de ANAC</span>
          <input
            className={campo}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="El del CAD"
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Contraseña</span>
          <span className="relative block">
            <input
              className={`${campo} pr-12`}
              type={ver ? "text" : "password"}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10"
              aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"}
            >
              {ver ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </span>
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4" aria-hidden="true" />}
          {enviando ? "Entrando al CAD…" : "Conectar con ANAC"}
        </button>
        <p className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          <LockKeyhole className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Probamos una vez contra ANAC y, si entra, la guardamos cifrada. Nunca vuelve a tu pantalla y la borrás con Desconectar.
        </p>
      </div>
    </form>
  );
}

/** Borra la cuenta de ANAC guardada (y la sesión abierta en el backend). */
export function DesconectarCad() {
  const router = useRouter();
  const [seguro, setSeguro] = useState(false);
  const [enviando, startTransition] = useTransition();
  if (!seguro)
    return (
      <button onClick={() => setSeguro(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
        <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Desconectar
      </button>
    );
  return (
    <span className="inline-flex items-center gap-3 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">¿Borrar tu cuenta de ANAC de Vector?</span>
      <button
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            await desconectarCad();
            router.refresh();
          })
        }
        className="font-bold text-red-600 dark:text-red-400 disabled:opacity-50"
      >
        {enviando ? "Borrando…" : "Sí, borrar"}
      </button>
      <button onClick={() => setSeguro(false)} className="font-semibold text-zinc-500">
        No
      </button>
    </span>
  );
}

/**
 * "Actualizar con el CAD": la sincronización a pedido (sola corre una vez por día). Si cambió algo,
 * recarga la pantalla para que el panel lea de nuevo.
 */
export function ActualizarCad() {
  const [enviando, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  return (
    <span className="inline-flex items-center gap-3 text-xs">
      {texto && <span className="text-zinc-500 dark:text-zinc-400">{texto}</span>}
      <button
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            setTexto("");
            const r = await sincronizarCad(true);
            if (!r.sincronizado) return setTexto(r.error ?? "No se pudo actualizar.");
            const cambios = (r.marcados ?? 0) + (r.desmarcados ?? 0) + (r.estados ?? 0);
            if (cambios) window.location.reload();
            else setTexto("Ya estaba al día.");
          })
        }
        className="inline-flex items-center gap-1.5 font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${enviando ? "animate-spin" : ""}`} aria-hidden="true" />
        {enviando ? "Actualizando…" : "Actualizar con el CAD"}
      </button>
    </span>
  );
}
