"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Download, Loader2, MonitorPlay, RefreshCw, Undo2, Upload } from "lucide-react";
import { marcarEnElCad, omitirEnElCad, guardarSimuladorCad, traerDelCad } from "@/actions/cad";
import { fuenteServidor, type FuenteCad } from "@/components/dashboard/cad/fuente-cad";
import {
  CLASES_SIMULADOR,
  claveDeAutoridad,
  faltaAutoridad,
  faltaSimulador,
  recordarAutoridades,
  simuladorSugerido,
  type AutoridadCad,
  type FilaCad,
  type FilaTraida,
  type ItemCad,
  type MemoriaAutoridades,
  type DatosPanelCad as DatosPanel,
  type MotivoOmitido,
  type SimuladorCad,
} from "@/lib/cad";

/** La misma memoria que el marcador, pero en el navegador de Vector. */
const CLAVE_MEMORIA = "vector-cad-autoridades";

function leerMemoria(): MemoriaAutoridades | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_MEMORIA) ?? "null") as MemoriaAutoridades | null;
  } catch {
    return null;
  }
}
function guardarMemoria(m: MemoriaAutoridades) {
  try {
    localStorage.setItem(CLAVE_MEMORIA, JSON.stringify(m));
  } catch {
    /* sin almacenamiento, la próxima vez se propone vacía */
  }
}

type Fila = FilaCad & { resultado?: { ok: boolean; texto: string } };
type Paso = "elegir" | "confirmar" | "cargando" | "listo";

const horas = (n: number) => n.toFixed(1).replace(".", ",");
const vuelos = (k: number) => (k === 1 ? "1 vuelo" : `${k} vuelos`);
const control =
  "w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl py-2 px-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white/50";
const enlace = "text-xs font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline underline-offset-2";
const botonNegro =
  "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-40";
const botonGris =
  "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white text-sm font-semibold disabled:opacity-40";

/**
 * El panel de "Pasar al CAD desde Vector": el mismo recorrido que el panel del marcador
 * (el viejo `src/cad/puente.ts`, borrado en la 2.36.2), en la estética de Vector y con el CAD del otro lado del backend.
 */
/**
 * `fuente`: de dónde sale el CAD (`fuente-cad.ts`). Por defecto el backend; con la extensión o
 * el marcador, la pestaña del CAD del piloto.
 */
