"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Flag, Loader2, MessageCircle, MoreHorizontal, PartyPopper, Trash2 } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import ChipVuelo from "./ChipVuelo";
import ComentariosPublicacion from "./ComentariosPublicacion";
import DialogoReportar from "./DialogoReportar";
import GaleriaFotos from "./GaleriaFotos";
import MenuAcciones, { type AccionDeMenu } from "@/components/MenuAcciones";
import { useAvisos } from "@/components/dashboard/Avisos";
import { aplaudir, bloquearPiloto, borrarPublicacion } from "@/actions/social";
import { conArroba, rutaPerfil, rutaPerfilApp } from "@/lib/handle";
import type { Publicacion } from "@/types";

/**
 * Dónde se dibuja una publicación y qué puede hacer quien la mira.
 *
 * - `modo`: `app` adentro del dashboard, `publico` en `/u/...`. Decide a dónde lleva
 *   tocar un piloto: adentro de la app no se sale de la app.
 * - `interaccion`: `completa` con sesión y @; `sin-handle` con sesión y sin @ (para
 *   aplaudir o comentar hace falta que el otro sepa quién sos); `sin-sesion` desde un
 *   link; `solo-lectura` en la vista "así te ven", donde no se toca nada.
 * - `comoAnonimo`: todo lo que se pida, pedirlo sin sesión (la misma vista).
 * - `miHandle`: el @ de quien mira, para no ofrecerle reportar lo suyo.
 */
export interface ContextoPublicacion {
  modo: "app" | "publico";
  interaccion: "completa" | "sin-handle" | "sin-sesion" | "solo-lectura";
  comoAnonimo?: boolean;
  miHandle?: string | null;
}

