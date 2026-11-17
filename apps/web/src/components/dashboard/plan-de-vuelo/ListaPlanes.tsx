"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CloudOff, Copy, FilePlus2, Loader2, Plane, Route, Trash2 } from "lucide-react";
import { asegurarPlan, borrarPlan, duplicarPlan } from "@/actions/plan-de-vuelo";
import { borradorParaRecuperar, claveBorrador, leerBorrador } from "@/lib/borrador-plan";
import { borradoresPendientes, nuevoIdDePlan, urlDePlanNuevo, type BorradorPendiente } from "@/lib/plan-nuevo";
import { EstadoRespuesta } from "./RespuestasOficina";
import type { ClasificacionRespuesta } from "@/lib/respuesta-plan";
import { leerFormulario, type AvionParaPlan } from "@/lib/formulario-plan";

export interface FilaPlan {
  id: string;
  salida: string | null;
  destino: string | null;
  matricula: string | null;
  /** Ya escrito en el server: "20/10 15:30 · 1830Z". */
  cuando: string;
  estado: "borrador" | "completo" | "descargado" | "enviado" | "cancelado" | "volado";
  /** Lo último que contestó la oficina, y cuándo (ya escrito en el server). */
  respuesta: ClasificacionRespuesta | null;
  respuestaCuando: string;
}

