"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CornerDownLeft, LayoutGrid, MapPin, Plane, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { buscarEnVector, type AerodromoEncontrado, type VueloEncontrado } from "@/actions/buscador";
import { splitRoute } from "@/lib/route";
import { buscarGuias, buscarPantallas, copilotoPrimero, type Resultado } from "@/lib/buscador";
import ConversacionCopiloto, { useCopiloto } from "./ConversacionCopiloto";

interface Item {
  clave: string;
  grupo: "Pantallas" | "Vuelos" | "Aeródromos" | "Guías" | "Copiloto";
  titulo: string;
  detalle: string;
  /** Adónde lleva. Sin `href`, el ítem pasa al copiloto con `pregunta`. */
  href?: string;
  pregunta?: string;
}

/** El copiloto, con lo escrito como pregunta. Es la única forma de llegar a él. */
const alCopiloto = (texto: string, enCurso: boolean): Item => ({
  clave: "copiloto",
  grupo: "Copiloto",
  titulo: texto
    ? `Preguntale al copiloto: “${texto}”`
    : enCurso
      ? "Seguir con el copiloto"
      : "Preguntale al copiloto",
  detalle: texto ? "Contesta con tu bitácora, el clima y la RAAC" : "Tu bitácora, el clima y la RAAC, en una conversación",
  pregunta: texto || undefined,
});

/** Lo que se ofrece antes de escribir: lo que más se busca, sin red. */
const SUGERIDOS: Item[] = [
  { clave: "s1", grupo: "Pantallas", titulo: "Registrar vuelo", detalle: "Cargar un vuelo nuevo", href: "/dashboard/log-flight" },
  { clave: "s2", grupo: "Pantallas", titulo: "Pasar al CAD", detalle: "Tus vuelos al CAD de ANAC", href: "/dashboard/history/cad" },
  { clave: "s3", grupo: "Pantallas", titulo: "Plan de vuelo", detalle: "Preparar vuelo", href: "/dashboard/plan-de-vuelo" },
  { clave: "s4", grupo: "Pantallas", titulo: "Clima", detalle: "Preparar vuelo", href: "/dashboard/clima" },
];

const ICONOS = { Pantallas: LayoutGrid, Vuelos: Plane, "Aeródromos": MapPin, "Guías": BookOpen, Copiloto: Sparkles } as const;

const deResultado = (r: Resultado): Item => ({
  clave: `${r.tipo}:${r.href}`,
  grupo: r.tipo === "guia" ? "Guías" : "Pantallas",
  titulo: r.titulo,
  detalle: r.detalle,
  href: r.href,
});

const deVuelo = (v: VueloEncontrado): Item => ({
  clave: `v:${v.id}`,
  grupo: "Vuelos",
  titulo: v.ruta ? splitRoute(v.ruta, "???").join(" → ") : "Sin ruta",
  detalle: [v.fecha, v.matricula, `${v.horas.toFixed(1)} h`].filter(Boolean).join(" · "),
  href: `/dashboard/history?ver=${v.id}`,
});

const deAerodromo = (a: AerodromoEncontrado): Item => ({
  clave: `a:${a.icao}`,
  grupo: "Aeródromos",
  titulo: `${a.icao} · ${a.nombre}`,
  detalle: a.ciudad,
  href: `/dashboard/airports?icao=${encodeURIComponent(a.icao)}`,
});

/**
 * El buscador de toda la app: pantallas, vuelos, aeródromos y guías, con ⌘K (Ctrl+K) o la
 * lupa de la barra. Las pantallas y las guías se buscan acá, sin red (`lib/buscador.ts`);
 * los aeródromos y los vuelos, en el server (`buscarEnVector`), con una pausa corta entre
 * teclas.
 *
 * **Es también el copiloto** (2026-11-02, Federico): no hay otra forma de llegar a él. El
 * ítem "Preguntale al copiloto" está siempre, primero cuando lo escrito no encuentra nada o
 * es una pregunta (`copilotoPrimero`), y al elegirlo el diálogo pasa a modo conversación
 * (`ConversacionCopiloto`) con eso como primera pregunta. La conversación sigue mientras
 * no se recargue la pestaña: al reabrir, se ofrece "Seguir con el copiloto".
 *
 * Hay dos botones (la barra de escritorio y el encabezado del teléfono) y sólo el visible
 * atiende el atajo, para que no se abran dos. El diálogo va por portal: el encabezado tiene
 * `backdrop-blur`, y eso encierra a un `fixed` adentro de la barra.
 */
