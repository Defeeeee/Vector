"use client";

import { useState } from "react";
import { Copy, Loader2, Send, Smartphone } from "lucide-react";
import { invitarSeguidor, quitarSeguidor } from "@/actions/seguidores";
import { estadoDeSeguidor, rotuloDeSeguidor, TEXTO_DE_INVITACION, type Seguidor } from "@/lib/seguidores";

/**
 * "Quiénes siguen tus vuelos" (migración 056): invitar a la familia a **Vector Tracker**
 * (tracker.vectoraero.ar) con un link de un solo uso que el piloto manda por donde quiera, ver quién
 * ya entró y quitar a alguien (o anular un link sin usar).
 *
 * - El link vence a los 7 días y sirve una sola vez: lo abre alguien, entra con Google y queda. Se
 *   manda con el menú de compartir del teléfono (o se copia), como los otros links.
 * - **Un seguidor no ve nada hasta que le asignás un vuelo**: eso se hace en cada vuelo de "Lo que
 *   estás compartiendo" (`ChipsDeSeguidores`).
 * - Quitar corta el acceso al instante y pide confirmación.
 * - `seguidores === null`: no se pudo leer; no se dice "no tenés".
 */

const ROTULO = "font-mono text-[10px] font-bold uppercase tracking-wider";
const CAMPO = "w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-aviation-cyan focus:outline-none";

async function mandar(link: string): Promise<"compartido" | "cancelado" | "copiado" | "manual"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Seguí mis vuelos", text: TEXTO_DE_INVITACION, url: link });
      return "compartido";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return "copiado";
  } catch {
    return "manual";
  }
}

export default function SeguidoresDelTracker({ inicial }: { inicial: Seguidor[] | null }) {
  // La lista es del server (se revalida al escribir): acá sólo el borrador y lo que está pasando.
  const seguidores = inicial;
  const [apodo, setApodo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const decir = (m: Awaited<ReturnType<typeof mandar>>, link: string) => {
    if (m === "copiado") setAviso("Link copiado. Pegalo en el chat donde se lo quieras mandar.");
    else if (m === "manual") setAviso(link);
    else setAviso(null);
  };

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creando) return;
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await invitarSeguidor(apodo);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setApodo("");
      if (r.seguidor.link) decir(await mandar(r.seguidor.link), r.seguidor.link);
    } finally {
      setCreando(false);
    }
  };

  const quitar = async (s: Seguidor) => {
    setQuitando(s.id);
    setError(null);
    try {
      const r = await quitarSeguidor(s.id);
      if ("error" in r) setError(r.error);
      setConfirmando(null);
    } finally {
      setQuitando(null);
    }
  };

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setAviso("Link copiado.");
    } catch {
      setAviso(link);
    }
  };

  return (
    <section className="space-y-5 border-t border-white/10 pt-8" aria-label="Quiénes siguen tus vuelos">
      <div className="space-y-1.5">
        <p className={`${ROTULO} text-zinc-500`}>Quiénes siguen tus vuelos</p>
        <p className="max-w-2xl text-sm text-zinc-400">
          Mandales un link de invitación: entran con Google en <strong className="font-semibold text-white">tracker.vectoraero.ar</strong> y ven los vuelos que vos les asignes, con aviso cuando despegás
          y aterrizás. El link sirve una sola vez y dura 7 días. Los podés quitar cuando quieras.
        </p>
      </div>

      {seguidores === null ? (
        <p className="text-sm text-amber-300">No pudimos leer quiénes te siguen. Probá de nuevo en un rato.</p>
      ) : (
        seguidores.length > 0 && (
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {seguidores.map((s) => (
              <li key={s.id} className="space-y-1.5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-base font-semibold text-white">{rotuloDeSeguidor(s)}</span>
                  <span className={`${ROTULO} ${s.vinculado ? "text-aviation-cyan" : s.vencida ? "text-amber-300" : "text-zinc-400"}`}>{estadoDeSeguidor(s)}</span>
                </div>
                {!s.vinculado && s.venceTexto && !s.vencida && <p className="text-xs text-zinc-500">El link vence el {s.venceTexto}.</p>}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {s.link && !s.vencida && (
                    <>
                      <button type="button" onClick={async () => decir(await mandar(s.link as string), s.link as string)} className={`${ROTULO} inline-flex min-h-9 items-center gap-1.5 text-aviation-cyan hover:underline`}>
                        <Send className="h-3 w-3" /> Mandar el link
                      </button>
                      <button type="button" onClick={() => void copiar(s.link as string)} className={`${ROTULO} inline-flex min-h-9 items-center gap-1.5 text-zinc-400 hover:text-white`}>
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </>
                  )}
                  {confirmando === s.id ? (
                    <span className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
                      {s.vinculado ? "¿Quitarlo? Deja de ver todo ya." : "¿Anular este link?"}
                      <button type="button" disabled={quitando === s.id} onClick={() => void quitar(s)} className={`${ROTULO} min-h-9 text-red-400 hover:text-red-300 disabled:opacity-50`}>
                        {quitando === s.id ? "Quitando…" : s.vinculado ? "Sí, quitar" : "Sí, anular"}
                      </button>
                      <button type="button" onClick={() => setConfirmando(null)} className={`${ROTULO} min-h-9 text-zinc-400 hover:text-white`}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmando(s.id)} className={`${ROTULO} min-h-9 text-red-400 hover:text-red-300`}>
                      {s.vinculado ? "Quitar" : "Anular el link"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      {aviso && (aviso.startsWith("http") ? <input readOnly value={aviso} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 font-mono text-xs text-white/80" /> : <p className="text-xs text-zinc-400">{aviso}</p>)}

      <form onSubmit={invitar} className="flex max-w-2xl flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1 space-y-1.5">
          <span className={`${ROTULO} text-zinc-500`}>Para quién (sólo lo ves vos)</span>
          <input value={apodo} onChange={(e) => setApodo(e.target.value)} maxLength={40} placeholder="Mamá" className={CAMPO} />
        </label>
        <button type="submit" disabled={creando || seguidores === null} className="inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-5 py-2.5 text-sm font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-40">
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          {creando ? "Creando el link…" : "Invitar con un link"}
        </button>
      </form>
      {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
    </section>
  );
}
