"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Route, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import StyledSelect from "./StyledSelect";

/**
 * Una aerovía en la ruta: una **franja entre dos puntos**, no un campo de texto más.
 *
 * ## Por qué no es un campo
 *
 * La primera versión de esta feature trataba a la aerovía como un punto: se escribía
 * `BCA W67 OSA` en el campo de pegar la ruta y al aplicarse **desaparecía**, dejando los
 * cuatro puntos sueltos. Tres cosas salían mal de ahí:
 *
 * 1. Había que **saberse la aerovía de memoria** —o tener la carta al lado— para saber que
 *    pasa por BCA y que del otro lado está OSA. La pantalla existe justamente para no
 *    tener que hacer eso.
 * 2. Vivía escondida en un campo secundario, con una sintaxis que no se anuncia sola.
 * 3. Al expandirse se perdía: cambiar el punto de salida obligaba a borrar once campos a
 *    mano.
 *
 * Una aerovía **no es un punto, es un tramo**. Acá es lo que parece: una banda entre el
 * punto anterior y el siguiente, con su designador, hasta dónde llega y cuántos puntos
 * agrega — desplegable para ver cuáles.
 *
 * ## Se elige, no se escribe
 *
 * Los dos desplegables se llenan desde `/api/aerovias?punto=<el punto anterior>`: primero
 * las aerovías que **realmente pasan por ahí**, después los puntos a los que **realmente
 * se llega**. No hay forma de componer un tramo que no exista.
 */

interface AeroviaDisponible {
  designador: string;
  puntos: string[];
  /** A dónde se puede ir desde el punto de entrada. Todos menos él. */
  salidas: string[];
}

export default function TramoAerovia({
  desde,
  aerovia,
  hasta,
  intermedios,
  error,
  onCambiar,
  onQuitar,
}: {
  /** El punto anterior de la ruta. Sin él no hay nada que ofrecer. */
  desde: string;
  aerovia: string;
  /** El punto siguiente de la ruta, que es la salida del tramo. */
  hasta: string;
  /** Los puntos que la aerovía agrega, para poder listarlos. */
  intermedios: string[];
  error: string | null;
  onCambiar: (aerovia: string, hasta: string) => void;
  onQuitar: () => void;
}) {
  const [disponibles, setDisponibles] = useState<AeroviaDisponible[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!desde) {
      setDisponibles([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    (async () => {
      try {
        const res = await fetch(`/api/aerovias?punto=${encodeURIComponent(desde)}`);
        if (!res.ok) return;
        const datos = await res.json();
        if (!cancelado) setDisponibles(datos.aerovias ?? []);
      } catch {
        // Sin señal se deja lo último que había. Misma regla que el resto de la pantalla.
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [desde]);

  const elegida = disponibles.find((a) => a.designador === aerovia);
  const salidas = elegida?.salidas ?? (hasta ? [hasta] : []);

  return (
    <div
      className={`rounded-2xl border px-3.5 py-3 space-y-2.5 ${
        error
          ? "border-amber-500/30 bg-amber-500/[0.06]"
          : "border-aviation-blue/25 bg-aviation-blue/[0.04] dark:bg-aviation-blue/[0.07]"
      }`}
    >
      <div className="flex items-center gap-2">
        <Route className="w-3.5 h-3.5 shrink-0 text-aviation-blue" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-aviation-blue">
          Por aerovía
        </span>
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar la aerovía ${aerovia || ""}`}
          className="ml-auto p-1.5 -mr-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StyledSelect
          name="aerovia"
          value={aerovia}
          onChange={(v) => {
            /*
              Al cambiar de aerovía el punto de salida casi nunca sigue sirviendo, así que
              se propone el último de la nueva en vez de dejar uno inválido esperando a que
              el piloto lo note.
            */
            const nueva = disponibles.find((a) => a.designador === v);
            onCambiar(v, nueva?.salidas.includes(hasta) ? hasta : (nueva?.salidas.at(-1) ?? ""));
          }}
          options={[
            { value: "", label: cargando ? "Buscando…" : disponibles.length ? "Elegí una" : "Ninguna por acá" },
            ...disponibles.map((a) => ({ value: a.designador, label: a.designador })),
          ]}
        />
        <StyledSelect
          name="hasta"
          value={hasta}
          onChange={(v) => onCambiar(aerovia, v)}
          options={[
            { value: "", label: "Hasta…" },
            ...salidas.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>

      {error ? (
        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-500">{error}</p>
      ) : aerovia && hasta ? (
        <div>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
            {/*
              Con cero puntos no se dice "0 puntos en el medio", que suena a que algo no
              cargó: se dice que los dos son contiguos, que es lo que pasa y es información
              útil —significa que la aerovía no aporta nada ahí—.
            */}
            {intermedios.length === 0
              ? `${desde} y ${hasta} son contiguos`
              : `${intermedios.length} ${intermedios.length === 1 ? "punto" : "puntos"} en el medio`}
          </button>
          <AnimatePresence>
            {abierto && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden data text-[11px] text-zinc-500 dark:text-zinc-400 pt-1.5 leading-relaxed"
              >
                {[desde, ...intermedios, hasta].join(" → ")}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
