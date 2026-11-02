"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { leerEventos } from "@/lib/copiloto-stream";

/**
 * El copiloto de la web, **adentro del buscador** (⌘K, `BuscadorGlobal`). Desde el
 * 2026-11-02 no tiene panel propio ni botón flotante (Federico): se llega escribiendo en
 * el buscador, y contesta ahí mismo.
 *
 * El historial no se guarda en el servidor: viaja entero en cada pregunta (`/api/chat`),
 * y con él el vuelo propuesto que espera el "sí" del piloto (`pendingFlight`). Si se
 * pierde, el vuelo no se escribe: falla del lado seguro. Dura lo que la pestaña.
 *
 * La respuesta llega **de a pedazos** (NDJSON, `lib/copiloto-stream.ts`): primero qué está
 * haciendo y después el texto, mientras Gemini lo escribe.
 */
export interface MensajeCopiloto {
  role: "user" | "assistant";
  content: string;
  pendingFlight?: Record<string, unknown>;
}

export const PREGUNTAS_SUGERIDAS = [
  "¿Cuántas horas totales tengo?",
  "¿Cuál fue mi vuelo más largo?",
  "¿Cuántos vuelos hice este mes?",
  // Reglamento: contesta con el texto de la RAAC 61 y la sección (`consultar_raac`).
  "¿Cuántos aterrizajes necesito para llevar pasajeros?",
  "¿Cómo está el clima en San Fernando?",
];

const SIN_CONEXION = "No pude hablar con el copiloto. Probá de nuevo.";

export function useCopiloto() {
  const [mensajes, setMensajes] = useState<MensajeCopiloto[]>([]);
  const [pensando, setPensando] = useState(false);
  /** Qué está haciendo mientras todavía no escribió nada ("Buscando en la RAAC…"). */
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El historial que se manda tiene que ser el de ahora, no el de cuando se creó `enviar`.
  const actuales = useRef<MensajeCopiloto[]>([]);
  actuales.current = mensajes;
  const ocupado = useRef(false);

  const enviar = useCallback(async (texto: string) => {
    const msg = texto.trim();
    if (!msg || ocupado.current) return;
    ocupado.current = true;
    const historial = actuales.current;
    setMensajes([...historial, { role: "user", content: msg }]);
    setPensando(true);
    setEstado("Pensando…");
    setError(null);

    // La respuesta del copiloto, que se va escribiendo: el último mensaje de la lista.
    let escribiendo = false;
    const responder = (content: string, pendingFlight?: Record<string, unknown>) => {
      // Se decide acá y no adentro del updater: React lo corre más tarde, cuando
      // `escribiendo` ya cambió, y el primer pedazo pisaba la pregunta del piloto.
      const reemplazar = escribiendo;
      escribiendo = true;
      setMensajes((m) => [...(reemplazar ? m.slice(0, -1) : m), { role: "assistant", content, pendingFlight }]);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: historial }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || SIN_CONEXION);
      }

      const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      let termino = false;
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        const leido = leerEventos(resto + value);
        resto = leido.resto;
        for (const e of leido.eventos) {
          if (e.tipo === "estado") setEstado(e.texto);
          else if (e.tipo === "texto") responder(e.texto);
          else if (e.tipo === "fin") {
            responder(e.texto, e.pendingFlight);
            termino = true;
          } else if (e.tipo === "error") throw new Error(e.error || SIN_CONEXION);
        }
      }
      if (!termino) throw new Error("Se cortó la respuesta. Probá de nuevo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : SIN_CONEXION);
    } finally {
      ocupado.current = false;
      setPensando(false);
      setEstado(null);
    }
  }, []);

  const reiniciar = useCallback(() => {
    setMensajes([]);
    setError(null);
  }, []);

  return { mensajes, pensando, estado, error, enviar, reiniciar };
}

/** **Negrita**, *cursiva*, viñetas y saltos de línea: lo que usa el copiloto. */
function TextoConFormato({ texto }: { texto: string }) {
  return (
    <div className="space-y-1.5">
      {texto.split("\n").map((linea, i) => {
        const t = linea.trim();
        if (!t) return <div key={i} className="h-1" />;
        const vineta = t.startsWith("- ") || t.startsWith("• ");
        const partes = (vineta ? t.slice(2) : t).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**")) return <strong key={j}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={j}>{p.slice(1, -1)}</em>;
          return p;
        });
        return vineta ? (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
            <span>{partes}</span>
          </div>
        ) : (
          <p key={i}>{partes}</p>
        );
      })}
    </div>
  );
}

export default function ConversacionCopiloto({
  mensajes,
  pensando,
  estado,
  error,
  alSugerir,
}: {
  mensajes: MensajeCopiloto[];
  pensando: boolean;
  estado: string | null;
  error: string | null;
  alSugerir: (pregunta: string) => void;
}) {
  const fin = useRef<HTMLDivElement>(null);
  // Mientras escribe, la última respuesta es suya; si todavía no escribió nada, el estado.
  const escribiendo = pensando && mensajes[mensajes.length - 1]?.role === "assistant";

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, pensando, estado, error]);

  return (
    <div className="space-y-4 p-4 md:p-5" aria-live="polite">
      {mensajes.length === 0 && !pensando && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-xl bg-aviation-blue text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <p className="pt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Preguntame por tus vuelos, tus horas y vencimientos, el clima de un aeródromo o la RAAC. También
              puedo cargar un vuelo: te lo muestro y lo guardo cuando me digas que sí.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pl-11">
            {PREGUNTAS_SUGERIDAS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => alSugerir(p)}
                className="text-left text-xs font-medium text-zinc-600 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] px-3 py-1.5 hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {mensajes.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900">
              {m.content}
            </p>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-3">
            <span className="w-8 h-8 shrink-0 rounded-xl bg-aviation-blue/10 text-aviation-blue dark:text-aviation-cyan flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
              <TextoConFormato texto={m.content} />
              {escribiendo && i === mensajes.length - 1 && (
                <span aria-hidden className="inline-block w-1.5 h-4 -mb-0.5 ml-0.5 rounded-sm bg-aviation-blue animate-pulse" />
              )}
            </div>
          </div>
        ),
      )}

      {pensando && !escribiendo && (
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 shrink-0 rounded-xl bg-aviation-blue/10 text-aviation-blue dark:text-aviation-cyan flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{estado ?? "Pensando…"}</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <div ref={fin} />
    </div>
  );
}
