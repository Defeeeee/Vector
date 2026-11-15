"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Crosshair, Pause, Play, X } from "lucide-react";
import { aMagnetico } from "@/lib/navegacion";
import { estadoEn, finDe, hhmmssArgentina, inicioDe, perfilDeAltura, transcurrido, type PerfilDeAltura, type SerieVuelo } from "@/lib/reproducir-vuelo";

/** Leaflet toca `window` al importarse: entra por `dynamic`, como los otros mapas. */
const ReproducirVueloMapa = dynamic(() => import("./ReproducirVueloMapa"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-noche" />,
});

const ROTULO = "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";
const VIOLETA = "#c084fc";
const VELOCIDADES = [10, 30, 60, 120] as const;
const POR_DEFECTO = 30;

const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Pies por minuto, de a 50, con su signo. */
function textoVario(v: number | null): string {
  if (v === null) return "—";
  const r = Math.round(v / 50) * 50;
  return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${miles(Math.abs(r))}`;
}

function Lectura({ rotulo, valor, unidad }: { rotulo: string; valor: string; unidad?: string }) {
  return (
    <div className="min-w-0 text-center">
      {/* La unidad va en el rótulo y no al lado del número: en 380 px "2.530 ft" no entraba. */}
      <p className={ROTULO}>
        {rotulo}
        {unidad && <span className="ml-1 text-zinc-600">{unidad}</span>}
      </p>
      <p className="text-base sm:text-lg font-bold tabular-nums text-white leading-tight whitespace-nowrap">{valor}</p>
    </div>
  );
}

const ANCHO = 300;
const ALTO = 100;

/** Los tramos de datos seguidos de una serie con huecos (null). */
function corridas(puntos: [number, number | null, number | null][], i: 1 | 2): [number, number][][] {
  const salida: [number, number][][] = [];
  let actual: [number, number][] = [];
  for (const p of puntos) {
    const v = p[i];
    if (v === null) {
      if (actual.length) salida.push(actual);
      actual = [];
    } else actual.push([p[0], v]);
  }
  if (actual.length) salida.push(actual);
  return salida;
}

/**
 * El perfil: la altura como área cian, la GS como línea violeta con su propia escala, los cortes
 * sombreados. SVG que se estira (`none`) con los trazos de ancho fijo; los rótulos van en HTML
 * para que no se deformen. Tocar o arrastrar salta a ese instante.
 */
const Perfil = memo(function Perfil({ perfil, t, onT }: { perfil: PerfilDeAltura; t: number; onT: (t: number) => void }) {
  const { t0, t1 } = perfil;
  const span = Math.max(1, t1 - t0);
  const x = (tt: number) => ((tt - t0) / span) * ANCHO;
  const geometria = useMemo(() => {
    const altTecho = Math.max(perfil.altMax ?? 0, 500) * 1.1;
    const gsTecho = Math.max(perfil.gsMax ?? 0, 30) * 1.1;
    const yAlt = (v: number) => ALTO - 2 - (Math.max(0, v) / altTecho) * (ALTO - 6);
    const yGs = (v: number) => ALTO - 2 - (Math.max(0, v) / gsTecho) * (ALTO - 6);
    const areas = corridas(perfil.puntos, 1).map((c) => {
      const linea = c.map(([tt, v]) => `${x(tt).toFixed(1)},${yAlt(v).toFixed(1)}`).join(" L");
      return `M${x(c[0][0]).toFixed(1)},${ALTO} L${linea} L${x(c[c.length - 1][0]).toFixed(1)},${ALTO} Z`;
    });
    const lineasGs = corridas(perfil.puntos, 2).map((c) => "M" + c.map(([tt, v]) => `${x(tt).toFixed(1)},${yGs(v).toFixed(1)}`).join(" L"));
    return { areas, lineasGs };
  }, [perfil]);

  const saltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    onT(t0 + k * span);
  };

  return (
    <div className="space-y-1">
      {/* Los máximos arriba del gráfico y no encima: sobre la curva no se leían. */}
      <div className="flex justify-between font-mono text-[10px]">
        <span className="text-aviation-cyan">{perfil.altMax !== null ? `ALT máx ${miles(perfil.altMax)} ft` : ""}</span>
        <span style={{ color: VIOLETA }}>{perfil.gsMax !== null ? `GS máx ${Math.round(perfil.gsMax)} kt` : ""}</span>
      </div>
      <div
        className="relative h-[84px] sm:h-[100px] touch-none select-none cursor-pointer"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          saltar(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) saltar(e);
        }}
        aria-hidden="true"
      >
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {perfil.huecos.map(([a, b]) => (
            <rect key={a} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={ALTO} fill="#f59e0b" opacity={0.16} />
          ))}
          {geometria.areas.map((d, i) => (
            <path key={i} d={d} fill="#38bdf8" fillOpacity={0.35} stroke="#38bdf8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          {geometria.lineasGs.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={VIOLETA} strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          <line x1={x(t)} x2={x(t)} y1={0} y2={ALTO} stroke="#ffffff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
});

/**
 * Repasar el vuelo (3.40.0): a pantalla completa, el avión se mueve por su recorrido con una línea
 * de tiempo, play y pausa, velocidades y un perfil de altura que se toca para saltar. Sirve para
 * el debrief con el instructor; la serie sale del ADS-B de la bitácora o del track del GPS.
 *
 * Va en un portal sobre `body`: la página entra con un `transform` y lo `fixed` quedaría adentro.
 * Y como los eventos de React atraviesan los portales, frena los clicks: si no, la tarjeta del
 * vuelo, que se abre y se cierra con un click, los tomaría.
 */
export default function ReproducirVuelo({
  serie,
  titulo,
  variacionW,
  onCerrar,
}: {
  serie: SerieVuelo;
  titulo: string;
  variacionW: number | null;
  onCerrar: () => void;
}) {
  const t0 = inicioDe(serie);
  const t1 = finDe(serie);
  const [t, setT] = useState(t0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState<number>(POR_DEFECTO);
  const [seguir, setSeguir] = useState(false);
  const [montado, setMontado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const tRef = useRef(t0);
  const velRef = useRef<number>(POR_DEFECTO);
  const playRef = useRef(false);
  velRef.current = velocidad;
  playRef.current = reproduciendo;

  useEffect(() => setMontado(true), []);

  const ir = useCallback(
    (nuevo: number) => {
      const v = Math.max(t0, Math.min(t1, nuevo));
      tRef.current = v;
      setT(v);
    },
    [t0, t1],
  );

  // El cuadro a cuadro: dt real × velocidad. Al llegar al final, se pausa.
  useEffect(() => {
    if (!reproduciendo) return;
    let id = 0;
    let anterior = performance.now();
    const cuadro = (ahora: number) => {
      const dt = Math.min(ahora - anterior, 250);
      anterior = ahora;
      const siguiente = tRef.current + dt * velRef.current;
      if (siguiente >= t1) {
        tRef.current = t1;
        setT(t1);
        setReproduciendo(false);
        return;
      }
      tRef.current = siguiente;
      setT(siguiente);
      id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [reproduciendo, t1]);

  const alternar = useCallback(() => {
    if (playRef.current) {
      setReproduciendo(false);
      return;
    }
    // Play desde el final: vuelve al principio.
    if (tRef.current >= t1) {
      tRef.current = t0;
      setT(t0);
    }
    setReproduciendo(true);
  }, [t0, t1]);

  // Esc, espacio y flechas. En captura, para que ningún otro oyente se los lleve.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
      } else if (e.key === " " || e.code === "Space") {
        // Sobre un botón, el espacio ya es su click.
        if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
        e.preventDefault();
        alternar();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        ir(tRef.current + (e.key === "ArrowRight" ? 10_000 : -10_000));
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [alternar, ir, onCerrar]);

  // Sin scroll del fondo mientras está abierto, y el foco adentro.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    raiz.current?.focus();
    return () => {
      document.body.style.overflow = previo;
    };
  }, [montado]);

  const perfil = useMemo(() => perfilDeAltura(serie), [serie]);
  const estado = useMemo(() => estadoEn(serie, t), [serie, t]);
  const horas = hhmmssArgentina(estado.t);
  const trk = Math.round(variacionW !== null ? aMagnetico(estado.rumbo, variacionW) : estado.rumbo) % 360;
  const trkTexto = `${String(trk).padStart(3, "0")}`;
  const altTexto = estado.altFt !== null ? miles(estado.altFt) : "—";

  if (!montado) return null;

  const frenar = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-label={`Repasar el vuelo: ${titulo}`}
      tabIndex={-1}
      data-sin-tirar
      onClick={frenar}
      onDoubleClick={frenar}
      onPointerDown={frenar}
      onPointerUp={frenar}
      onMouseDown={frenar}
      onMouseUp={frenar}
      className="fixed inset-0 z-[300] flex flex-col lg:flex-row bg-noche text-white outline-none overscroll-none"
    >
      <div className="relative isolate h-[46dvh] shrink-0 lg:h-auto lg:flex-1 lg:min-w-0">
        <ReproducirVueloMapa serie={serie} estado={estado} seguir={seguir} altitudMax={perfil.altMax} />
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el repaso"
          className="absolute z-[1000] left-3 top-[max(env(safe-area-inset-top),0.75rem)] w-11 h-11 inline-flex items-center justify-center rounded-full bg-noche/80 backdrop-blur border border-white/10 text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setSeguir((s) => !s)}
          aria-pressed={seguir}
          className={`absolute z-[1000] right-3 top-[max(env(safe-area-inset-top),0.75rem)] h-11 inline-flex items-center gap-1.5 px-4 rounded-full border text-xs font-semibold backdrop-blur ${
            seguir ? "bg-aviation-cyan text-noche border-aviation-cyan" : "bg-noche/80 text-white border-white/10"
          }`}
        >
          <Crosshair className="w-4 h-4" aria-hidden="true" /> Seguir al avión
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] lg:flex-none lg:w-[380px] lg:border-l lg:border-white/10 lg:px-6 lg:pt-[max(env(safe-area-inset-top),1.5rem)] lg:gap-5">
        <div>
          <p className={ROTULO}>Repasar el vuelo</p>
          <h2 className="mt-0.5 text-base lg:text-lg font-bold leading-snug">{titulo}</h2>
        </div>

        <div className="border-y border-white/10 py-2.5">
          <div className="grid grid-cols-[1.5fr_1.15fr_0.8fr_1fr_0.9fr] gap-x-1">
            <Lectura rotulo="Hora" valor={horas} />
            <Lectura rotulo="Alt" valor={altTexto} unidad="ft" />
            <Lectura rotulo="GS" valor={estado.gsKt !== null ? String(Math.round(estado.gsKt)) : "—"} unidad="kt" />
            <Lectura rotulo="VS" valor={textoVario(estado.varioFtMin)} />
            <Lectura rotulo="Trk" valor={trkTexto} unidad={variacionW !== null ? "°M" : "°V"} />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] tracking-wider text-zinc-500">
            <span className="tabular-nums">
              {transcurrido(estado.t - t0)} / {transcurrido(t1 - t0)}
            </span>
            {estado.sinSenal && <span className="font-semibold uppercase tracking-[0.14em] text-amber-400">Sin señal</span>}
          </div>
        </div>

        <Perfil perfil={perfil} t={estado.t} onT={ir} />

        <input
          type="range"
          min={t0}
          max={t1}
          step={1000}
          value={Math.round(estado.t)}
          onChange={(e) => ir(Number(e.target.value))}
          aria-label="Línea de tiempo del vuelo"
          aria-valuetext={`${horas}${estado.altFt !== null ? `, ${altTexto} pies` : ""}`}
          className="w-full h-11 accent-[#38bdf8] cursor-pointer"
        />

        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => ir(tRef.current - 30_000)}
            aria-label="Retroceder 30 segundos"
            className="w-11 h-11 rounded-full border border-white/10 font-mono text-[11px] font-semibold text-zinc-300"
          >
            −30
          </button>
          <button
            type="button"
            onClick={alternar}
            aria-label={reproduciendo ? "Pausar" : "Reproducir"}
            className="w-14 h-11 inline-flex items-center justify-center rounded-full bg-aviation-cyan text-noche"
          >
            {reproduciendo ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={() => ir(tRef.current + 30_000)}
            aria-label="Adelantar 30 segundos"
            className="w-11 h-11 rounded-full border border-white/10 font-mono text-[11px] font-semibold text-zinc-300"
          >
            +30
          </button>
          <div className="flex items-center gap-1" role="group" aria-label="Velocidad">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVelocidad(v)}
                aria-pressed={velocidad === v}
                className={`h-11 min-w-[44px] px-1 rounded-full font-mono text-[11px] font-semibold ${
                  velocidad === v ? "bg-white text-noche" : "text-zinc-400 border border-white/10"
                }`}
              >
                ×{v}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          {serie.fuente === "adsb"
            ? "Altitud barométrica de ADS-B. Sin la carrera en tierra: la señal no llega a los receptores."
            : "Altura del GPS del teléfono: puede diferir de la del altímetro."}
        </p>
      </div>
    </div>,
    document.body,
  );
}
