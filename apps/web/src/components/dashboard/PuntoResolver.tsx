"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clasificarToken } from "@/lib/puntos";
import type { PuntoResuelto } from "@/app/api/puntos/route";
import type { AirportRef } from "@/types";
import { anotarOrigen } from "@/lib/origen-datos";

/**
 * Un campo de punto de ruta, para el planificador.
 *
 * ## Por qué no es `AirportResolver`
 *
 * `AirportResolver` tiene `maxLength={4}` y borra todo lo que no sea `[A-Z0-9]` en cada
 * tecla. Eso es **correcto** para lo que hace —un campo de ICAO en el formulario de un
 * vuelo, donde cualquier otra cosa es un error de tipeo— y lo usan seis pantallas. Un
 * punto de ruta ahora puede ser `BAR/045/25`: catorce caracteres y dos barras. Aflojarle
 * el filtro a `AirportResolver` le cambiaría el comportamiento a las seis, para habilitar
 * algo que sólo existe en el planificador.
 *
 * Así que éste es su hermano de ruta: mismo lenguaje visual —chip centrado, el nombre
 * apareciendo abajo como confirmación, lista de sugerencias manejable con el teclado— y
 * otra gramática.
 *
 * ## Las coordenadas no salen a la red
 *
 * `S34.68/W58.64` se resuelve acá mismo: el token **es** la respuesta, no hay directorio
 * que consultar. Un `fetch` para que el servidor devuelva los dos números que acaban de
 * tipearse sería latencia pura, y encima rompería sin señal — que es justo lo que la
 * Parte A de este plan vino a arreglar.
 */

const DEBOUNCE_MS = 150;

/** Query → respuesta, para toda la vida de la página. Un código se tipea y se
 *  vuelve a tipear todo el tiempo; re-preguntarlo es latencia y nada más. */
const cache = new Map<string, { punto: PuntoResuelto | null; sugerencias: AirportRef[] }>();

/**
 * Qué decirle a alguien cuyo token tiene una barra y no clasifica.
 *
 * **Un token con barra que no resuelve nunca puede quedar en silencio**, y ésa es la
 * regla que ordena esta función. Un código de cuatro letras que no existe se explica
 * solo —"No lo reconocemos"—, pero `BAR/400/25` sin una palabra abajo deja a la persona
 * mirando un campo que no hace nada, sin saber si el problema es el 400, la estación o el
 * formato. Lo comprobé manejando el campo con un navegador: era exactamente lo que
 * pasaba.
 */
function ayuda(valor: string): string | null {
  const t = valor.trim().toUpperCase();
  if (!t.includes("/")) return null;
  if (clasificarToken(t)) return null;

  // `[NS]` seguido de dígito, y no `[NS]` a secas: si no, `SADM/045` se leería como una
  // coordenada a medio escribir y el cartel diría cualquier cosa.
  if (/^[NS]\d/.test(t)) return "Coordenada: S34.68/W58.64";

  const partes = t.split("/");
  if (partes.length === 2) return "Falta la distancia: BAR/045/25";
  if (partes.length === 3) {
    const grados = Number(partes[1]);
    const distancia = Number(partes[2]);
    if (Number.isFinite(grados) && grados > 360) return "El radial va de 000 a 360";
    if (Number.isFinite(distancia) && !(distancia > 0)) return "La distancia va en millas: BAR/045/25";
  }
  return "Radial y distancia: BAR/045/25";
}