const ESTADOS: Record<FilaPlan["estado"], { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  completo: { texto: "Completo", clase: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  descargado: { texto: "PDF bajado", clase: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400" },
  enviado: { texto: "Enviado", clase: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" },
  cancelado: { texto: "Cancelado", clase: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400" },
  volado: { texto: "Volado", clase: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
};

export default function ListaPlanes({
  filas,
  aviones,
}: {
  filas: FilaPlan[] | null;
  aviones: AvionParaPlan[];
}) {
  const [pendiente, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrados, setBorrados] = useState<Set<string>>(new Set());

  const correr = (clave: string, accion: () => Promise<{ error?: string } | { ok: true } | void>) => {
    setError(null);
    setOcupado(clave);
    startTransition(async () => {
      const r = await accion();
      if (r && "error" in r && r.error) setError(r.error);
      setOcupado(null);
    });
  };

  const router = useRouter();
  // `true` hasta que se sabe lo contrario: así el primer dibujo del navegador es el del servidor.
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState<BorradorPendiente[]>([]);
  const subiendo = useRef(false);

  /**
   * Un plan nuevo, con o sin señal (`lib/plan-nuevo.ts`): el navegador le pone el id y abre el editor, que
   * lo crea en el servidor apenas hay red. Un solo camino: no pasa por el servidor para empezar.
   */
  const nuevo = (avion: AvionParaPlan | null) => {
    setOcupado(`nuevo-${avion?.id ?? "sin"}`);
    router.push(urlDePlanNuevo(nuevoIdDePlan(), avion?.id));
    // Si la navegación no llega a pasar, que el botón no quede trabado.
    setTimeout(() => setOcupado(null), 8000);
  };

  /** Lo armado sin señal que el servidor todavía no tiene (los borradores del teléfono). */
  const leerPendientes = useCallback(() => {
    try {
      const entradas: [string, string | null][] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const clave = localStorage.key(i);
        if (clave) entradas.push([clave, localStorage.getItem(clave)]);
      }
      setPendientes(borradoresPendientes(entradas, filas ? new Set(filas.map((f) => f.id.toLowerCase())) : null));
    } catch {
      setPendientes([]);
    }
  }, [filas]);

  /**
   * Con red, sube los planes armados sin señal. El servidor los crea con el id que ya tienen (idempotente);
   * el borrador del teléfono se borra salvo que sea **más nuevo** que el plan que ya estaba en el servidor
   * (una edición de otro momento: la sube el editor al abrirlo, `borradorParaRecuperar`).
   */
  const subirPendientes = useCallback(
    async (lista: BorradorPendiente[]) => {
      if (subiendo.current || lista.length === 0) return;
      subiendo.current = true;
      let alguno = false;
      try {
        for (const p of lista) {
          let texto: string | null = null;
          try {
            texto = localStorage.getItem(claveBorrador(p.id));
          } catch {
            continue;
          }
          const borrador = leerBorrador<unknown>(texto);
          if (!borrador) continue;
          const r = await asegurarPlan(p.id, leerFormulario(borrador.formulario)).catch(() => ({ error: "sin conexión" }));
          if ("error" in r) continue;
          alguno = true;
          try {
            if (!borradorParaRecuperar(borrador, r.actualizadoAt) && localStorage.getItem(claveBorrador(p.id)) === texto) {
              localStorage.removeItem(claveBorrador(p.id));
            }
          } catch {
            /* sin almacenamiento */
          }
        }
      } finally {
        subiendo.current = false;
      }
      if (alguno) {
        leerPendientes();
        router.refresh();
      }
    },
    [leerPendientes, router]
  );

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const con = () => setEnLinea(true);
    const sin = () => setEnLinea(false);
    window.addEventListener("online", con);
    window.addEventListener("offline", sin);
    return () => {
      window.removeEventListener("online", con);
      window.removeEventListener("offline", sin);
    };
  }, []);

  useEffect(() => leerPendientes(), [leerPendientes, enLinea]);
  useEffect(() => {
    if (enLinea && pendientes.length) void subirPendientes(pendientes);
  }, [enLinea, pendientes, subirPendientes]);

  const visibles = (filas ?? []).filter((f) => !borrados.has(f.id));

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Empezar un plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {aviones.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={pendiente || ocupado !== null}
              onClick={() => nuevo(a)}
              className="group text-left rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon p-5 hover:border-zinc-400 dark:hover:border-white/30 transition-colors disabled:opacity-60"
            >
              <span className="flex items-center justify-between">
                <span className="data text-lg font-bold text-zinc-900 dark:text-white">{a.registration}</span>
                {ocupado === `nuevo-${a.id}` ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : (
                  <Plane className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                )}
              </span>
              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                {a.icao || "Sin tipo OACI"}
                {a.plan_vuelo?.equipo ? ` · ${a.plan_vuelo.equipo}/${a.plan_vuelo.vigilancia ?? "?"}` : " · sin perfil para el plan"}
              </span>
            </button>
          ))}
          <button
            type="button"
            disabled={pendiente || ocupado !== null}
            onClick={() => nuevo(null)}
            className="text-left rounded-3xl border border-dashed border-zinc-300 dark:border-white/15 p-5 hover:border-zinc-500 transition-colors disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
              {ocupado === "nuevo-sin" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
              En blanco
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">Sin avión cargado</span>
          </button>
          <Link
            href="/dashboard/mapa"
            className="rounded-3xl border border-dashed border-zinc-300 dark:border-white/15 p-5 hover:border-zinc-500 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
              <Route className="w-4 h-4" /> Desde el Mapa
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Armá la ruta en el mapa y tocá "Armar el plan de vuelo"
            </span>
          </Link>
        </div>
        {aviones.length > 0 && aviones.every((a) => !a.plan_vuelo?.equipo) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Cargá el equipo y el color de cada avión en el{" "}
            <Link href="/dashboard/settings" className="font-semibold underline underline-offset-2">
              Hangar
            </Link>{" "}
            y el formulario sale casi entero. También podés guardarlo desde un plan.
          </p>
        )}
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {pendientes.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
            <CloudOff className="w-4 h-4 text-amber-500" /> Armado sin señal
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {enLinea ? "Subiéndolos al servidor…" : "Se suben solos al volver la señal. Mientras tanto están en este teléfono: podés abrirlos y seguir."}
          </p>
          <ul className="divide-y divide-zinc-100 dark:divide-white/5 rounded-3xl border border-amber-500/30 bg-white dark:bg-carbon overflow-hidden">
            {pendientes.map((p) => (
              <li key={p.id}>
                <Link href={urlDePlanNuevo(p.id)} className="flex items-center gap-2 px-4 md:px-5 py-4 data font-bold text-zinc-900 dark:text-white">
                  {p.salida ?? "????"} <ArrowRight className="w-3.5 h-3.5 text-zinc-400" /> {p.destino ?? "????"}
                  <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    Sin subir
                  </span>
                  <span className="ml-auto text-xs font-sans font-normal text-zinc-500 dark:text-zinc-400 truncate">{p.matricula ?? "Sin avión"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Tus planes</h3>
        {filas === null ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No pudimos leer tus planes. Probá de nuevo en un momento.</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Todavía no armaste ninguno.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon overflow-hidden">
            {visibles.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 md:px-5 py-4">
                <Link href={`/dashboard/plan-de-vuelo/${f.id}`} className="flex-1 min-w-0 group">
                  <span className="flex items-center gap-2 data font-bold text-zinc-900 dark:text-white">
                    {f.salida ?? "????"} <ArrowRight className="w-3.5 h-3.5 text-zinc-400" /> {f.destino ?? "????"}
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${ESTADOS[f.estado].clase}`}>
                      {ESTADOS[f.estado].texto}
                    </span>
                    {f.respuesta && <EstadoRespuesta estado={f.respuesta} titulo={`La oficina contestó el ${f.respuestaCuando}`} />}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {f.matricula ?? "Sin avión"} · {f.cuando}
                  </span>
                </Link>
                <button
                  type="button"
                  title={enLinea ? "Duplicar: el mismo vuelo otro día" : "Sin señal: abrí el plan y duplicalo desde ahí"}
                  aria-label="Duplicar"
                  disabled={pendiente || !enLinea}
                  onClick={() => correr(`dup-${f.id}`, () => duplicarPlan(f.id))}
                  className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                >
                  {ocupado === `dup-${f.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  title="Borrar"
                  aria-label="Borrar"
                  disabled={pendiente}
                  onClick={() => {
                    if (!window.confirm(`¿Borrar el plan ${f.salida ?? ""} → ${f.destino ?? ""}?`)) return;
                    correr(`del-${f.id}`, async () => {
                      const r = await borrarPlan(f.id);
                      if ("ok" in r) setBorrados((b) => new Set(b).add(f.id));
                      return r;
                    });
                  }}
                  className="p-2.5 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  {ocupado === `del-${f.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
