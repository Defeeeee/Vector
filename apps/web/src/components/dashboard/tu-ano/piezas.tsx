"use client";

import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { formatearNumero, proyectarPuntos, type TuAno } from "@/lib/tu-ano";

/** Las piezas con las que se arman las historias de "Tu año en vuelo". */

/** Un número que sube contando. Con movimiento reducido (o sin animación posible) muestra el final. */
export function Contador({
  valor,
  decimales = 0,
  retraso = 0.25,
  className,
}: {
  valor: number;
  decimales?: number;
  retraso?: number;
  className?: string;
}) {
  const reducido = useReducedMotion();
  const [v, setV] = useState(reducido ? valor : 0);
  useEffect(() => {
    if (reducido) {
      setV(valor);
      return;
    }
    const c = animate(0, valor, { duration: 1.5, delay: retraso, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [valor, reducido, retraso]);
  return (
    <>
      <span aria-hidden="true" className={className}>
        {formatearNumero(v, decimales)}
      </span>
      {/* El número final para quien lee la pantalla: el que sube no se anuncia. */}
      <span className="sr-only">{formatearNumero(valor, decimales)}</span>
    </>
  );
}

/** Entra de abajo con un fundido, escalonado por `retraso`. */
export function Aparece({ retraso = 0, children, className }: { retraso?: number; children: ReactNode; className?: string }) {
  const reducido = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reducido ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: retraso, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** El rótulo chico en mono de arriba de cada historia. */
export function Rotulo({ children, color }: { children: ReactNode; color: string }) {
  return (
    <p className="font-mono text-[3.4cqw] font-semibold uppercase tracking-[0.18em]" style={{ color }}>
      {children}
    </p>
  );
}

/** El número enorme: display extrabold, apretado. */
export const NUMERO = "font-display font-extrabold leading-[0.9] tracking-[-0.07em] tabular-nums";
/** La frase corta de abajo. */
export const FRASE = "font-display font-bold text-[5.4cqw] leading-[1.18] tracking-[-0.02em] text-white/85 text-pretty";

const INICIALES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Las horas de cada mes, en barras. El mes más alto, en el color de la historia. */
export function BarrasPorMes({ horasPorMes, acento }: { horasPorMes: number[]; acento: string }) {
  const reducido = useReducedMotion();
  const max = Math.max(...horasPorMes, 0.1);
  const top = horasPorMes.indexOf(Math.max(...horasPorMes));
  return (
    <div className="w-full">
      <div className="flex items-end gap-[2.2cqw] h-[44cqw]" role="img" aria-label="Horas voladas por mes">
        {horasPorMes.map((h, i) => (
          <div key={i} className="flex-1 h-full flex items-end">
            <motion.div
              className="w-full rounded-t-[1.4cqw] origin-bottom"
              style={{ height: `${Math.max((h / max) * 100, h > 0 ? 3 : 0.8)}%`, background: i === top ? acento : "rgba(255,255,255,0.22)" }}
              initial={reducido ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.8, delay: 0.3 + i * 0.045, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2.2cqw] mt-[2cqw]">
        {INICIALES.map((l, i) => (
          <span key={i} className="flex-1 text-center font-mono text-[3cqw] font-semibold" style={{ color: i === top ? acento : "rgba(255,255,255,0.45)" }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Los aeródromos del año como puntos, sin mapa de fondo: la forma de tu año. */
export function MapaDePuntos({ mapa, base, acento }: { mapa: TuAno["mapa"]; base: string | null; acento: string }) {
  const reducido = useReducedMotion();
  const W = 320;
  const H = 300;
  const xy = proyectarPuntos(mapa.puntos, W, H, 30);
  const iBase = base ? mapa.puntos.findIndex((p) => p.codigo === base) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Mapa con ${mapa.puntos.length} aeródromos`}>
      {mapa.tramos.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={xy[a].x} y1={xy[a].y} x2={xy[b].x} y2={xy[b].y}
          stroke={acento} strokeOpacity={0.45} strokeWidth={1.2}
          initial={reducido ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.5 + i * 0.06 }}
        />
      ))}
      {xy.map((p, i) => (
        <motion.circle
          key={mapa.puntos[i].codigo}
          cx={p.x} cy={p.y} r={i === iBase ? 6 : 3.6}
          fill={i === iBase ? acento : "#ffffff"}
          initial={reducido ? false : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          transition={{ duration: 0.4, delay: 0.3 + i * 0.05 }}
        />
      ))}
      {iBase >= 0 && (
        <>
          <circle cx={xy[iBase].x} cy={xy[iBase].y} r={12} fill="none" stroke={acento} strokeOpacity={0.6} strokeWidth={1.2} />
          <text x={xy[iBase].x} y={xy[iBase].y - 18} textAnchor="middle" fill={acento} fontSize="11" fontWeight={600} style={{ fontFamily: "var(--font-mono-face), ui-monospace, monospace" }}>
            {mapa.puntos[iBase].codigo}
          </text>
        </>
      )}
    </svg>
  );
}
