"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import {
  NOTA_REGLAMENTACION,
  PREGUNTAS,
  armarTanda,
  avance,
  falladas,
  registrar,
  resultado,
  type Historial,
  type Materia,
  type Pregunta,
} from "@/lib/examen-ppa";

/**
 * La práctica del examen de PPA con el banco de ANAC (`lib/examen-ppa.ts`). Sin cuenta: lo
 * que se acertó y se falló queda en el navegador de quien practica, para repasar después.
 *
 * Elegís materia y cantidad; contestás de a una y ves al toque si estaba bien y cuál era la
 * correcta; al final, el resultado por materia y la lista de las que fallaste.
 */
const CLAVE = "vector-examen-ppa";
const CANTIDADES = [10, 20, 50];
const LETRAS = ["a", "b", "c"];

function leer(): Historial {
  try {
    const h = JSON.parse(localStorage.getItem(CLAVE) ?? "{}");
    return h && typeof h === "object" ? h : {};
  } catch {
    return {};
  }
}
function guardar(h: Historial) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(h));
  } catch {
    /* sin almacenamiento, la práctica anda igual: sólo no se recuerda */
  }
}

type Respuesta = { pregunta: Pregunta; elegida: number };

/** La figura de la pregunta, como la pone el banco de ANAC. Sobre blanco aun en oscuro: son gráficos impresos. Tocándola, se abre entera. */
function Figura({ p, chica = false }: { p: Pregunta; chica?: boolean }) {
  if (!p.figura) return null;
  return (
    <a href={p.figura.src} target="_blank" rel="noopener" className="block rounded-2xl bg-white border border-zinc-200 dark:border-white/10 p-2" title="Ver la figura entera">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen estática, ya en su tamaño */}
      <img
        src={p.figura.src}
        width={p.figura.ancho}
        height={p.figura.alto}
        loading="lazy"
        alt={`Figura de la pregunta ${p.id} del banco de ANAC`}
        className={`w-full h-auto object-contain mx-auto ${chica ? "max-h-56" : "max-h-[460px]"}`}
      />
    </a>
  );
}

