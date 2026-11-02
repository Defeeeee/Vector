"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Check, Globe, Loader2, Lock, X } from "lucide-react";
import { guardarPerfilPublico, handleDisponible, salirDeLaRed } from "@/actions/social";
import { conArroba, normalizarHandle, problemaDelHandle, rutaPerfilApp } from "@/lib/handle";
import CompartirPerfil from "./CompartirPerfil";
import FotoDePerfil from "./FotoDePerfil";
import type { PerfilPublico, Visibilidad } from "@/types";

const BIO_MAX = 160;

/**
 * Crear o editar el @ y la foto de perfil: sumarse a la red de pilotos.
 *
 * El @ también se crea sin salir de la red (`CrearHandleRapido`); acá está todo lo
 * demás: la bio, la licencia, la foto, pasar a privado y salir de la red.
 *
 * **Crear el @ es el consentimiento** para publicar lo que el formulario dice, y por
 * eso el texto de qué se ve con cada opción está arriba del botón y no en otra
 * pantalla. Arranca en Público por decisión de Federico; Privado está a un toque.
 *
 * El @ se valida mientras se tipea con las mismas reglas que el backend
 * (`src/lib/handle.ts`) y se pregunta si está libre. Lo que decide igual es el backend
 * al guardar: dos pilotos pueden pedir el mismo @ al mismo tiempo.
 */
export default function PerfilPublicoForm({
  perfil: perfilInicial,
  nombreSugerido,
  licenciaSugerida,
}: {
  perfil: PerfilPublico | null;
  nombreSugerido: string;
  licenciaSugerida: string | null;
}) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(perfilInicial);
  const [handle, setHandle] = useState(perfilInicial?.handle ?? "");
  const [nombre, setNombre] = useState(perfilInicial?.nombre_visible ?? nombreSugerido);
  const [licencia, setLicencia] = useState(perfilInicial?.licencia ?? licenciaSugerida ?? "");
  const [bio, setBio] = useState(perfilInicial?.bio ?? "");
  const [visibilidad, setVisibilidad] = useState<Visibilidad>(perfilInicial?.visibilidad ?? "publico");
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const normalizado = normalizarHandle(handle);
  const problema = handle ? problemaDelHandle(handle) : null;
  const esElMismo = !!perfil && normalizado === perfil.handle;

  // Si el @ está libre, cuando el formato ya es válido y no es el que ya tenés.
  useEffect(() => {
    setDisponible(null);
    if (!normalizado || problema || esElMismo) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const r = await handleDisponible(normalizado, perfil?.handle);
      if (vigente) setDisponible(r);
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [normalizado, problema, esElMismo, perfil?.handle]);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const r = await guardarPerfilPublico(
        { handle: normalizado, nombre_visible: nombre, licencia: licencia || null, bio: bio || null, visibilidad },
        perfil?.handle
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPerfil(r.perfil);
      setHandle(r.perfil.handle);
      setGuardado(true);
      router.refresh();
    });
  };

  const salir = () => {
    if (!perfil) return;
    if (
      !window.confirm(
        `¿Borrar ${conArroba(perfil.handle)}? Perdés tus seguidores, a quién seguís, y todo lo que publicaste con sus fotos y comentarios.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await salirDeLaRed(perfil.handle);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPerfil(null);
      setHandle("");
      router.refresh();
    });
  };

  const bloqueado = pendiente || !!problema || !normalizado || !nombre.trim() || disponible === false;
  const campo =
    "w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors";
  const etiqueta = "font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

  return (
    <form
      onSubmit={guardar}
      className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-6"
    >
      {perfil ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={rutaPerfilApp(perfil.handle)}
            className="inline-flex items-center gap-1.5 font-mono text-base font-semibold text-zinc-900 dark:text-white hover:underline underline-offset-2"
          >
            {conArroba(perfil.handle)}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <span className="flex-1" />
          <CompartirPerfil handle={perfil.handle} compacto />
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Elegí tu @ para sumarte a la red de pilotos: te pueden buscar, seguir, y ver tus horas y lo que publiques con
          un link que mandás por WhatsApp.
        </p>
      )}

      {perfil && <FotoDePerfil nombre={perfil.nombre_visible} avatarUrl={perfil.avatar_url ?? null} />}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block space-y-2">
          <span className={etiqueta}>Tu @</span>
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
              className={`${campo} pl-8 font-mono`}
            />
          </div>
          <p className="min-h-[1.25rem] text-[12px]">
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
              <span className="text-zinc-400">Letras, números, punto o guion bajo. Va en tu link: /u/tu.nombre</span>
            )}
          </p>
        </label>

        <label className="block space-y-2">
          <span className={etiqueta}>Nombre visible</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className={campo} />
        </label>

        <label className="block space-y-2">
          <span className={etiqueta}>Licencia</span>
          <input
            value={licencia}
            onChange={(e) => setLicencia(e.target.value)}
            maxLength={20}
            placeholder="PPA, PCA, alumno…"
            className={campo}
          />
        </label>

        <label className="block space-y-2 md:row-span-2">
          <span className={etiqueta}>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            rows={3}
            placeholder="Dónde volás, qué estás sacando…"
            className={`${campo} resize-none`}
          />
          <span className="block text-right text-[11px] text-zinc-400">
            {bio.length}/{BIO_MAX}
          </span>
        </label>
      </div>

      {/* Qué se publica: arriba del botón, porque apretarlo es aceptarlo. */}
      <div className="space-y-3">
        <span className={etiqueta}>Quién ve tus horas y lo que publicás</span>
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
            ? "Cualquiera con el link ve tu nombre, tu @, tu licencia, tu bio, tus horas totales, PIC, de travesía, de noche y de instrumentos, y lo que publiques. Te siguen sin pedirte permiso."
            : "Te encuentran por @ o por nombre, pero tus horas y lo que publiques lo ven sólo los pilotos que aceptes."}{" "}
          <strong className="text-zinc-700 dark:text-zinc-200">
            Nada de tu bitácora se publica solo: sólo lo que compartas, y de cada vuelo sólo los datos que elijas. La
            matrícula y tus documentos, nunca.
          </strong>{" "}
          Podés cambiarlo o borrar tu perfil cuando quieras.
        </p>
      </div>

      {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={bloqueado}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-6 py-3.5 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />}
          {perfil ? "Guardar cambios" : "Crear mi perfil"}
        </button>
        {guardado && !pendiente && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" /> Guardado
          </span>
        )}
        {perfil && (
          <button
            type="button"
            onClick={salir}
            disabled={pendiente}
            className="ml-auto text-sm font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            Salir de la red
          </button>
        )}
      </div>
    </form>
  );
}
