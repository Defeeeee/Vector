"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpen, CornerDownLeft, LayoutGrid, MapPin, Plane, Search, X } from "lucide-react";
import { buscarEnVector, type AerodromoEncontrado, type VueloEncontrado } from "@/actions/buscador";
import { splitRoute } from "@/lib/route";
import { buscarGuias, buscarPantallas, type Resultado } from "@/lib/buscador";

interface Item {
  clave: string;
  grupo: "Pantallas" | "Vuelos" | "Aeródromos" | "Guías";
  titulo: string;
  detalle: string;
  href: string;
}

/** Lo que se ofrece antes de escribir: lo que más se busca, sin red. */
const SUGERIDOS: Item[] = [
  { clave: "s1", grupo: "Pantallas", titulo: "Registrar vuelo", detalle: "Cargar un vuelo nuevo", href: "/dashboard/log-flight" },
  { clave: "s2", grupo: "Pantallas", titulo: "Pasar al CAD", detalle: "Tus vuelos al CAD de ANAC", href: "/dashboard/history/cad" },
  { clave: "s3", grupo: "Pantallas", titulo: "Plan de vuelo", detalle: "Preparar vuelo", href: "/dashboard/plan-de-vuelo" },
  { clave: "s4", grupo: "Pantallas", titulo: "Clima", detalle: "Preparar vuelo", href: "/dashboard/clima" },
];

const ICONOS = { Pantallas: LayoutGrid, Vuelos: Plane, "Aeródromos": MapPin, "Guías": BookOpen } as const;

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
 * Hay dos botones (la barra de escritorio y el encabezado del teléfono) y sólo el visible
 * atiende el atajo, para que no se abran dos. El diálogo va por portal: el encabezado tiene
 * `backdrop-blur`, y eso encierra a un `fixed` adentro de la barra.
 */
export default function BuscadorGlobal({ variante }: { variante: "barra" | "icono" }) {
  const router = useRouter();
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [remoto, setRemoto] = useState<{ q: string; vuelos: Item[]; aerodromos: Item[] }>({ q: "", vuelos: [], aerodromos: [] });
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const [esMac, setEsMac] = useState(true);

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

  // Se limpia al cerrar, no al abrir: lo que se tipea apenas se abre no se pierde.
  useEffect(() => {
    if (!abierto) {
      setQ("");
      setActivo(0);
      return;
    }
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scroll;
    };
  }, [abierto]);

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
    if (texto.length < 2) return SUGERIDOS;
    // Lo del server sólo si contesta a lo escrito ahora: si no, parpadean resultados viejos.
    const delServer = remoto.q === texto ? remoto : { vuelos: [], aerodromos: [] };
    return [
      ...buscarPantallas(texto, 5).map(deResultado),
      ...delServer.aerodromos,
      ...delServer.vuelos,
      ...buscarGuias(texto, 3).map(deResultado),
    ];
  }, [q, remoto]);

  useEffect(() => setActivo(0), [items]);

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const ir = (item: Item | undefined) => {
    if (!item) return;
    setAbierto(false);
    router.push(item.href);
  };

  const alTeclearEnLaEntrada = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(items[activo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  const texto = q.trim();
  const sinNada = texto.length >= 2 && items.length === 0 && !buscando;

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
          <span className="flex-1 text-left">Buscar en Vector</span>
          <kbd className="font-mono text-[11px] font-semibold rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-black/40 px-1.5 py-0.5 text-zinc-500">
            {esMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Buscar en Vector"
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
              aria-label="Buscar en Vector"
              className="w-full max-w-xl overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-5 border-b border-zinc-100 dark:border-white/10">
                <Search className="w-5 h-5 shrink-0 text-zinc-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={alTeclearEnLaEntrada}
                  placeholder="Pantallas, vuelos, aeródromos, guías…"
                  aria-label="Qué buscás"
                  aria-controls="buscador-resultados"
                  aria-activedescendant={items[activo] ? `buscador-${activo}` : undefined}
                  role="combobox"
                  aria-expanded="true"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 h-14 bg-transparent text-base text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="w-8 h-8 -mr-2 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div ref={lista} id="buscador-resultados" role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
                {texto.length < 2 && <p className="px-3 pt-2 pb-1 text-xs font-semibold text-zinc-400">Lo más buscado</p>}
                {items.map((item, i) => {
                  const Icono = ICONOS[item.grupo];
                  const encabezado = texto.length >= 2 && (i === 0 || items[i - 1].grupo !== item.grupo);
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
                            i === activo ? "bg-aviation-blue text-white" : "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          <Icono className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-semibold text-zinc-900 dark:text-white ${
                              item.grupo === "Vuelos" || item.grupo === "Aeródromos" ? "font-mono" : ""
                            }`}
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
                {buscando && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-400">Buscando…</p>}
                {sinNada && (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Nada con &ldquo;{texto}&rdquo;. Probá con una ruta (SADF), una matrícula o el nombre de una pantalla.
                  </p>
                )}
              </div>

              <div className="hidden md:flex items-center gap-4 px-5 py-2.5 border-t border-zinc-100 dark:border-white/10 text-[11px] text-zinc-400">
                <span>↑↓ para moverte</span>
                <span>Enter para abrir</span>
                <span>Esc para cerrar</span>
                {buscando && texto.length >= 2 && <span className="ml-auto">Buscando vuelos…</span>}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
