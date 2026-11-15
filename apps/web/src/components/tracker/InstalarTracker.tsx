"use client";

import { Check, Copy, EllipsisVertical, Share } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoTrackerApilado } from "@/components/MarcaTracker";
import { detectarSistema, invitacionDeLaRuta, type DetalleSistema } from "@/lib/tracker-instalar";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * La pantalla de instalar de Vector Tracker. El layout dibuja siempre esta pantalla **y** la app, y CSS
 * (`tracker-app` / `tracker-instalar` en `globals.css`) muestra una sola: en el teléfono, fuera de la app
 * instalada, ésta. Así no hay JavaScript decidiendo (nada parpadea ni discrepa al hidratar, invariante 1).
 *
 * - El sistema se detecta **después de montar**: el server dibuja una versión genérica con las dos.
 * - Esto se monta también escondido (en la compu o ya instalada): no pide nada ni hace nada visible.
 */
export default function InstalarTracker() {
  const pathname = usePathname();
  const invitacion = invitacionDeLaRuta(pathname);
  const [det, setDet] = useState<DetalleSistema | null>(null);
  const evento = useRef<EventoInstalar | null>(null);
  const [hayEvento, setHayEvento] = useState(false);
  const [instalada, setInstalada] = useState(false);
  const [copiado, setCopiado] = useState<"pagina" | "invitacion" | null>(null);

  useEffect(() => {
    setDet(detectarSistema(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0));
    const antes = (e: Event) => {
      e.preventDefault();
      evento.current = e as EventoInstalar;
      setHayEvento(true);
    };
    const despues = () => {
      evento.current = null;
      setHayEvento(false);
      setInstalada(true);
    };
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", despues);
    return () => {
      window.removeEventListener("beforeinstallprompt", antes);
      window.removeEventListener("appinstalled", despues);
    };
  }, []);

  async function copiar(que: "pagina" | "invitacion") {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(que);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      /* sin portapapeles: la persona puede copiar el link de la barra */
    }
  }

  async function instalar() {
    const e = evento.current;
    if (!e) return;
    try {
      await e.prompt();
      const r = await e.userChoice;
      if (r.outcome === "accepted") setInstalada(true);
    } catch {
      /* el navegador no dejó mostrarlo: quedan las instrucciones del menú */
    }
    evento.current = null;
    setHayEvento(false);
  }

  const sistema = det?.sistema ?? null;
  const enOtraApp = det?.enOtraApp ?? false;

  return (
    <div className="tracker-instalar mx-auto min-h-dvh w-full max-w-md flex-col justify-center space-y-8 px-5 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="space-y-4">
        <LogoTrackerApilado className="h-14 w-auto" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight">Instalá Vector Tracker</h1>
        <p className="text-lg leading-snug text-white/80">
          Así te llegan los avisos cuando el avión despega y cuando aterriza, y lo abrís con un toque desde el inicio de tu teléfono.
        </p>
      </div>

      {instalada ? (
        <p role="status" className="flex items-start gap-3 text-xl font-bold leading-snug text-aviation-cyan">
          <Check className="mt-1 h-6 w-6 shrink-0" aria-hidden />
          Listo: abrila desde el ícono de Vector Tracker.
        </p>
      ) : (
        <>
          {enOtraApp && (
            <div className="space-y-3 border-t border-white/10 pt-5">
              <h2 className="text-2xl font-bold leading-snug">Abrí este link en {det?.navegadorSugerido}</h2>
              <p className="text-lg leading-snug text-white/80">
                Estás en el navegador de otra aplicación y desde acá no se puede instalar. Copiá el link, abrí {det?.navegadorSugerido} y pegalo.
              </p>
              <BotonCopiar onClick={() => void copiar("pagina")} hecho={copiado === "pagina"} texto="Copiar el link" />
            </div>
          )}

          {(sistema === "ios" || sistema === null || sistema === "otro") && !(enOtraApp && sistema === "ios") && (
            <section className="space-y-4 border-t border-white/10 pt-5" aria-label="En iPhone">
              {sistema === null && <h2 className="text-2xl font-bold">En iPhone (Safari)</h2>}
              <Pasos
                pasos={[
                  <>
                    Tocá <Share className="mx-1 inline h-6 w-6 -translate-y-0.5 text-aviation-cyan" aria-label="Compartir" /> <b>Compartir</b>, abajo en la pantalla.
                  </>,
                  <>
                    Elegí <b>Agregar a inicio</b>.
                  </>,
                  <>Abrí Vector Tracker desde el ícono nuevo.</>,
                ]}
              />
            </section>
          )}

          {(sistema === "android" || sistema === null) && !(enOtraApp && sistema === "android") && (
            <section className="space-y-4 border-t border-white/10 pt-5" aria-label="En Android">
              {sistema === null && <h2 className="text-2xl font-bold">En Android (Chrome)</h2>}
              {hayEvento ? (
                <button
                  type="button"
                  onClick={() => void instalar()}
                  className="flex min-h-14 w-full items-center justify-center rounded-full bg-aviation-cyan px-6 text-lg font-bold text-noche transition-colors hover:bg-sky-300"
                >
                  Instalar
                </button>
              ) : (
                <Pasos
                  pasos={[
                    <>
                      Tocá el menú <EllipsisVertical className="mx-0.5 inline h-6 w-6 -translate-y-0.5 text-aviation-cyan" aria-label="tres puntos" /> de arriba a la derecha.
                    </>,
                    <>
                      Elegí <b>Instalar app</b> (o <b>Agregar a la pantalla principal</b>).
                    </>,
                    <>Abrí Vector Tracker desde el ícono nuevo.</>,
                  ]}
                />
              )}
            </section>
          )}
        </>
      )}

      {invitacion && !instalada && (
        <div className="space-y-3 border-t border-white/10 pt-5">
          <p className="text-lg leading-snug text-white/80">Tu invitación sigue guardada. Si al abrir la app no aparece, pegá el link que te mandaron.</p>
          <BotonCopiar onClick={() => void copiar("invitacion")} hecho={copiado === "invitacion"} texto="Copiar el link de invitación" />
        </div>
      )}

      <p className="border-t border-white/10 pt-5 text-base leading-snug text-white/60">¿Ya la instalaste? Abrila desde el ícono de Vector Tracker en tu inicio.</p>
    </div>
  );
}

function Pasos({ pasos }: { pasos: React.ReactNode[] }) {
  return (
    <ol className="space-y-4">
      {pasos.map((p, i) => (
        <li key={i} className="flex items-start gap-4 text-xl leading-snug">
          <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-aviation-cyan font-mono text-base font-bold text-aviation-cyan">
            {i + 1}
          </span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
  );
}

function BotonCopiar({ onClick, hecho, texto }: { onClick: () => void; hecho: boolean; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full border border-white/25 px-6 text-lg font-bold text-white transition-colors hover:bg-white/10"
    >
      {hecho ? <Check className="h-5 w-5 text-aviation-cyan" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
      {hecho ? "Copiado" : texto}
    </button>
  );
}