export default function PuntoResolver({
  value,
  onChange,
  onResolve,
  label,
  autoFocus = false,
}: {
  value: string;
  onChange: (texto: string) => void;
  /** Avisa con el punto resuelto, o `null` cuando el token no resuelve. */
  onResolve?: (punto: PuntoResuelto | null) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const [sugerencias, setSugerencias] = useState<AirportRef[]>([]);
  const [resuelto, setResuelto] = useState<PuntoResuelto | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const [cargando, setCargando] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // En una ref para que el llamador pueda pasar una arrow inline sin convertir el
  // efecto de abajo en un fetch por render. Mismo truco que `AirportResolver`.
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const avisar = useCallback((punto: PuntoResuelto | null) => {
    setResuelto((prev) => (prev?.codigo === punto?.codigo ? prev : punto));
    onResolveRef.current?.(punto);
  }, []);

  useEffect(() => {
    const q = value.trim().toUpperCase();

    if (q.length < 2) {
      setSugerencias([]);
      setCargando(false);
      avisar(null);
      return;
    }

    const token = clasificarToken(q);

    // Una coordenada ya trae todo. Cero red.
    if (token?.tipo === "coordenada") {
      setSugerencias([]);
      setCargando(false);
      avisar({
        codigo: token.canonico,
        clase: "coordenada",
        label: token.etiqueta,
        lat: token.lat,
        lon: token.lon,
      });
      return;
    }

    const guardado = cache.get(q);
    if (guardado) {
      setSugerencias(guardado.sugerencias);
      avisar(guardado.punto);
      return;
    }

    setCargando(true);
    const abortador = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/puntos?q=${encodeURIComponent(q)}`, {
          signal: abortador.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        // `offline: true` lo pone el service worker cuando resolvió con el catálogo
        // de a bordo. Ver `origen-datos.ts`.
        anotarOrigen(data);
        const respuesta = {
          punto: (data.punto ?? null) as PuntoResuelto | null,
          sugerencias: (data.sugerencias ?? []) as AirportRef[],
        };
        cache.set(q, respuesta);
        setSugerencias(respuesta.sugerencias);
        avisar(respuesta.punto);
      } catch {
        // Cancelado o sin señal: se deja el último estado bueno en vez de tirarle un
        // error a alguien que está a mitad de una tecla.
      } finally {
        setCargando(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortador.abort();
    };
  }, [value, avisar]);

  // Cerrar la lista al clickear afuera.
  useEffect(() => {
    if (!abierto) return;
    const alBajar = (e: PointerEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", alBajar);
    return () => document.removeEventListener("pointerdown", alBajar);
  }, [abierto]);

  const elegir = (a: AirportRef) => {
    onChange(a.icao);
    setAbierto(false);
    inputRef.current?.blur();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (!abierto || sugerencias.length === 0) {
      if (e.key === "ArrowDown" && sugerencias.length > 0) setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcado((h) => (h + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcado((h) => (h - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegir(sugerencias[marcado]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  /*
    Cuándo decir "no lo reconozco". Con un código son cuatro letras, como siempre. Con
    una barra de por medio, el token está completo cuando `clasificarToken` lo acepta —
    avisar antes sería gritarle "desconocido" a alguien que va por `BAR/04`.
  */
  /*
    Cuándo decir "no lo reconozco". Cuatro caracteres para un código de aeródromo, **cinco
    para un punto significativo** —los designadores del AIP son siempre de cinco letras— y
    con una barra de por medio, cuando `clasificarToken` acepta el token entero. Avisar
    antes sería gritarle "desconocido" a alguien que va por `BAR/04` o por `DORV`.
  */
  const completo = value.includes("/")
    ? !!clasificarToken(value)
    : value.trim().length === 4 || value.trim().length === 5;
  const desconocido = completo && !resuelto && !cargando;
  const pista = ayuda(value);

  return (
    <div ref={contenedorRef} className="relative">
      <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide block mb-1.5">
        {label}
      </label>

      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={16}
        autoFocus={autoFocus}
        placeholder="SADM"
        value={value}
        onChange={(e) => {
          /*
            La barra y el punto entran: son la gramática de un radial y de una coordenada.
            La coma **no**, y ésa es la parte deliberada: es separador entre puntos, así
            que un decimal con coma se parte solo en cuanto la ruta se pega entera o
            vuelve de la URL. Mejor que no se pueda tipear.
          */
          onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9/.]/g, ""));
          setMarcado(0);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={`w-full text-center font-bold rounded-2xl py-3 outline-none transition-colors border-2 bg-zinc-50 dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-300 dark:placeholder:text-zinc-700 ${
          // Un `BAR/045/25` a 2xl con tracking se sale del campo en el ancho de la
          // columna izquierda. El código corto se sigue viendo como siempre.
          value.length > 6 ? "text-base tracking-[0.05em]" : "text-2xl tracking-[0.15em]"
        } ${
          desconocido
            ? "border-amber-400 dark:border-amber-500/60"
            : resuelto
              ? "border-aviation-blue/40 dark:border-aviation-cyan/40 focus:border-aviation-blue dark:focus:border-aviation-cyan"
              : "border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white"
        }`}
      />

      {/* El nombre resuelto, que es todo el punto del control. La línea se reserva para
          que el layout no salte mientras los códigos resuelven y dejan de resolver. */}
      <div className="h-4 mt-1.5 text-center overflow-hidden">
        <AnimatePresence mode="wait">
          {resuelto ? (
            <motion.p
              key={resuelto.codigo}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate"
              title={resuelto.estacion ? `${resuelto.estacion.nombre} · ${resuelto.estacion.tipo}` : resuelto.label}
            >
              {resuelto.label}
              {resuelto.estacion?.frecuencia && (
                <span className="ml-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                  {resuelto.estacion.frecuencia}
                </span>
              )}
            </motion.p>
          ) : pista ? (
            <motion.p
              key="pista"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium text-zinc-400 dark:text-zinc-500"
            >
              {pista}
            </motion.p>
          ) : desconocido ? (
            <motion.p
              key="desconocido"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium text-amber-600 dark:text-amber-500"
            >
              No lo reconocemos
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {abierto && sugerencias.length > 0 && !(resuelto && sugerencias.length === 1) && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-2xl py-1"
          >
            {sugerencias.map((a, i) => (
              <li key={a.icao}>
                <button
                  type="button"
                  onMouseEnter={() => setMarcado(i)}
                  onClick={() => elegir(a)}
                  className={`w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors ${
                    i === marcado ? "bg-zinc-100 dark:bg-white/10" : ""
                  }`}
                >
                  <span className="text-sm font-bold tracking-wider text-zinc-900 dark:text-white">
                    {a.icao}
                  </span>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
                    {a.label}
                  </span>
                  <span className="ml-auto text-[10px] font-semibold text-zinc-300 dark:text-zinc-600 shrink-0">
                    {a.local && a.local !== a.icao ? a.local : a.country}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
