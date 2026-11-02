"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { DURACION_MS, agregarAviso, quitarAviso, visibles, type Aviso } from "@/lib/avisos";

/**
 * El aviso de "esto se guardó", disponible en cualquier pantalla del dashboard.
 *
 * ## Por qué existe
 *
 * Ninguna mutación de esta app confirmaba que salió bien — ni un vuelo, ni una
 * aeronave, ni un documento. El único indicio era que la lista cambiaba, y en el
 * alta de vuelo ni eso: `logFlight` pintaba directamente un cartel de error
 * (`NEXT_REDIRECT`) en cada carga exitosa, porque Next rechaza la promesa de una
 * server action que redirige. Arreglar eso —que el formulario deje de mentir— no
 * alcanzaba solo: seguía sin haber ninguna confirmación real en su lugar.
 *
 * ## Por qué un componente propio y no una librería
 *
 * No hay ninguna en el repo (`sonner`, `react-hot-toast`, etc.), y agregar una
 * dependencia para mostrar un cartel con un ícono y un botón de cerrar es más
 * superficie de la que este caso pide. El molde visual —borde de color, ícono,
 * título, detalle— es el mismo que ya usan `SinConexionBanner` y
 * `VistoPorUltimaVez`; esto sólo lo agrega apilado y con salida sola.
 *
 * ## Dónde vive el criterio
 *
 * En `src/lib/avisos.ts`: la cola, el tope de visibles y cuánto dura cada tipo son
 * puros y están testeados. Acá sólo el montaje, la animación y el temporizador de
 * cada aviso — plomería que no se puede testear (`vitest` corre en
 * `environment: "node"`, sin DOM), así que se mantiene lo más chica posible.
 */

interface ContextoAvisos {
  notificar: (aviso: Omit<Aviso, "id">) => void;
}

const Contexto = createContext<ContextoAvisos | null>(null);

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [cola, setCola] = useState<Aviso[]>([]);
  // Un timer por aviso, para poder cancelarlo si se cierra a mano antes de tiempo
  // — sin esto, cerrar el cartel y que igual salte su propio `quitarAviso` más
  // tarde no rompe nada, pero es un timer que sobrevive sin motivo.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reducido = useReducedMotion();

  const quitar = useCallback((id: string) => {
    setCola((c) => quitarAviso(c, id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notificar = useCallback(
    (nuevo: Omit<Aviso, "id">) => {
      const id = crypto.randomUUID();
      setCola((c) => agregarAviso(c, { ...nuevo, id }));
      timers.current.set(
        id,
        setTimeout(() => quitar(id), DURACION_MS[nuevo.tipo])
      );
    },
    [quitar]
  );

  return (
    <Contexto.Provider value={{ notificar }}>
      {children}

      {/*
        `z-[200]`, por encima de los modales (`z-[100]`) a propósito: un vuelo
        también se carga desde el modal que cierra una sesión en vivo, y el aviso
        tiene que seguir visible cuando el modal ya se cerró — así que no puede
        quedar atrapado debajo de nada que esté por desaparecer.

        `aria-live="polite"` para que un lector de pantalla lo anuncie sin
        interrumpir lo que estuviera leyendo.
      */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 left-4 sm:left-auto z-[200] flex flex-col gap-2 pointer-events-none sm:w-[22rem]"
      >
        <AnimatePresence initial={false}>
          {visibles(cola).map((aviso) => (
            <motion.div
              key={aviso.id}
              layout
              initial={reducido ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducido ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl bg-white/95 dark:bg-[#111111]/95 ${
                aviso.tipo === "exito"
                  ? "border-emerald-500/25"
                  : "border-red-500/25"
              }`}
            >
              {aviso.tipo === "exito" ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{aviso.titulo}</p>
                {aviso.detalle && (
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5 truncate">
                    {aviso.detalle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => quitar(aviso.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 -m-1 p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos(): ContextoAvisos {
  const contexto = useContext(Contexto);
  if (!contexto) {
    // Un aviso es una cortesía, no algo de lo que dependa el flujo: si por lo que
    // sea el provider no está montado, la mutación tiene que poder seguir su
    // curso igual. El error queda en consola para que no pase inadvertido en
    // desarrollo.
    console.error("useAvisos() se usó fuera de <AvisosProvider>.");
    return { notificar: () => {} };
  }
  return contexto;
}
