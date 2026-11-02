"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { coordenadaOaci, type AerodromoForm } from "@/lib/formulario-plan";
import { leerCoordenadas } from "@/lib/lad";

interface Resultado {
  icao: string;
  country?: string;
  name: string;
  label: string;
  city?: string;
  lat?: number;
  lon?: number;
}

/**
 * Un aeródromo del plan: por código (`SADF`, `CNL`) o por nombre ("martin garcia"), con
 * la búsqueda de siempre (`/api/airports/search`, que lee MADHEL y OurAirports). Elegido,
 * queda el código, el nombre y las coordenadas, que hacen falta para DEP/ y DEST/ cuando
 * el aeródromo no tiene OACI y para sugerir la duración.
 *
 * También los LAD de ANAC (`&lad=1`), por número ("2013", "LAD2013") o por nombre, que se
 * muestran como `LAD2013`. La lista de ANAC no trae dónde quedan, así que al elegir uno se
 * piden las coordenadas, que van en la casilla 18.
 */
export default function CampoAerodromo({
  valor,
  onCambio,
  placeholder,
  claseInput,
  alinear = "izquierda",
}: {
  valor: AerodromoForm | null;
  onCambio: (a: AerodromoForm | null) => void;
  placeholder: string;
  claseInput: string;
  /** Hacia dónde se abre la lista: la del campo de la derecha se abre hacia la izquierda. */
  alinear?: "izquierda" | "derecha";
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}&limit=12&lad=1`);
        const data = (await res.json()) as { results?: Resultado[] };
        // Un plan de vuelo de EANA sale de un aeródromo argentino: primero esos. "moron"
        // traía antes aeródromos de Madagascar que Morón.
        const todos = data.results ?? [];
        const aerodromos = todos.filter((r) => !esLad(r.icao)).sort((a, b) => Number(b.country === "AR") - Number(a.country === "AR"));
        const lads = todos.filter((r) => esLad(r.icao));
        // Si lo escrito es un número de LAD ("2013", "LAD2013"), los LAD van primero.
        const porNumero = /^(lad\s?)?\d+$/i.test(q);
        const lista = porNumero ? [...lads.slice(0, 6), ...aerodromos.slice(0, 2)] : [...aerodromos.slice(0, 5), ...lads.slice(0, 4)];
        if (n === pedido.current) setResultados(lista);
      } catch {
        if (n === pedido.current) setResultados([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [texto]);

  /** Si lo escrito es exactamente un código de la lista, se elige solo: no se pierde al salir. */
  const elegirExacto = () => {
    const q = texto.trim().toUpperCase();
    const exacto = resultados.find((r) => r.icao.toUpperCase() === q);
    if (exacto) elegir(exacto);
  };

  const elegir = (r: Resultado) => {
    onCambio({ codigo: r.icao, nombre: r.label || r.name, lat: r.lat, lon: r.lon });
    setTexto("");
    setResultados([]);
    setAbierto(false);
  };

  if (valor) {
    const ladSinLugar = esLad(valor.codigo) && (valor.lat === undefined || valor.lon === undefined);
    return (
      <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          title="Cambiar el aeródromo"
          // Tocarlo es para cambiarlo: vuelve el buscador con el código escrito.
          onClick={() => {
            setTexto(valor.codigo);
            setAbierto(true);
            onCambio(null);
          }}
          // `min-w-0` y `truncate`: en una casilla angosta (las alternativas en el teléfono) el
          // nombre se corta y la × queda adentro, en vez de empujarla afuera del campo.
          className={`${claseInput} min-w-0 flex-1 flex items-baseline gap-2 text-left overflow-hidden`}
        >
          <span className="data font-bold shrink-0">{valor.codigo}</span>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate min-w-0">{valor.nombre}</span>
        </button>
        <button
          type="button"
          aria-label="Cambiar aeródromo"
          onClick={() => onCambio(null)}
          className="shrink-0 p-1 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {esLad(valor.codigo) && (
        <CoordenadasLad
          valor={valor}
          sinLugar={ladSinLugar}
          onCambio={(lat, lon) => onCambio(lat === undefined || lon === undefined ? { codigo: valor.codigo, nombre: valor.nombre } : { ...valor, lat, lon })}
        />
      )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus={!!texto}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          elegirExacto();
          setTimeout(() => setAbierto(false), 200);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados[0]) {
            e.preventDefault();
            elegir(resultados[0]);
          }
        }}
        placeholder={placeholder}
        className={`${claseInput} uppercase placeholder:normal-case`}
        autoComplete="off"
      />
      {abierto && resultados.length > 0 && (
        <ul className={`absolute z-20 ${alinear === "derecha" ? "right-0" : "left-0"} min-w-full w-72 max-w-[calc(100vw-3rem)] mt-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden`}>
          {resultados.map((r) => (
            <li key={r.icao}>
              <button
                type="button"
                // Se elige al apoyar, no al soltar: con el dedo, el campo pierde el foco antes del
                // clic y la lista se cerraba antes de que llegara.
                onPointerDown={(e) => {
                  e.preventDefault();
                  elegir(r);
                }}
                // Con teclado (Enter o espacio sobre la opción) no hay pointerdown.
                onClick={(e) => {
                  if (e.detail === 0) elegir(r);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 flex items-baseline gap-3"
              >
                <span className={`data text-sm font-bold text-zinc-900 dark:text-white shrink-0 ${esLad(r.icao) ? "w-[4.5rem]" : "w-12"}`}>{r.icao}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{r.label || r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const esLad = (codigo: string) => /^LAD\d+$/i.test(codigo.trim());

/**
 * Dónde queda el LAD: la lista de ANAC no lo dice y el plan lo necesita (casilla 18, "el lugar
 * en coordenadas"). Acepta lo que el piloto tenga a mano: `3427S05835W`, grados y minutos, o
 * decimales copiados de un mapa (`leerCoordenadas`).
 */
function CoordenadasLad({
  valor,
  sinLugar,
  onCambio,
}: {
  valor: AerodromoForm;
  sinLugar: boolean;
  onCambio: (lat?: number, lon?: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState(false);

  if (!sinLugar && valor.lat !== undefined && valor.lon !== undefined) {
    return (
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        En <span className="data font-semibold text-zinc-700 dark:text-zinc-200">{coordenadaOaci(valor.lat, valor.lon)}</span>{" "}
        <button type="button" onClick={() => onCambio(undefined, undefined)} className="font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline">
          cambiar
        </button>
      </p>
    );
  }

  const aplicar = () => {
    const c = leerCoordenadas(texto);
    setError(!!texto.trim() && !c);
    if (c) onCambio(c.lat, c.lon);
  };
  return (
    <div className="space-y-1">
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setError(false);
        }}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
        placeholder="Coordenadas: 3427S05835W o -34.45, -58.58"
        aria-label={`Coordenadas del ${valor.codigo}`}
        className="w-full rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-1.5 text-xs data uppercase placeholder:normal-case placeholder:font-sans text-zinc-900 dark:text-white outline-none focus:border-amber-500"
      />
      <p className={`text-[11px] leading-snug ${error ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
        {error
          ? "No entendí las coordenadas. Probá con 3427S05835W, 34°27'S 58°35'W o -34.45, -58.58."
          : "La lista de LAD de ANAC no dice dónde quedan: el plan las lleva en la casilla 18."}
      </p>
    </div>
  );
}