export default function PublicacionCard({
  publicacion: p,
  contexto,
}: {
  publicacion: Publicacion;
  contexto: ContextoPublicacion;
}) {
  const [aplaudida, setAplaudida] = useState(p.aplaudida);
  const [aplausos, setAplausos] = useState(p.aplausos);
  const [aplaudiendo, setAplaudiendo] = useState(false);
  const [nComentarios, setNComentarios] = useState(p.comentarios);
  const [verComentarios, setVerComentarios] = useState(false);
  const [borrada, setBorrada] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const [reportando, setReportando] = useState(false);
  const { notificar } = useAvisos();
  const router = useRouter();

  if (borrada) return null;

  const rutaAutor = (contexto.modo === "app" ? rutaPerfilApp : rutaPerfil)(p.autor.handle);
  const puedeInteractuar = contexto.interaccion === "completa";

  const alAplaudir = async () => {
    if (aplaudiendo) return;
    // Se marca al instante y se deshace si el backend no lo toma.
    const antes = { aplaudida, aplausos };
    setAplaudiendo(true);
    setAplaudida(!antes.aplaudida);
    setAplausos(antes.aplausos + (antes.aplaudida ? -1 : 1));
    const r = await aplaudir(p.id, !antes.aplaudida);
    if (r.ok) {
      setAplaudida(r.estado.aplaudida);
      setAplausos(r.estado.aplausos);
    } else {
      setAplaudida(antes.aplaudida);
      setAplausos(antes.aplausos);
      notificar({ tipo: "error", titulo: r.error });
    }
    setAplaudiendo(false);
  };

  const alBorrar = () => {
    if (!window.confirm("¿Borrar esta publicación? Se borran también sus fotos y comentarios.")) return;
    startBorrar(async () => {
      const r = await borrarPublicacion(p.id);
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      setBorrada(true);
      notificar({ tipo: "exito", titulo: "Publicación borrada" });
    });
  };

  /** Bloquear desde una publicación: se esconde ésta y la pantalla vuelve sin las suyas. */
  const alBloquear = () => {
    const arroba = conArroba(p.autor.handle);
    const seguro = window.confirm(
      `¿Bloquear a ${arroba}?\n\nNo va a ver tu perfil ni lo que publicás, vos no vas a ver lo suyo, y dejan de seguirse. No se le avisa.`
    );
    if (!seguro) return;
    startBorrar(async () => {
      const r = await bloquearPiloto(p.autor.handle);
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      setBorrada(true);
      notificar({ tipo: "exito", titulo: `Bloqueaste a ${arroba}`, detalle: "Lo podés desbloquear desde el Hangar." });
      router.refresh();
    });
  };

  const acciones: AccionDeMenu[] = !puedeInteractuar
    ? []
    : p.es_mia
      ? [{ etiqueta: "Borrar publicación", icono: Trash2, peligro: true, alElegir: alBorrar }]
      : [
          { etiqueta: "Reportar publicación", icono: Flag, alElegir: () => setReportando(true) },
          {
            etiqueta: `Bloquear a ${conArroba(p.autor.handle)}`,
            detalle: "Deja de ver lo tuyo, y vos lo suyo",
            icono: Ban,
            peligro: true,
            alElegir: alBloquear,
          },
        ];

  const accion =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors";
  const accionNeutra =
    "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5";

  /** Aplaudir sin poder: lleva a donde se resuelve (entrar, o crear el @). */
  const aplausoSinPoder =
    contexto.interaccion === "sin-sesion"
      ? "/login"
      : contexto.interaccion === "sin-handle"
        ? "/dashboard/pilotos"
        : null;

  return (
    <article className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-4 md:p-6">
      <header className="flex items-start gap-3">
        <Link href={rutaAutor} className="shrink-0">
          <AvatarPiloto nombre={p.autor.nombre_visible} avatarUrl={p.autor.avatar_url} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={rutaAutor}
            className="block truncate text-sm font-semibold text-zinc-900 dark:text-white hover:underline underline-offset-2"
          >
            {p.autor.nombre_visible}
          </Link>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono truncate">{conArroba(p.autor.handle)}</span>
            {p.autor.licencia && <span>· {p.autor.licencia}</span>}
            {p.fecha_texto && (
              <span>
                ·{" "}
                <time dateTime={p.created_at} title={p.fecha_titulo}>
                  {p.fecha_texto}
                </time>
              </span>
            )}
          </p>
        </div>
        {acciones.length > 0 && (
          <MenuAcciones
            acciones={acciones}
            etiqueta="Más opciones"
            claseBoton="-mr-1.5 -mt-1 p-2 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
          </MenuAcciones>
        )}
      </header>
      {reportando && <DialogoReportar tipo="publicacion" objetivo={p.id} alCerrar={() => setReportando(false)} />}

      <div className="mt-3 space-y-3">
        {p.texto && (
          <p className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
            {p.texto}
          </p>
        )}
        {p.fotos.length > 0 && <GaleriaFotos fotos={p.fotos} autor={conArroba(p.autor.handle)} />}
        {p.vuelo && <ChipVuelo vuelo={p.vuelo} />}
      </div>

      <footer className="mt-3 -ml-2.5 flex items-center gap-2">
        {aplausoSinPoder ? (
          <Link href={aplausoSinPoder} className={`${accion} ${accionNeutra}`} title="Aplaudir">
            <PartyPopper className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="data">{aplausos > 0 ? aplausos : ""}</span>
            <span className="sr-only">Aplaudir ({aplausos})</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void alAplaudir()}
            disabled={contexto.interaccion === "solo-lectura"}
            aria-pressed={aplaudida}
            title={aplaudida ? "Sacar el aplauso" : "Aplaudir"}
            className={`${accion} ${
              aplaudida
                ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10"
                : accionNeutra
            } disabled:pointer-events-none`}
          >
            <PartyPopper className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="data">{aplausos > 0 ? aplausos : ""}</span>
            <span className="sr-only">{aplaudida ? "Aplaudiste" : "Aplaudir"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setVerComentarios((v) => !v)}
          aria-expanded={verComentarios}
          className={`${accion} ${accionNeutra}`}
        >
          <MessageCircle className="w-[18px] h-[18px]" aria-hidden="true" />
          <span className="data">{nComentarios > 0 ? nComentarios : ""}</span>
          <span className="sr-only">{verComentarios ? "Ocultar comentarios" : "Ver comentarios"}</span>
        </button>
      </footer>

      {verComentarios && (
        <ComentariosPublicacion
          publicacionId={p.id}
          contexto={contexto}
          alCambiarCantidad={(delta) => setNComentarios((n) => Math.max(0, n + delta))}
        />
      )}
    </article>
  );
}