export default function BuscadorGlobal({ variante }: { variante: "barra" | "icono" }) {
  const router = useRouter();
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"buscar" | "copiloto">("buscar");
  const [q, setQ] = useState("");
  const [borrador, setBorrador] = useState("");
  const [remoto, setRemoto] = useState<{ q: string; vuelos: Item[]; aerodromos: Item[] }>({ q: "", vuelos: [], aerodromos: [] });
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const [esMac, setEsMac] = useState(true);
  const copiloto = useCopiloto();
  const enCurso = copiloto.mensajes.length > 0;

  useEffect(() => {
    setEsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      if (!boton.current || boton.current.offsetParent === null) return;
      e.preventDefault();
      setAbierto((a) => !a);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Se limpia al cerrar, no al abrir: lo que se tipea apenas se abre no se pierde. La
  // conversación con el copiloto queda.
  useEffect(() => {
    if (!abierto) {
      setQ("");
      setActivo(0);
      setModo("buscar");
      return;
    }
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scroll;
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto, modo]);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setBuscando(false);
      return;
    }
    setBuscando(true);
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const r = await buscarEnVector(texto);
        if (vigente) setRemoto({ q: texto, vuelos: r.vuelos.map(deVuelo), aerodromos: r.aerodromos.map(deAerodromo) });
      } catch {
        if (vigente) setRemoto({ q: texto, vuelos: [], aerodromos: [] });
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  const items = useMemo(() => {
    const texto = q.trim();
    if (texto.length < 2) return [...SUGERIDOS, alCopiloto("", enCurso)];
    // Lo del server sólo si contesta a lo escrito ahora: si no, parpadean resultados viejos.
    const delServer = remoto.q === texto ? remoto : { vuelos: [], aerodromos: [] };
    const encontrados = [
      ...buscarPantallas(texto, 5).map(deResultado),
      ...delServer.aerodromos,
      ...delServer.vuelos,
      ...buscarGuias(texto, 3).map(deResultado),
    ];
    // Mientras el server busca, "no encontré nada" todavía no es cierto: el copiloto espera abajo.
    const respondio = remoto.q === texto;
    return respondio && copilotoPrimero(texto, encontrados.length)
      ? [alCopiloto(texto, enCurso), ...encontrados]
      : [...encontrados, alCopiloto(texto, enCurso)];
  }, [q, remoto, enCurso]);

  useEffect(() => setActivo(0), [items]);

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const ir = (item: Item | undefined) => {
    if (!item) return;
    if (item.href) {
      setAbierto(false);
      router.push(item.href);
      return;
    }
    setModo("copiloto");
    setQ("");
    if (item.pregunta) void copiloto.enviar(item.pregunta);
  };

  const preguntar = () => {
    if (!borrador.trim() || copiloto.pensando) return;
    void copiloto.enviar(borrador);
    setBorrador("");
  };

  const alTeclearEnLaEntrada = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }
    if (modo === "copiloto") {
      if (e.key === "Enter") {
        e.preventDefault();
        preguntar();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(items[activo]);
    }
  };

  const texto = q.trim();
  const conversando = modo === "copiloto";

  return (
    <>
      {variante === "barra" ? (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center gap-2 h-9 w-64 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 pl-3 pr-2 text-sm text-zinc-400 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Buscar o preguntar</span>
          <kbd className="font-mono text-[11px] font-semibold rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-black/40 px-1.5 py-0.5 text-zinc-500">
            {esMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Buscar o preguntarle al copiloto"
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
      )}

      {abierto &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-zinc-950/40 dark:bg-black/70 backdrop-blur-sm px-4 pt-[max(4rem,env(safe-area-inset-top))] md:pt-[12vh]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={conversando ? "Copiloto" : "Buscar en Vector"}
              className={`w-full overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col transition-[max-width] duration-200 ${
                conversando ? "max-w-2xl" : "max-w-xl"
              }`}
            >
              <div className="flex items-center gap-3 px-5 border-b border-zinc-100 dark:border-white/10">
                {conversando ? (
                  <button
                    type="button"
                    onClick={() => setModo("buscar")}
                    aria-label="Volver a buscar"
                    title="Volver a buscar"
                    className="w-8 h-8 -ml-2 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <Search className="w-5 h-5 shrink-0 text-zinc-400" />
                )}
                <input
                  ref={entrada}
                  value={conversando ? borrador : q}
                  onChange={(e) => (conversando ? setBorrador(e.target.value) : setQ(e.target.value))}
                  onKeyDown={alTeclearEnLaEntrada}
                  placeholder={conversando ? (enCurso ? "Seguí preguntando…" : "Preguntale al copiloto…") : "Buscá o preguntá: pantallas, vuelos, aeródromos…"}
                  aria-label={conversando ? "Tu pregunta al copiloto" : "Qué buscás"}
                  aria-controls={conversando ? undefined : "buscador-resultados"}
                  aria-activedescendant={!conversando && items[activo] ? `buscador-${activo}` : undefined}
                  role={conversando ? undefined : "combobox"}
                  aria-expanded={conversando ? undefined : true}
                  autoComplete="off"
                  spellCheck={conversando}
                  maxLength={conversando ? 1000 : undefined}
                  className="flex-1 min-w-0 h-14 bg-transparent text-base text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none"
                />
                {conversando && (
                  <span className="hidden sm:inline-flex items-center gap-1 shrink-0 rounded-full bg-aviation-blue/10 text-aviation-blue dark:text-aviation-cyan px-2.5 py-1 text-[11px] font-bold">
                    <Sparkles className="w-3 h-3" />
                    Copiloto
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="w-8 h-8 -mr-2 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {conversando ? (
                <div className="h-[min(60dvh,32rem)] overflow-y-auto custom-scrollbar">
                  <ConversacionCopiloto
                    mensajes={copiloto.mensajes}
                    pensando={copiloto.pensando}
                    error={copiloto.error}
                    alSugerir={(p) => void copiloto.enviar(p)}
                  />
                </div>
              ) : (
                <div ref={lista} id="buscador-resultados" role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
                  {texto.length < 2 && <p className="px-3 pt-2 pb-1 text-xs font-semibold text-zinc-400">Lo más buscado</p>}
                  {items.map((item, i) => {
                    const Icono = ICONOS[item.grupo];
                    const encabezado = (texto.length >= 2 || item.grupo === "Copiloto") && (i === 0 || items[i - 1].grupo !== item.grupo);
                    const esCopiloto = item.grupo === "Copiloto";
                    return (
                      <div key={item.clave}>
                        {encabezado && <p className="px-3 pt-3 pb-1 text-xs font-semibold text-zinc-400">{item.grupo}</p>}
                        <button
                          type="button"
                          id={`buscador-${i}`}
                          data-indice={i}
                          role="option"
                          aria-selected={i === activo}
                          onMouseMove={() => setActivo(i)}
                          onClick={() => ir(item)}
                          className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                            i === activo ? "bg-aviation-blue/10 dark:bg-aviation-blue/20" : ""
                          }`}
                        >
                          <span
                            className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center ${
                              i === activo || esCopiloto
                                ? "bg-aviation-blue text-white"
                                : "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            <Icono className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-semibold ${
                                esCopiloto ? "text-aviation-blue dark:text-aviation-cyan" : "text-zinc-900 dark:text-white"
                              } ${item.grupo === "Vuelos" || item.grupo === "Aeródromos" ? "font-mono" : ""}`}
                            >
                              {item.titulo}
                            </span>
                            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{item.detalle}</span>
                          </span>
                          {i === activo && <CornerDownLeft className="hidden md:block w-4 h-4 shrink-0 text-aviation-blue" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className={`${conversando ? "flex" : "hidden md:flex"} items-center gap-4 px-5 py-2.5 border-t border-zinc-100 dark:border-white/10 text-[11px] text-zinc-400`}
              >
                {conversando ? (
                  <>
                    <span className="hidden md:inline">Enter para preguntar</span>
                    <span className="hidden md:inline">Esc para cerrar</span>
                    <span className="truncate">Gemini · tu bitácora, el clima y la RAAC</span>
                    {enCurso && (
                      <button
                        type="button"
                        onClick={() => {
                          copiloto.reiniciar();
                          entrada.current?.focus();
                        }}
                        disabled={copiloto.pensando}
                        className="ml-auto shrink-0 inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Nueva conversación
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="hidden md:inline">↑↓ para moverte</span>
                    <span className="hidden md:inline">
                      {items[activo]?.grupo === "Copiloto" ? "Enter le pregunta al copiloto" : "Enter para abrir"}
                    </span>
                    <span className="hidden md:inline">Esc para cerrar</span>
                    {buscando && texto.length >= 2 && <span className="ml-auto">Buscando vuelos…</span>}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
