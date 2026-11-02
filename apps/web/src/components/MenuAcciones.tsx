"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface AccionDeMenu {
  etiqueta: string;
  /** Una línea chica debajo, para lo que no se entiende sólo con la etiqueta. */
  detalle?: string;
  icono?: LucideIcon;
  /** Para lo que borra, bloquea o reporta: va en rojo. */
  peligro?: boolean;
  /** Un link, o una acción: una de las dos. */
  href?: string;
  alElegir?: () => void;
}

/**
 * Un menú de acciones que se abre desde un botón: exportar la Bitácora, y el "···" de un
 * perfil, una publicación o un comentario.
 *
 * Se cierra al elegir, con Escape o tocando afuera, y se recorre con las flechas: es un
 * `role="menu"` de verdad, no un `div` que se prende. Las acciones que no aplican no se
 * pasan, en lugar de dibujarse deshabilitadas: un menú corto se lee de un vistazo.
 */
export default function MenuAcciones({
  acciones,
  etiqueta,
  children,
  alinear = "derecha",
  claseBoton = "",
}: {
  acciones: AccionDeMenu[];
  /** El nombre accesible del botón ("Más opciones", "Exportar"). */
  etiqueta: string;
  /** Lo que se ve en el botón: un ícono, o un ícono y un texto. */
  children: ReactNode;
  alinear?: "derecha" | "izquierda";
  claseBoton?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const menu = useRef<HTMLDivElement>(null);
  const [corrimiento, setCorrimiento] = useState(0);
  const id = useId();

  // En el teléfono el botón puede estar cerca de un borde: el menú, anclado a él, se salía de
  // la pantalla (Federico, 2026-10-28, con Exportar). Se corre lo justo para quedar adentro,
  // con 16 px de margen. `translate` (no `transform`) para no pisar la animación.
  useLayoutEffect(() => {
    if (!abierto) {
      setCorrimiento(0);
      return;
    }
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    const margen = 16;
    if (r.left < margen) setCorrimiento(margen - r.left);
    else if (r.right > window.innerWidth - margen) setCorrimiento(window.innerWidth - margen - r.right);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    // Al abrir, el foco va a la primera acción: con teclado se sigue con las flechas.
    requestAnimationFrame(() => items.current[0]?.focus());
    const afuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    return () => document.removeEventListener("pointerdown", afuera);
  }, [abierto]);

  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (!abierto) return;
    // `isConnected`: si la lista se achicó, quedan refs de acciones que ya no están.
    const lista = items.current.filter((x): x is HTMLElement => !!x?.isConnected);
    const actual = lista.indexOf(document.activeElement as HTMLElement);
    const mover = (i: number) => {
      e.preventDefault();
      lista[(i + lista.length) % lista.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar(true);
    } else if (e.key === "ArrowDown") mover(actual + 1);
    else if (e.key === "ArrowUp") mover(actual - 1);
    else if (e.key === "Home") mover(0);
    else if (e.key === "End") mover(lista.length - 1);
    else if (e.key === "Tab") setAbierto(false);
  };

  if (acciones.length === 0) return null;

  const claseItem = (peligro?: boolean) =>
    `w-full flex items-start gap-3 px-3.5 py-2.5 text-left outline-none transition-colors ${
      peligro
        ? "text-red-600 dark:text-red-400 hover:bg-red-50 focus:bg-red-50 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10"
        : "text-zinc-900 dark:text-white hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-white/10 dark:focus:bg-white/10"
    }`;

  const contenido = (a: AccionDeMenu) => {
    const Icono = a.icono;
    return (
      <>
        {Icono && <Icono className="w-4 h-4 mt-0.5 shrink-0 opacity-70" aria-hidden="true" />}
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{a.etiqueta}</span>
          {a.detalle && (
            <span
              className={`block text-[12px] leading-snug ${
                a.peligro ? "text-red-500/80 dark:text-red-400/80" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {a.detalle}
            </span>
          )}
        </span>
      </>
    );
  };

  return (
    <div ref={contenedor} className="relative" onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setAbierto((a) => !a)}
        className={claseBoton}
      >
        {children}
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            ref={menu}
            id={id}
            role="menu"
            style={{ translate: `${corrimiento}px 0` }}
            aria-label={etiqueta}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-40 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] py-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-2xl overflow-hidden ${
              alinear === "derecha" ? "right-0" : "left-0"
            }`}
          >
            {acciones.map((a, i) =>
              a.href ? (
                <Link
                  key={a.etiqueta}
                  ref={(el) => {
                    items.current[i] = el;
                  }}
                  role="menuitem"
                  href={a.href}
                  onClick={() => cerrar(false)}
                  className={claseItem(a.peligro)}
                >
                  {contenido(a)}
                </Link>
              ) : (
                <button
                  key={a.etiqueta}
                  ref={(el) => {
                    items.current[i] = el;
                  }}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    cerrar(true);
                    a.alElegir?.();
                  }}
                  className={claseItem(a.peligro)}
                >
                  {contenido(a)}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
