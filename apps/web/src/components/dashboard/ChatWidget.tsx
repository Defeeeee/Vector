"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown, Plus } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  /**
   * Vuelo propuesto que espera confirmación.
   *
   * El copiloto no escribe directo: propone, y el vuelo se guarda recién cuando
   * el piloto contesta que sí. Como este chat no persiste el historial del lado
   * del servidor, la propuesta viaja acá y vuelve en el siguiente mensaje — es el
   * mismo mecanismo que el de WhatsApp, sólo que guardado en el cliente.
   *
   * Que el cliente pueda perderla es aceptable: si se pierde, el vuelo no se
   * escribe. Falla del lado seguro.
   */
  pendingFlight?: Record<string, unknown>;
}

const SUGGESTED_QUESTIONS = [
  "¿Cuántas horas totales tengo?",
  "¿Cuál fue mi vuelo más largo?",
  "¿En qué aeronave volé más?",
  "¿Cuántos vuelos hice este mes?",
  "¿Cuál es mi ruta más frecuente?",
  // Reglamento: contesta con el texto de la RAAC 61 y la sección (`consultar_raac`).
  "¿Cuántos aterrizajes necesito para volar?",
  "¿Cuánto dura el CMA?",
];

function MarkdownText({ text }: { text: string }) {
  // Simple inline markdown: **bold**, *italic*, bullet lists, line breaks
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Bullet point
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("• ");
        const content = isBullet ? trimmed.slice(2) : trimmed;

        // Apply bold/italic
        const formatted = content
          .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
          .map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**"))
              return <strong key={j}>{part.slice(2, -2)}</strong>;
            if (part.startsWith("*") && part.endsWith("*"))
              return <em key={j}>{part.slice(1, -1)}</em>;
            return part;
          });

        if (isBullet) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current opacity-50 flex-shrink-0" />
              <span>{formatted}</span>
            </div>
          );
        }
        return <p key={i}>{formatted}</p>;
      })}
    </div>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        setMessages([{
          role: "assistant",
          content: "¡Hola! Soy tu copiloto IA 🛩️ Tengo acceso a toda tu bitácora. ¿Qué querés saber sobre tus vuelos?"
        }]);
      }
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: "user", content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: updatedMessages.slice(0, -1), // exclude the message we just sent
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al conectar con la IA");

      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, pendingFlight: data.pendingFlight },
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    // `data-imprimir="no"` porque esto vive en el layout del dashboard y aparecería en
    // cualquier página impresa. La planilla del planificador es la primera que se
    // imprime de verdad, y el globo del copiloto salía en la esquina.
    <div data-imprimir="no" className="contents">
      {/* Desktop floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`hidden lg:flex fixed bottom-8 right-6 z-50 w-14 h-14 rounded-2xl items-center justify-center shadow-2xl shadow-aviation-blue/30 transition-all duration-300 ${
          open
            ? "bg-aviation-blue-dark text-white rotate-0 scale-95"
            : "bg-aviation-blue text-white hover:bg-aviation-blue-dark hover:scale-110"
        }`}
        aria-label="Abrir chat IA"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-6 h-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-black animate-pulse" />
        )}
      </button>

      {/* Mobile action pill — AI copilot + Nuevo vuelo, segregated from the nav pill */}
      <div
        className="lg:hidden fixed right-6 z-50 flex items-center bg-aviation-blue rounded-full shadow-lg shadow-aviation-blue/30 divide-x divide-white/25 pointer-events-auto"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => setOpen(o => !o)}
          className="relative w-14 h-14 flex items-center justify-center text-white transition-transform active:scale-95"
          aria-label="Abrir chat IA"
        >
          {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
          {!open && (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-green-400 border-2 border-aviation-blue animate-pulse" />
          )}
        </button>
        <Link
          href="/dashboard/log-flight"
          aria-label="Nuevo vuelo"
          className="w-14 h-14 flex items-center justify-center text-white transition-transform active:scale-95"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </Link>
      </div>

      {/* Chat panel */}
      <div
        className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-28 right-6 z-50 w-[min(420px,calc(100vw-3rem))] transition-all duration-300 origin-bottom-right ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="bg-white dark:bg-[#0f0f0f] border border-zinc-200 dark:border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col" style={{ height: "min(600px, 80vh)" }}>

          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between bg-zinc-900 dark:bg-black">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-aviation-cyan" />
              </div>
              <div>
                <p className="text-sm font-bold text-white tracking-tight">Copiloto IA</p>
                <p className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Gemini · Bitácora en tiempo real
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                    : "bg-aviation-blue/10 text-aviation-blue-dark dark:text-aviation-cyan"
                }`}>
                  {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-sm font-medium"
                    : "bg-zinc-50 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100 rounded-tl-sm border border-zinc-100 dark:border-white/10"
                }`}>
                  {msg.role === "assistant" ? <MarkdownText text={msg.content} /> : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-xl bg-aviation-blue/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
                </div>
                <div className="bg-zinc-50 dark:bg-white/[0.06] border border-zinc-100 dark:border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  <span className="text-xs text-zinc-400 font-medium">Analizando tu bitácora...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
                ⚠️ {error}
              </div>
            )}

            {/* Suggested questions */}
            {showSuggestions && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-zinc-400 px-1">Preguntas sugeridas</p>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 transition-all hover:border-zinc-300 dark:hover:border-white/20 active:scale-[0.98]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-4 border-t border-zinc-100 dark:border-white/10">
            <div className="flex gap-2 bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 rounded-2xl p-1.5 focus-within:border-zinc-400 dark:focus-within:border-white/30 transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Preguntá sobre tus vuelos..."
                className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 px-3 py-1.5 outline-none font-medium"
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center text-[9px] text-zinc-300 dark:text-zinc-700 mt-2 font-medium tracking-wide">
              Powered by Gemini · Tus datos nunca se almacenan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
