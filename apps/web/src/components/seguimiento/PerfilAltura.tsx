import { conMiles } from "@/lib/seguimiento";
import type { PuntoPerfil } from "@/lib/seguimiento-calculos";
import { duracion } from "@/lib/seguimiento-calculos";

/**
 * El perfil de altura: la altura GPS en el tiempo, un SVG a mano (sin librerías). Con menos de tres
 * puntos con altura no se dibuja nada y se dice por qué (invariante 2: no sé).
 */

const W = 320;
const H = 96;
const PAD = { l: 4, r: 4, t: 8, b: 6 };

export default function PerfilAltura({ puntos }: { puntos: PuntoPerfil[] }) {
  if (puntos.length < 3) {
    return <p className="text-sm text-white/70">El perfil de altura aparece cuando llegan más posiciones.</p>;
  }
  const tMax = Math.max(1, puntos[puntos.length - 1].t);
  const alts = puntos.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  // Un piso de 200 ft de rango para que un vuelo nivelado no se dibuje como una montaña.
  const rango = Math.max(200, max - min);
  const base = min - (rango - (max - min)) / 2;
  const x = (t: number) => PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const y = (a: number) => PAD.t + (1 - (a - base) / rango) * (H - PAD.t - PAD.b);
  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.alt).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(tMax).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`;
  const ultimo = puntos[puntos.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`Perfil de altura: entre ${conMiles(min)} y ${conMiles(max)} pies en los últimos ${duracion(tMax)}.`}>
        <path d={area} fill="#38bdf8" fillOpacity="0.16" />
        <path d={linea} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(ultimo.t)} cy={y(ultimo.alt)} r="4" fill="#fff" stroke="#38bdf8" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[11px] text-white/70">
        <span>hace {duracion(tMax)}</span>
        <span>
          {conMiles(min)}–{conMiles(max)} ft
        </span>
        <span>ahora</span>
      </figcaption>
    </figure>
  );
}
