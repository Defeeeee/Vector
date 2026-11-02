"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Flag, Loader2, MoreHorizontal, Send, Trash2 } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import DialogoReportar from "./DialogoReportar";
import MenuAcciones, { type AccionDeMenu } from "@/components/MenuAcciones";
import { borrarComentario, comentar, listarComentarios } from "@/actions/social";
import { conArroba, rutaPerfil, rutaPerfilApp } from "@/lib/handle";
import type { Comentario } from "@/types";
import type { ContextoPublicacion } from "./PublicacionCard";

/** El mismo tope que `COMENTARIO_MAX` del backend. */
const COMENTARIO_MAX = 500;

/**
 * Los comentarios de una publicación, abiertos debajo de la tarjeta.
 *
 * Se piden recién al abrirlos: la mayoría de las publicaciones de un feed nunca se
 * abren, y traer los comentarios de todas sería pagar quince viajes por nada. Borra un
 * comentario su autor o el de la publicación; eso lo calcula el backend
 * (`puede_borrar`), no esta pantalla.
 */
export default function ComentariosPublicacion({
  publicacionId,
  contexto,
  alCambiarCantidad,
}: {
  publicacionId: string;
  contexto: ContextoPublicacion;
  alCambiarCantidad: (delta: number) => void;
}) {
  const [comentarios, setComentarios] = useState<Comentario[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, startEnviar] = useTransition();
  const [borrando, setBorrando] = useState<string | null>(null);
  const [reportando, setReportando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const r = await listarComentarios(publicacionId, !!contexto.comoAnonimo);
    if (r.ok) setComentarios(r.comentarios);
    else setErrorCarga(r.error);
  }, [publicacionId, contexto.comoAnonimo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setErrorEnvio(null);
    startEnviar(async () => {
      const r = await comentar(publicacionId, limpio);
      if (!r.ok) {
        setErrorEnvio(r.error);
        return;
      }
      setComentarios((cs) => [...(cs ?? []), r.comentario]);
      setTexto("");
      alCambiarCantidad(1);
    });
  };

  const borrar = async (c: Comentario) => {
    if (!window.confirm("¿Borrar este comentario?")) return;
    setBorrando(c.id);
    const r = await borrarComentario(c.id);
    setBorrando(null);
    if (!r.ok) {
      setErrorEnvio(r.error);
      return;
    }
    setComentarios((cs) => (cs ?? []).filter((x) => x.id !== c.id));
    alCambiarCantidad(-1);
  };

  const rutaDe = contexto.modo === "app" ? rutaPerfilApp : rutaPerfil;

  /** Borrar lo que se puede borrar (lo propio, o todo en lo propio) y reportar lo ajeno. */
  const accionesDe = (c: Comentario): AccionDeMenu[] => {
    if (contexto.interaccion !== "completa") return [];
    const acciones: AccionDeMenu[] = [];
    if (c.autor.handle !== contexto.miHandle) {
      acciones.push({ etiqueta: "Reportar comentario", icono: Flag, alElegir: () => setReportando(c.id) });
    }
    if (c.puede_borrar) {
      acciones.push({ etiqueta: "Borrar comentario", icono: Trash2, peligro: true, alElegir: () => void borrar(c) });
    }
    return acciones;
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/5 space-y-3">
      {reportando && (
        <DialogoReportar tipo="comentario" objetivo={reportando} alCerrar={() => setReportando(null)} />
      )}
      {comentarios === null && !errorCarga && (
        <p className="flex items-center gap-2 text-[13px] text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando comentarios…
        </p>
      )}
      {errorCarga && (
        <p className="text-[13px] text-red-600 dark:text-red-400">
          {errorCarga}{" "}
          <button type="button" onClick={() => void cargar()} className="font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </p>
      )}
      {comentarios?.length === 0 && (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Todavía no hay comentarios.</p>
      )}
      {comentarios && comentarios.length > 0 && (
        <ul className="space-y-3">
          {comentarios.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Link href={rutaDe(c.autor.handle)} className="shrink-0">
                <AvatarPiloto nombre={c.autor.nombre_visible} avatarUrl={c.autor.avatar_url} tamano="xs" />
              </Link>
              <div className="min-w-0 flex-1 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <Link
                    href={rutaDe(c.autor.handle)}
                    className="font-semibold text-zinc-900 dark:text-white hover:underline underline-offset-2"
                  >
                    {c.autor.nombre_visible}
                  </Link>
                  <span className="font-mono text-zinc-400">{conArroba(c.autor.handle)}</span>
                  <span className="text-zinc-400" title={c.fecha_titulo}>
                    {c.fecha_texto}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
                  {c.texto}
                </p>
              </div>
              {accionesDe(c).length > 0 && (
                <MenuAcciones
                  acciones={accionesDe(c)}
                  etiqueta="Opciones del comentario"
                  claseBoton="mt-1 p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                >
                  {borrando === c.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  )}
                </MenuAcciones>
              )}
            </li>
          ))}
        </ul>
      )}

      {contexto.interaccion === "completa" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="space-y-1.5"
        >
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="sr-only">Escribí un comentario</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, COMENTARIO_MAX))}
                onKeyDown={(e) => {
                  // Enter con ⌘ o Ctrl manda; Enter solo hace un renglón nuevo, que en el
                  // teléfono es lo único que tiene sentido.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                rows={1}
                maxLength={COMENTARIO_MAX}
                placeholder="Escribí un comentario"
                className="block w-full resize-none rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors [field-sizing:content] max-h-40"
              />
            </label>
            <button
              type="submit"
              disabled={!texto.trim() || enviando}
              aria-label="Comentar"
              title="Comentar"
              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-aviation-blue text-white hover:bg-aviation-blue-dark transition-colors disabled:opacity-40"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {texto.length > COMENTARIO_MAX - 50 && (
            <p className="text-right font-mono text-[11px] text-orange-500">
              {texto.length}/{COMENTARIO_MAX}
            </p>
          )}
          {errorEnvio && <p className="text-[12px] font-medium text-red-600 dark:text-red-400">{errorEnvio}</p>}
        </form>
      ) : contexto.interaccion === "sin-handle" ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          <Link
            href="/dashboard/pilotos"
            className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2"
          >
            Creá tu @
          </Link>{" "}
          para comentar.
        </p>
      ) : contexto.interaccion === "sin-sesion" ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          <Link href="/login" className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2">
            Entrá a Vector
          </Link>{" "}
          para comentar.
        </p>
      ) : null}
    </div>
  );
}
