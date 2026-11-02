"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AtSign, Check, Globe, Loader2, Lock, X } from "lucide-react";
import { guardarPerfilPublico, handleDisponible } from "@/actions/social";
import { useAvisos } from "@/components/dashboard/Avisos";
import { conArroba, normalizarHandle, problemaDelHandle, sugerirHandle } from "@/lib/handle";
import type { Visibilidad } from "@/types";

/**
 * Crear el @ sin salir de donde estás: en la Red, en Publicar, en la Actividad.
 *
 * Antes, cada pantalla de la red sin @ era un cartel que mandaba al Hangar, y de ahí
 * había que volver solo. Esto propone un @ a partir del nombre (`sugerirHandle`) y lo
 * crea con un botón; el Hangar queda para editar la bio y lo demás.
 *
 * **Crear el @ es el consentimiento** (como en `PerfilPublicoForm`): el texto de qué se
 * ve con cada opción está arriba del botón. Arranca en Público por decisión de Federico.
 */
export default function CrearHandleRapido({
  nombreSugerido,
  licenciaSugerida,
  titulo = "Elegí tu @ para sumarte a la red",
  visibilidadInicial = "publico",
  onCreado,
}: {
  nombreSugerido: string;
  licenciaSugerida: string | null;
  titulo?: string;
  /**
   * En el alta arranca en Privado: ahí el @ es obligatorio (Federico, 2026-09-24), y
   * quien pasa rápido no tiene que quedar con sus horas a la vista de cualquiera. En el
   * resto de la app sigue arrancando en Público, como decidió Federico.
   */
  visibilidadInicial?: Visibilidad;
  /** Para el alta, que tiene que pasar al paso siguiente. */
  onCreado?: (handle: string) => void;
}) {
  const router = useRouter();
  const { notificar } = useAvisos();
  const [handle, setHandle] = useState(() => sugerirHandle(nombreSugerido));
  const [nombre, setNombre] = useState(nombreSugerido);
  const [visibilidad, setVisibilidad] = useState<Visibilidad>(visibilidadInicial);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const normalizado = normalizarHandle(handle);
  const problema = handle ? problemaDelHandle(handle) : null;
  const pideNombre = !nombreSugerido.trim();

  useEffect(() => {
    setDisponible(null);
    if (!normalizado || problema) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const r = await handleDisponible(normalizado);
      if (vigente) setDisponible(r);
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [normalizado, problema]);

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await guardarPerfilPublico({
        handle: normalizado,
        nombre_visible: nombre.trim() || normalizado,
        licencia: licenciaSugerida,
        bio: null,
        visibilidad,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      notificar({ tipo: "exito", titulo: `Listo: sos ${conArroba(r.perfil.handle)}` });
      onCreado?.(r.perfil.handle);
      router.refresh();
    });
  };

  const bloqueado = pendiente || !!problema || !normalizado || disponible === false || (pideNombre && !nombre.trim());

  return (
    <form
      onSubmit={crear}
      className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-7 space-y-5"
    >
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
          <AtSign className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display font-bold text-lg text-zinc-900 dark:text-white tracking-tight">{titulo}</h3>
          <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Con tu @ otros pilotos te encuentran, te siguen y ven lo que publicás. Lo podés cambiar cuando quieras.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="sr-only">Tu @</span>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="tu.nombre"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={21}
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 pl-8 pr-4 py-3 font-mono text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
            />
          </div>
        </label>
        <p className="min-h-[1.25rem] text-[12px]" aria-live="polite">
          {problema ? (
            <span className="text-red-600 dark:text-red-400">{problema}</span>
          ) : disponible === false ? (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <X className="w-3 h-3" /> Ese @ ya lo tiene otro piloto.
            </span>
          ) : disponible === true ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" /> Está libre.
            </span>
          ) : (
            <span className="text-zinc-400">Letras, números, punto o guion bajo.</span>
          )}
        </p>
      </div>

      {pideNombre && (
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Nombre visible
          </span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={60}
            className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
          />
        </label>
      )}

      {/* Qué se publica: arriba del botón, porque apretarlo es aceptarlo. */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
          {(
            [
              { valor: "publico", texto: "Público", icono: <Globe className="w-4 h-4" /> },
              { valor: "privado", texto: "Privado", icono: <Lock className="w-4 h-4" /> },
            ] as const
          ).map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => setVisibilidad(o.valor)}
              aria-pressed={visibilidad === o.valor}
              className={`inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                visibilidad === o.valor
                  ? "bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {o.icono}
              {o.texto}
            </button>
          ))}
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {visibilidad === "publico"
            ? "Cualquiera con el link ve tu nombre, tu @, tu licencia, tus horas totales y lo que publiques. Te siguen sin pedirte permiso."
            : "Te encuentran por @ o por nombre, pero tus horas y lo que publiques lo ven sólo los pilotos que aceptes."}{" "}
          <strong className="text-zinc-700 dark:text-zinc-200">Nada de tu bitácora se publica solo:</strong> sólo lo que
          compartas vos.
        </p>
      </div>

      {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={bloqueado}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-6 py-3 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />}
          {normalizado && !problema ? `Crear ${conArroba(normalizado)}` : "Crear mi @"}
        </button>
        <Link
          href="/dashboard/settings#perfil-publico"
          className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Más opciones en el Hangar
        </Link>
      </div>
    </form>
  );
}