export default function PracticaExamen() {
  const [historial, setHistorial] = useState<Historial>({});
  const [materia, setMateria] = useState<Materia | null>(null);
  const [cantidad, setCantidad] = useState(20);
  const [tanda, setTanda] = useState<Pregunta[] | null>(null);
  const [actual, setActual] = useState(0);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);

  useEffect(() => setHistorial(leer()), []);

  const paraRepasar = useMemo(() => falladas(historial), [historial]);
  const avances = useMemo(() => avance(historial), [historial]);
  const vistas = avances.reduce((t, a) => t + a.vistas, 0);

  const empezar = (soloFalladas = false) => {
    const t = armarTanda({ materia: soloFalladas ? null : materia, cantidad: soloFalladas ? 50 : cantidad, soloFalladas, historial });
    setTanda(t);
    setActual(0);
    setRespuestas([]);
    document.getElementById("practica")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const responder = (elegida: number) => {
    if (!tanda || respuestas[actual]) return;
    const pregunta = tanda[actual];
    setRespuestas((r) => [...r, { pregunta, elegida }]);
    const h = registrar(historial, pregunta.id, elegida === pregunta.correcta);
    setHistorial(h);
    guardar(h);
  };

  const caja = "rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03]";
  const chip = (activo: boolean) =>
    `px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
      activo
        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
        : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-white/30"
    }`;

  // --- Elegir ---
  if (!tanda) {
    const disponibles = materia ? PREGUNTAS.filter((p) => p.materia === materia).length : PREGUNTAS.length;
    return (
      <div id="practica" className={`${caja} p-5 md:p-7 space-y-6 not-prose scroll-mt-24`}>
        <div className="space-y-3">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Materia</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(materia === null)} onClick={() => setMateria(null)}>
              Todas <span className="opacity-60 font-mono">{PREGUNTAS.length}</span>
            </button>
            {avances.map((a) => (
              <button key={a.materia} type="button" className={chip(materia === a.materia)} onClick={() => setMateria(a.materia)}>
                {a.materia} <span className="opacity-60 font-mono">{a.total}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Cuántas preguntas</p>
          <div className="flex flex-wrap gap-2">
            {CANTIDADES.map((c) => (
              <button key={c} type="button" className={chip(cantidad === c)} onClick={() => setCantidad(c)}>
                {Math.min(c, disponibles)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="button" onClick={() => empezar()} className="px-6 py-3.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold">
            Empezar
          </button>
          {paraRepasar.length > 0 && (
            <button type="button" onClick={() => empezar(true)} className="px-6 py-3.5 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-bold text-zinc-900 dark:text-white inline-flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Repasar las que fallé ({paraRepasar.length})
            </button>
          )}
        </div>
        {vistas > 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ya practicaste {vistas} de {PREGUNTAS.length}. Se recuerda en este navegador.
          </p>
        )}
      </div>
    );
  }

  // --- Resultado ---
  if (actual >= tanda.length) {
    const r = resultado(respuestas);
    const mal = respuestas.filter((x) => x.elegida !== x.pregunta.correcta);
    return (
      <div id="practica" className={`${caja} p-5 md:p-7 space-y-6 not-prose scroll-mt-24`}>
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Resultado</p>
          <p className="text-4xl font-bold text-zinc-900 dark:text-white">
            <span className="font-mono">{r.bien}</span> de <span className="font-mono">{r.total}</span>{" "}
            <span className="text-zinc-400 text-2xl font-mono">{r.porcentaje}%</span>
          </p>
        </div>
        <ul className="space-y-2">
          {r.porMateria.map((m) => (
            <li key={m.materia} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-zinc-600 dark:text-zinc-300">{m.materia}</span>
              <span className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                <span className="block h-full bg-aviation-blue dark:bg-aviation-cyan" style={{ width: `${(100 * m.bien) / m.total}%` }} />
              </span>
              <span className="font-mono text-zinc-900 dark:text-white w-12 text-right">
                {m.bien}/{m.total}
              </span>
            </li>
          ))}
        </ul>
        {mal.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-zinc-900 dark:text-white">Las que fallaste</p>
            {mal.map(({ pregunta: p, elegida }) => (
              <div key={p.id} className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-zinc-900 dark:text-white">{p.pregunta}</p>
                <Figura p={p} chica />
                <p className="text-red-600 dark:text-red-400">Elegiste: {p.opciones[elegida]}</p>
                <p className="text-emerald-700 dark:text-emerald-400">Correcta: {p.opciones[p.correcta]}</p>
                {p.materia === "Reglamentación" && <p className="text-xs text-amber-700 dark:text-amber-400">{NOTA_REGLAMENTACION}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => empezar()} className="px-6 py-3.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold">
            Otra tanda
          </button>
          <button type="button" onClick={() => setTanda(null)} className="px-6 py-3.5 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-bold text-zinc-900 dark:text-white">
            Cambiar materia
          </button>
        </div>
      </div>
    );
  }

  // --- Pregunta ---
  const p = tanda[actual];
  const r = respuestas[actual];
  return (
    <div id="practica" className={`${caja} p-5 md:p-7 space-y-5 not-prose scroll-mt-24`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-aviation-blue dark:text-aviation-cyan">{p.materia}</span>
        <span className="font-mono text-zinc-500 dark:text-zinc-400">
          {actual + 1} de {tanda.length}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
        <div className="h-full bg-zinc-900 dark:bg-white" style={{ width: `${(100 * actual) / tanda.length}%` }} />
      </div>
      <p className="text-lg font-bold text-zinc-900 dark:text-white leading-snug">{p.pregunta}</p>
      <Figura p={p} />
      <div className="space-y-2.5">
        {p.opciones.map((o, i) => {
          const esCorrecta = i === p.correcta;
          const elegida = r?.elegida === i;
          const estilo = !r
            ? "border-zinc-200 dark:border-white/10 hover:border-zinc-900 dark:hover:border-white/40"
            : esCorrecta
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
              : elegida
                ? "border-red-400 bg-red-50 dark:bg-red-500/10"
                : "border-zinc-200 dark:border-white/10 opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={!!r}
              onClick={() => responder(i)}
              className={`w-full text-left flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-sm text-zinc-800 dark:text-zinc-100 transition-colors ${estilo}`}
            >
              <span className="font-mono font-bold text-zinc-400 shrink-0">{LETRAS[i]})</span>
              <span className="flex-1">{o}</span>
              {r && esCorrecta && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Correcta" />}
              {r && elegida && !esCorrecta && <X className="w-4 h-4 text-red-500 shrink-0" aria-label="Incorrecta" />}
            </button>
          );
        })}
      </div>
      {r && p.materia === "Reglamentación" && <p className="text-xs text-amber-700 dark:text-amber-400">{NOTA_REGLAMENTACION}</p>}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setTanda(null)} className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          Salir
        </button>
        {r && (
          <button type="button" onClick={() => setActual((a) => a + 1)} className="px-6 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold">
            {actual + 1 < tanda.length ? "Siguiente" : "Ver el resultado"}
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-400">Pregunta {p.id} del banco de ANAC.</p>
    </div>
  );
}