export default function PanelCad({ fuente = fuenteServidor }: { fuente?: FuenteCad }) {
  const router = useRouter();
  const [modo, setModo] = useState<"llevar" | "traer">("llevar");
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [error, setError] = useState<{ texto: string; reconectar?: boolean } | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [paso, setPaso] = useState<Paso>("elegir");
  const [aviso, setAviso] = useState("");
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });

  const leer = useCallback(async () => {
    setError(null);
    setDatos(null);
    const r = await fuente.preparar(leerMemoria());
    if (!r.ok) {
      setError({ texto: r.error, reconectar: r.reconectar });
      if (r.reconectar) router.refresh();
      return;
    }
    setDatos(r.datos);
    setFilas(r.datos.filas);
    setPaso("elegir");
    setAviso("");
  }, [router, fuente]);

  useEffect(() => {
    void leer();
  }, [leer]);

  /** Después de traer vuelos: la cuenta de la pestaña, sin volver a dibujar todo. */
  const recontar = useCallback(async () => {
    const r = await fuente.preparar(leerMemoria());
    if (r.ok) setDatos((d) => (d ? { ...d, sinTraer: r.datos.sinTraer } : d));
    router.refresh();
  }, [router, fuente]);

  const porCargar = filas.filter((f) => !f.omitido && f.ids && !f.enElCad && !f.resultado?.ok);
  const elegidas = porCargar.filter((f) => f.elegido);
  const yaEstan = filas.filter((f) => !f.omitido && f.enElCad);
  const revisar = filas.filter((f) => !f.omitido && f.problema);
  const omitidas = filas.filter((f) => f.omitido);
  const cargadas = filas.filter((f) => f.resultado?.ok);
  const anteriores = porCargar.filter((f) => f.anterior);
  const horasElegidas = elegidas.reduce((t, f) => t + f.b.horas, 0);

  const cambiar = (vectorId: string, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.b.vectorId === vectorId ? { ...f, ...cambio } : f)));

  async function omitir(sel: Fila[], motivo: MotivoOmitido | null) {
    if (!sel.length) return;
    const ids = new Set(sel.map((f) => f.b.vectorId));
    const antes = filas;
    setFilas((fs) => fs.map((f) => (ids.has(f.b.vectorId) ? { ...f, omitido: motivo, elegido: false } : f)));
    const r = await omitirEnElCad(sel.map((f) => ({ vectorId: f.b.vectorId, motivo })));
    if (r.cambiados < sel.length) {
      setFilas(antes);
      setAviso("No pudimos guardarlo en Vector. Probá de nuevo.");
    }
  }

  function validar(): boolean {
    const sinSimulador = elegidas.filter((f) => faltaSimulador(f.b)).length;
    const sinAutoridad = elegidas.filter((f) => faltaAutoridad(f.autoridad)).length;
    setAviso(
      sinSimulador
        ? "Elegí cuál es tu simulador en el CAD y su clase."
        : sinAutoridad
          ? `A ${sinAutoridad === 1 ? "1 vuelo le falta" : `${sinAutoridad} vuelos les falta`} la autoridad o el nombre: el CAD los pide en cada vuelo.`
          : ""
    );
    return !sinSimulador && !sinAutoridad;
  }

  async function cargar() {
    const sel = elegidas;
    setPaso("cargando");
    setProgreso({ hechos: 0, total: sel.length });
    const hechas: { finalidad: string; autoridad: AutoridadCad }[] = [];
    for (let k = 0; k < sel.length; k++) {
      const f = sel[k];
      const r = await fuente.cargar({ vectorId: f.b.vectorId, ids: f.ids!, autoridad: f.autoridad, simulador: f.b.simulador?.cad ?? undefined });
      if (r.ok) hechas.push({ finalidad: claveDeAutoridad(f.b), autoridad: f.autoridad });
      setFilas((fs) =>
        fs.map((x) => (x.b.vectorId === f.b.vectorId ? { ...x, elegido: r.ok ? x.elegido : false, resultado: { ok: r.ok, texto: r.mensaje } } : x))
      );
      setProgreso({ hechos: k + 1, total: sel.length });
    }
    guardarMemoria(recordarAutoridades(leerMemoria(), hechas));
    setPaso("listo");
    void recontar();
  }

  async function anotarLosQueEstan() {
    const r = await marcarEnElCad(yaEstan.map((f) => ({ vectorId: f.b.vectorId, cadId: f.enElCad! })));
    if (r.marcados) {
      setFilas((fs) => fs.filter((f) => !f.enElCad));
      void recontar();
    } else setAviso("No pudimos anotarlos en Vector. Probá de nuevo.");
  }

  if (error)
    return (
      <Aviso tono="error">
        <p className="font-semibold">{error.texto}</p>
        {!error.reconectar && (
          <button onClick={() => void leer()} className={`${enlace} mt-2 inline-flex items-center gap-1`}>
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Probar de nuevo
          </button>
        )}
      </Aviso>
    );

  if (!datos)
    return (
      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 px-5 py-10 text-center space-y-2">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Leyendo tu CAD…</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Entramos con tu cuenta y comparamos con tu bitácora. Tarda unos segundos.</p>
      </div>
    );

  const total = filas.length - omitidas.length || 1;
  const pct = (n: number) => `${(100 * n) / total}%`;

  return (
    <div className="space-y-6">
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/5 max-w-md">
        {(
          [
            ["llevar", "Pasar al CAD", porCargar.length, Upload],
            ["traer", "Traer a Vector", datos.sinTraer, Download],
          ] as const
        ).map(([m, texto, n, Icono]) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              modo === m ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Icono className="w-4 h-4" aria-hidden="true" />
            {texto}
            <span className="data text-xs opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {modo === "traer" ? (
        <Traer fuente={fuente} alTraer={() => void recontar()} alLeer={(n) => setDatos((d) => (d ? { ...d, sinTraer: n } : d))} />
      ) : filas.length === 0 ? (
        <Aviso tono="ok">
          <p className="font-semibold">Todos tus vuelos de Vector ya están en el CAD.</p>
        </Aviso>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/5" role="img" aria-label={`${yaEstan.length + cargadas.length} en el CAD, ${porCargar.length} por cargar, ${revisar.length} para revisar`}>
              <span className="bg-emerald-500 transition-all duration-500" style={{ width: pct(yaEstan.length + cargadas.length) }} />
              <span className="bg-aviation-blue dark:bg-aviation-cyan transition-all duration-500" style={{ width: pct(porCargar.length) }} />
              <span className="bg-amber-400 transition-all duration-500" style={{ width: pct(revisar.length) }} />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              <b className="data text-zinc-900 dark:text-white">{porCargar.length}</b> por cargar, <b className="data text-zinc-900 dark:text-white">{yaEstan.length + cargadas.length}</b> ya están
              {revisar.length > 0 && (
                <>
                  {" "}y <b className="data text-zinc-900 dark:text-white">{revisar.length}</b> para revisar
                </>
              )}
              . Quedan &quot;Pendiente de DDJJ&quot;: la declaración la hacés vos en el CAD.
            </p>
            {datos.devueltos > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {datos.devueltos === 1 ? "1 vuelo que ya no está en tu CAD volvió" : `${datos.devueltos} vuelos que ya no están en tu CAD volvieron`} a la lista para
                pasarlo de nuevo.
              </p>
            )}
          </section>

          {paso === "elegir" && <Simuladores fuente={fuente} filas={porCargar} simuladores={datos.simuladores} alElegir={(avionId, s) => setFilas((fs) => fs.map((f) => (f.b.simulador?.avionId === avionId ? { ...f, b: { ...f.b, clase: s.clase, simulador: { ...f.b.simulador, cad: s } } } : f)))} />}

          {revisar.length > 0 && (
            <Seccion titulo="Para revisar" detalle="No se mandan hasta corregirlos">
              {revisar.map((f) => (
                <Renglon key={f.b.vectorId} f={f} tono="revisar">
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-2 leading-relaxed">
                    {f.problema}{" "}
                    <Link href={`/dashboard/history?editar=${encodeURIComponent(f.b.vectorId)}`} className="font-semibold underline underline-offset-2">
                      Corregir
                    </Link>
                  </p>
                  {paso === "elegir" && <Accion onClick={() => void omitir([f], "ignorado")}>Ignorar</Accion>}
                </Renglon>
              ))}
            </Seccion>
          )}

          {(porCargar.length > 0 || cargadas.length > 0) && (
            <Seccion
              titulo="Por cargar"
              detalle={
                porCargar.length > 1 && paso === "elegir" ? (
                  <span className="flex gap-3">
                    <button className={enlace} onClick={() => setFilas((fs) => fs.map((f) => (porCargar.includes(f) ? { ...f, elegido: true } : f)))}>
                      Todos
                    </button>
                    <button className={enlace} onClick={() => setFilas((fs) => fs.map((f) => (porCargar.includes(f) ? { ...f, elegido: false } : f)))}>
                      Ninguno
                    </button>
                  </span>
                ) : undefined
              }
            >
              {anteriores.length > 0 && paso === "elegir" && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 px-1">
                  {anteriores.length === 1 ? "1 es anterior" : `${anteriores.length} son anteriores`} a tu primer vuelo en el CAD: ¿ya estaban foliados?{" "}
                  <button className={enlace} onClick={() => void omitir(anteriores, "foliado")}>
                    {anteriores.length === 1 ? "Marcarlo" : "Marcarlos"} como ya foliado{anteriores.length === 1 ? "" : "s"}
                  </button>
                </p>
              )}
              {[...cargadas, ...porCargar].map((f) => (
                <Renglon
                  key={f.b.vectorId}
                  f={f}
                  tono={f.resultado ? (f.resultado.ok ? "ok" : "error") : f.elegido ? "elegido" : undefined}
                  caja={paso === "elegir" && !f.resultado?.ok ? (v) => cambiar(f.b.vectorId, { elegido: v }) : undefined}
                >
                  {f.resultado ? (
                    <p className={`text-xs mt-2 font-semibold ${f.resultado.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{f.resultado.texto}</p>
                  ) : paso === "elegir" && f.elegido ? (
                    <Autoridad
                      a={f.autoridad}
                      lista={datos.autoridades}
                      falta={!!aviso && faltaAutoridad(f.autoridad)}
                      alCambiar={(a) => cambiar(f.b.vectorId, { autoridad: a })}
                      alRepetir={() => setFilas((fs) => fs.map((x) => (x.elegido && faltaAutoridad(x.autoridad) ? { ...x, autoridad: { ...f.autoridad } } : x)))}
                    />
                  ) : null}
                  {paso === "elegir" && !f.resultado && <Accion onClick={() => void omitir([f], "foliado")}>Ya foliado</Accion>}
                </Renglon>
              ))}
            </Seccion>
          )}

          {omitidas.length > 0 && (
            <Plegable titulo="Fuera de la lista" n={omitidas.length} detalle="ya foliados o ignorados">
              {omitidas.map((f) => (
                <Renglon key={f.b.vectorId} f={f} tono="apagado">
                  <span className="text-xs text-zinc-500">{f.omitido === "foliado" ? "Ya foliado" : "Ignorado"}</span>
                  {paso === "elegir" && (
                    <Accion onClick={() => void omitir([f], null)}>
                      <Undo2 className="w-3 h-3" aria-hidden="true" /> Deshacer
                    </Accion>
                  )}
                </Renglon>
              ))}
            </Plegable>
          )}

          {yaEstan.length > 0 && (
            <Plegable titulo="Ya están en el CAD" n={yaEstan.length}>
              {yaEstan.map((f) => (
                <Renglon key={f.b.vectorId} f={f} tono="apagado" />
              ))}
              <button onClick={() => void anotarLosQueEstan()} className={`${botonGris} mt-1`}>
                Anotarlos en Vector
              </button>
            </Plegable>
          )}

          <Pie>
            {paso === "cargando" ? (
              <div className="space-y-2 w-full">
                <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                  <i className="block h-full bg-aviation-blue dark:bg-aviation-cyan transition-all duration-300" style={{ width: `${(100 * progreso.hechos) / (progreso.total || 1)}%` }} />
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Cargando <span className="data">{Math.min(progreso.hechos + 1, progreso.total)}</span> de <span className="data">{progreso.total}</span>…
                </p>
              </div>
            ) : paso === "listo" ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                <p className="text-sm flex-1">
                  <b className="text-zinc-900 dark:text-white">{cargadas.length === 1 ? "Cargaste 1 vuelo" : `Cargaste ${cargadas.length} vuelos`} en el CAD.</b>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">Ahora hacé la declaración en &quot;DDJJ de Horas de vuelo&quot;, en el CAD.</span>
                </p>
                <a href="https://cad.anac.gob.ar/portalApp/" target="_blank" rel="noopener noreferrer" className={botonNegro}>
                  Abrir el CAD
                </a>
                {porCargar.length > 0 && (
                  <button className={botonGris} onClick={() => setPaso("elegir")}>
                    Seguir
                  </button>
                )}
              </div>
            ) : paso === "confirmar" ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                <p className="text-sm flex-1 text-zinc-700 dark:text-zinc-300">
                  ¿Cargar <b className="text-zinc-900 dark:text-white">{vuelos(elegidas.length)}</b> (<span className="data">{horas(horasElegidas)}</span> h) en tu CAD?
                </p>
                <button className={botonNegro} onClick={() => void cargar()}>
                  <Upload className="w-4 h-4" aria-hidden="true" /> Cargar en el CAD
                </button>
                <button className={botonGris} onClick={() => setPaso("elegir")}>
                  Volver
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                {aviso ? (
                  <p className="text-sm text-red-600 dark:text-red-400 flex-1" role="alert">
                    {aviso}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex-1">Cada vuelo lleva su autoridad certificante. Vector te propone la última que usaste.</p>
                )}
                <button className={botonNegro} disabled={!elegidas.length} onClick={() => validar() && setPaso("confirmar")}>
                  {elegidas.length ? (
                    <>
                      Cargar {vuelos(elegidas.length)} · <span className="data">{horas(horasElegidas)}</span> h
                    </>
                  ) : (
                    "Elegí los vuelos a cargar"
                  )}
                </button>
              </div>
            )}
          </Pie>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- las piezas --- */

function Aviso({ tono, children }: { tono: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-3xl border px-5 py-4 text-sm ${
        tono === "ok"
          ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
          : "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-900 dark:text-red-200"
      }`}
    >
      {children}
    </div>
  );
}

function Seccion({ titulo, detalle, children }: { titulo: string; detalle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">{titulo}</h3>
        {typeof detalle === "string" ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{detalle}</span> : detalle}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Plegable({ titulo, n, detalle, children }: { titulo: string; n: number; detalle?: string; children: React.ReactNode }) {
  return (
    <details className="group space-y-2.5">
      <summary className="flex items-center gap-2 cursor-pointer list-none px-1 text-[15px] font-bold text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
        <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform -rotate-90 group-open:rotate-0" aria-hidden="true" />
        {titulo} <span className="data text-sm font-medium text-zinc-500 dark:text-zinc-400">{n}</span>
        {detalle && <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">· {detalle}</span>}
      </summary>
      <div className="space-y-2">{children}</div>
    </details>
  );
}

const TONOS = {
  elegido: "border-aviation-blue/30 dark:border-aviation-cyan/30 bg-white dark:bg-white/[0.03]",
  revisar: "border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/[0.07]",
  ok: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/[0.07]",
  error: "border-red-200 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/[0.07]",
  apagado: "border-zinc-100 dark:border-white/5 opacity-70",
} as const;

function Renglon({
  f,
  tono,
  caja,
  children,
}: {
  f: Fila;
  tono?: keyof typeof TONOS;
  caja?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  const simulador = f.b.tipoVueloID === 3;
  const meta = [simulador ? null : f.b.matricula, `${horas(f.b.horas)} h`, f.b.finalidad.toLowerCase()].filter(Boolean).join(" · ");
  return (
    <div className={`rounded-2xl border px-4 py-3 transition-colors ${tono ? TONOS[tono] : "border-zinc-200 dark:border-white/10"}`}>
      <div className="flex items-start gap-3">
        {caja ? (
          <input
            type="checkbox"
            checked={f.elegido}
            onChange={(e) => caja(e.target.checked)}
            className="mt-1 w-4 h-4 shrink-0 accent-zinc-900 dark:accent-white cursor-pointer"
            aria-label={`Cargar el vuelo del ${f.b.fecha}`}
          />
        ) : f.resultado?.ok ? (
          <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : tono === "revisar" ? (
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="data text-xs text-zinc-500 dark:text-zinc-400 shrink-0">{f.b.fecha}</span>
            <span className="data text-sm font-bold text-zinc-900 dark:text-white truncate inline-flex items-center gap-1.5">
              {simulador && <MonitorPlay className="w-3.5 h-3.5 text-aviation-blue dark:text-aviation-cyan shrink-0" aria-hidden="true" />}
              {f.b.ruta || "Sin ruta"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{meta}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function Accion({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mt-2 mr-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
      {children}
    </button>
  );
}

function Autoridad({
  a,
  lista,
  falta,
  alCambiar,
  alRepetir,
}: {
  a: AutoridadCad;
  lista: ItemCad[];
  falta: boolean;
  alCambiar: (a: AutoridadCad) => void;
  alRepetir: () => void;
}) {
  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-2">
      <select value={a.id} onChange={(e) => alCambiar({ ...a, id: e.target.value })} className={`${control} ${falta && !a.id ? "border-red-400" : ""}`} aria-label="Autoridad certificante">
        <option value="">Autoridad certificante…</option>
        {lista.map((x) => (
          <option key={x.key} value={x.key}>
            {x.value}
          </option>
        ))}
      </select>
      <input
        value={a.nombre}
        onChange={(e) => alCambiar({ ...a, nombre: e.target.value })}
        placeholder="Nombre y apellido"
        className={`${control} uppercase placeholder:normal-case ${falta && !a.nombre.trim() ? "border-red-400" : ""}`}
        aria-label="Nombre y apellido de la autoridad"
      />
      {!faltaAutoridad(a) && (
        <button onClick={alRepetir} className={`${enlace} justify-self-start sm:col-span-2`}>
          Usar esta autoridad en los que no tienen
        </button>
      )}
    </div>
  );
}

/** Cuál es cada simulador del Hangar en el CAD: se elige una vez y queda en el equipo. */
function Simuladores({
  fuente,
  filas,
  simuladores,
  alElegir,
}: {
  fuente: FuenteCad;
  filas: Fila[];
  simuladores: ItemCad[];
  alElegir: (avionId: string, s: SimuladorCad) => void;
}) {
  const equipos = useMemo(() => {
    const m = new Map<string, { equipo: string; cad: SimuladorCad | null; n: number }>();
    for (const f of filas) {
      const s = f.b.simulador;
      if (!s?.avionId) continue;
      const e = m.get(s.avionId) ?? { equipo: s.equipo, cad: s.cad, n: 0 };
      e.n++;
      m.set(s.avionId, e);
    }
    return [...m.entries()];
  }, [filas]);
  if (!equipos.length) return null;
  return (
    <div className="space-y-2.5">
      {equipos.map(([avionId, e]) => (
        <EquipoSimulador key={avionId} fuente={fuente} avionId={avionId} {...e} simuladores={simuladores} alElegir={alElegir} />
      ))}
    </div>
  );
}

function EquipoSimulador({
  fuente,
  avionId,
  equipo,
  cad,
  n,
  simuladores,
  alElegir,
}: {
  fuente: FuenteCad;
  avionId: string;
  equipo: string;
  cad: SimuladorCad | null;
  n: number;
  simuladores: ItemCad[];
  alElegir: (avionId: string, s: SimuladorCad) => void;
}) {
  const [simId, setSimId] = useState(cad ? String(cad.id) : simuladorSugerido(equipo, simuladores)?.key ?? "");
  const [clase, setClase] = useState(cad?.clase ?? "");
  const [guardando, setGuardando] = useState(false);
  const [nota, setNota] = useState("");
  const listo = !!cad && !faltaSimulador({ tipoVueloID: 3 } as FilaCad["b"], cad);
  const [abierto, setAbierto] = useState(!listo);

  async function guardar() {
    const item = simuladores.find((s) => s.key === simId);
    if (!item || !clase) return setNota("Elegí el simulador y su clase.");
    setGuardando(true);
    const s: SimuladorCad = { id: Number(item.key), nombre: item.value, clase, ...(await fuente.modelo(Number(item.key))) };
    const r = await guardarSimuladorCad(avionId, s);
    setGuardando(false);
    alElegir(avionId, s);
    setNota(r.ok ? "" : "Quedó elegido para esta vez, pero no pudimos guardarlo en el Hangar.");
    setAbierto(false);
  }

  return (
    <div className="rounded-3xl border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.04] dark:bg-aviation-cyan/[0.05] p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-aviation-blue dark:bg-aviation-cyan shrink-0">
          <MonitorPlay className="w-4 h-4 text-white dark:text-zinc-900" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            {equipo} <span className="font-medium text-zinc-500 dark:text-zinc-400">· {n === 1 ? "1 sesión" : `${n} sesiones`}</span>
          </p>
          {listo && !abierto ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
              En el CAD: <b>{cad!.nombre}</b>, clase <b className="data">{cad!.clase}</b>.{" "}
              <button className={enlace} onClick={() => setAbierto(true)}>
                Cambiar
              </button>
            </p>
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">¿Cuál es en el CAD? Se elige una vez y queda guardado en el Hangar.</p>
          )}
        </div>
      </div>
      {abierto && (
        <div className="space-y-3">
          <select value={simId} onChange={(e) => setSimId(e.target.value)} className={control} aria-label="Simulador en el CAD">
            <option value="">Elegí el simulador…</option>
            {simuladores.map((s) => (
              <option key={s.key} value={s.key}>
                {s.value}
              </option>
            ))}
          </select>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Clase del dispositivo, como figura en el CAD</p>
            <div className="flex flex-wrap gap-1.5">
              {CLASES_SIMULADOR.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClase(c)}
                  aria-pressed={clase === c}
                  className={`data px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    clase === c
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
                      : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void guardar()} disabled={guardando || !simId || !clase} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold disabled:opacity-40">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Guardar
            </button>
            {nota && <p className="text-xs text-amber-700 dark:text-amber-400">{nota}</p>}
          </div>
        </div>
      )}
      {!abierto && nota && <p className="text-xs text-amber-700 dark:text-amber-400">{nota}</p>}
    </div>
  );
}

/**
 * La barra de abajo, flotando sobre la pantalla mientras se recorre la lista (en el teléfono,
 * arriba de la píldora). Va a `body`: el `main` del layout tiene su propio scroll y un
 * `sticky` adentro no se pega.
 */
function Pie({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const barra = (
    <div className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 w-[min(44rem,calc(100vw-2rem))]">
      <div className="flex items-center gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-cal dark:shadow-2xl px-4 py-3 md:px-5">
        {children}
      </div>
    </div>
  );
  return (
    <>
      {/* Lo que ocupa la barra, para que no tape el último vuelo. */}
      <div className="h-24" aria-hidden="true" />
      {montado && createPortal(barra, document.body)}
    </>
  );
}

/* --------------------------------------------------------- traer a Vector --- */

/**
 * `alLeer` le pasa al panel cuántos quedaron para traer o revisar: la cuenta de la pestaña se
 * calculó al abrir el panel, y si después se anotó un vuelo quedaba vieja (Federico, 2026-10-28:
 * decía 1 y adentro no había nada).
 */
function Traer({ fuente, alTraer, alLeer }: { fuente: FuenteCad; alTraer: () => void; alLeer: (n: number) => void }) {
  const [filas, setFilas] = useState<{ t: FilaTraida; elegido: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>("elegir");
  const [resultado, setResultado] = useState<{ creados: number; yaEstaban: number; rechazados: number; error?: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fuente.leerParaTraer();
      if (!r.ok) setError(r.error);
      else {
        setFilas(r.datos.map((t) => ({ t, elegido: !t.problema })));
        alLeer(r.datos.length);
      }
    })();
    // Se lee una vez, al entrar a la pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error)
    return (
      <Aviso tono="error">
        <p className="font-semibold">{error}</p>
      </Aviso>
    );
  if (!filas)
    return (
      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 px-5 py-10 text-center space-y-2">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Leyendo tus vuelos del CAD…</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Se leen de a uno: con muchos vuelos tarda un poco.</p>
      </div>
    );

  const listos = filas.filter((x) => x.t.vuelo);
  const revisar = filas.filter((x) => x.t.problema);
  const sel = listos.filter((x) => x.elegido);
  const h = sel.reduce((t, x) => t + x.t.horas, 0);

  async function traer() {
    setPaso("cargando");
    const r = await traerDelCad(sel.map((x) => x.t.vuelo));
    setResultado(r);
    if (r.creados + r.yaEstaban > 0) {
      const ids = new Set(sel.map((x) => x.t.cadId));
      setFilas((fs) => (fs ?? []).filter((x) => !ids.has(x.t.cadId)));
      alTraer();
    }
    setPaso("listo");
  }

  if (filas.length === 0 && paso !== "listo")
    return (
      <Aviso tono="ok">
        <p className="font-semibold">Todos tus vuelos del CAD ya están en Vector.</p>
      </Aviso>
    );

  const fila = (x: { t: FilaTraida; elegido: boolean }, conCaja: boolean) => (
    <div key={x.t.cadId} className={`rounded-2xl border px-4 py-3 ${x.t.problema ? TONOS.revisar : x.elegido ? TONOS.elegido : "border-zinc-200 dark:border-white/10"}`}>
      <div className="flex items-start gap-3">
        {conCaja ? (
          <input
            type="checkbox"
            checked={x.elegido}
            onChange={(e) => setFilas((fs) => (fs ?? []).map((y) => (y.t.cadId === x.t.cadId ? { ...y, elegido: e.target.checked } : y)))}
            className="mt-1 w-4 h-4 shrink-0 accent-zinc-900 dark:accent-white cursor-pointer"
            aria-label={`Traer el vuelo del ${x.t.fecha}`}
          />
        ) : (
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="data text-xs text-zinc-500 dark:text-zinc-400 shrink-0">{x.t.fecha || "¿?"}</span>
            <span className="data text-sm font-bold text-zinc-900 dark:text-white truncate">{x.t.ruta || "Sin ruta"}</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{[x.t.matricula, `${horas(x.t.horas)} h`, x.t.finalidad.toLowerCase()].filter(Boolean).join(" · ")}</p>
          {x.t.problema && <p className="text-xs text-amber-800 dark:text-amber-300 mt-2">{x.t.problema}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-prose">
        Se agregan a tu bitácora con el desglose del libro, marcados como &quot;En el CAD&quot;, y no se descuentan de tu saldo. Si en Vector cargaste los totales de tu libro, traé sólo los
        posteriores a esa hoja.
      </p>
      {revisar.length > 0 && <Seccion titulo="Para revisar" detalle="No se traen">{revisar.map((x) => fila(x, false))}</Seccion>}
      {listos.length > 0 && <Seccion titulo="Para traer">{listos.map((x) => fila(x, paso === "elegir"))}</Seccion>}
      <Pie>
        {paso === "listo" && resultado ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <p className="text-sm flex-1">
              <b className="text-zinc-900 dark:text-white">{resultado.creados === 1 ? "Trajiste 1 vuelo" : `Trajiste ${resultado.creados} vuelos`} a Vector.</b>
              {resultado.yaEstaban > 0 && ` ${resultado.yaEstaban} ya estaban.`}
              {resultado.rechazados > 0 && <span className="text-red-600 dark:text-red-400"> {resultado.rechazados} no entraron.</span>}
              {resultado.error && <span className="text-red-600 dark:text-red-400"> {resultado.error}</span>}
            </p>
            <Link href="/dashboard/history" className={botonNegro}>
              Ver mi bitácora
            </Link>
          </div>
        ) : paso === "confirmar" ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <p className="text-sm flex-1">
              ¿Traer <b>{vuelos(sel.length)}</b> (<span className="data">{horas(h)}</span> h) a tu bitácora?
            </p>
            <button className={botonNegro} onClick={() => void traer()}>
              <Download className="w-4 h-4" aria-hidden="true" /> Traer a Vector
            </button>
            <button className={botonGris} onClick={() => setPaso("elegir")}>
              Volver
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 w-full">
            {paso === "cargando" && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-hidden="true" />}
            <button className={botonNegro} disabled={!sel.length || paso === "cargando"} onClick={() => setPaso("confirmar")}>
              {sel.length ? (
                <>
                  Traer {vuelos(sel.length)} · <span className="data">{horas(h)}</span> h
                </>
              ) : (
                "Elegí los vuelos a traer"
              )}
            </button>
          </div>
        )}
      </Pie>
    </div>
  );
}
