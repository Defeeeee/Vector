"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * El copiloto de la web, **adentro del buscador** (⌘K, `BuscadorGlobal`). Desde el
 * 2026-11-02 no tiene panel propio ni botón flotante (Federico): se llega escribiendo en
 * el buscador, y contesta ahí mismo.
 *
 * El historial no se guarda en el servidor: viaja entero en cada pregunta (`/api/chat`),
 * y con él el vuelo propuesto que espera el "sí" del piloto (`pendingFlight`). Si se
 * pierde, el vuelo no se escribe: falla del lado seguro. Dura lo que la pestaña.
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

export function useCopiloto() {
  const [mensajes, setMensajes] = useState<MensajeCopiloto[]>([]);
  const [pensando, setPensando] = useState(false);
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
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: historial }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No pude hablar con el copiloto. Probá de nuevo.");
      setMensajes((m) => [...m, { role: "assistant", content: data.reply, pendingFlight: data.pendingFlight }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude hablar con el copiloto. Probá de nuevo.");
    } finally {
      ocupado.current = false;
      setPensando(false);
    }
  }, []);

  const reiniciar = useCallback(() => {
    setMensajes([]);
    setError(null);
  }, []);

  return { mensajes, pensando, error, enviar, reiniciar };
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
  error,
  alSugerir,
}: {
  mensajes: MensajeCopiloto[];
  pensando: boolean;
  error: string | null;
  alSugerir: (pregunta: string) => void;
}) {
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes, pensando, error]);

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
            </div>
          </div>
        ),
      )}

      {pensando && (
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 shrink-0 rounded-xl bg-aviation-blue/10 text-aviation-blue dark:text-aviation-cyan flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
          <span className="text-xs font-medium text-zinc-400">Mirando tu bitácora…</span>
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
