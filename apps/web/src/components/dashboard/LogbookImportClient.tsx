"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, Calendar, Plane, Route, Clock, ChevronRight, RefreshCw, Layers } from "lucide-react";
import Link from "next/link";
import { Aircraft } from "@/types";
import { bulkLogFlights } from "@/actions/flight";
import { cerrarImportacion, crearAvionesDelLibro } from "@/actions/importacion";
import { useRouter } from "next/navigation";
import { comprimirImagen } from "@/lib/imagen-cliente";
import { mensajeDeError } from "@/lib/error-de-red";
import {
  avionesATildados, avionesNuevos, avisoDeFallidos, claveDeSimulador, comoSesionDeSimulador, esSimuladorLeido, normalizarMatricula,
  simuladorDelHangar, simuladoresNuevos, TOPE_FOTOS, vueloSinAvion,
  type AvionNuevo, type Rango, type VueloLeido,
} from "@/lib/importar-libro";

/** Lo que el backend sabe de una importación (`/importaciones-libro`). El resultado sólo viene al abrir una. */
export interface Importacion {
  id: string;
  estado: "subido" | "procesando" | "listo" | "error" | "importado" | "descartado";
  paginas_total: number;
  paginas_leidas: number;
  lotes_fallidos: Rango[];
  error: string | null;
  creado_at: string;
  resultado?: { vuelos?: VueloLeido[] } | null;
}

interface LogbookImportClientProps {
  aircraftList: Aircraft[];
  /** La que se abrió con `?importacion=`. */
  importacion: Importacion | null;
  /** Se pidió una por id (aunque no exista). */
  pedida: boolean;
  /** Las demás en curso o esperando revisión. */
  otras: Importacion[];
}

interface ParsedFlight {
  id: string; // client-side temp UUID
  date: string;
  aircraft_registration: string;
  aircraft_id: string; // linked hangar aircraft id
  /** Si el vuelo va a un avión que se agrega al importar: su clave (matrícula normalizada). */
  nuevo_clave?: string;
  route: string;
  duration: number;
  takeoff: string;
  landing: string;
  landings: number;
  purpose: string;
  pic_day_loc?: number;
  pic_day_tra?: number;
  pic_night_loc?: number;
  pic_night_tra?: number;
  sic_day_loc?: number;
  sic_day_tra?: number;
  sic_night_loc?: number;
  sic_night_tra?: number;
  imc_pil?: number;
  imc_cop?: number;
  capota?: number;
  sim_instructor?: number;
  sim_pil_en_inst?: number;
}

const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function estadoEnPalabras(o: Importacion): string {
  if (o.estado === "listo") return "Listo para revisar";
  if (o.estado === "error") return "No se pudo leer";
  return `Leyendo ${o.paginas_leidas} de ${o.paginas_total} hojas`;
}

export default function LogbookImportClient({ aircraftList, importacion, pedida, otras }: LogbookImportClientProps) {
  return (
    <div className="space-y-8">
      {otras.length > 0 && (
        <section className="space-y-2 border-t border-white/10 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">Tus libros en proceso</p>
          {otras.map((o) => (
            <Link key={o.id} href={`/dashboard/log-flight/import?importacion=${o.id}`} className="flex items-center justify-between gap-3 py-2 text-sm font-semibold text-zinc-200 hover:text-white">
              <span>Libro subido el {fechaCorta(o.creado_at)}</span>
              <span className={`font-mono text-[11px] uppercase tracking-[0.1em] ${o.estado === "listo" ? "text-aviation-cyan" : o.estado === "error" ? "text-red-400" : "text-zinc-400"}`}>{estadoEnPalabras(o)}</span>
            </Link>
          ))}
        </section>
      )}

      {!importacion && !pedida && <SubirLibro />}
      {!importacion && pedida && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">No encontramos esa importación. Puede que ya la hayas importado o descartado.</p>
          <Link href="/dashboard/log-flight/import" className="text-sm font-semibold text-aviation-cyan underline underline-offset-4">Subir un libro</Link>
        </div>
      )}
      {importacion && (importacion.estado === "subido" || importacion.estado === "procesando") && <LeyendoLibro inicial={importacion} />}
      {importacion && importacion.estado === "error" && <LecturaFallida importacion={importacion} />}
      {importacion && (importacion.estado === "importado" || importacion.estado === "descartado") && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Esta importación ya está {importacion.estado === "importado" ? "importada" : "descartada"}.</p>
          <Link href="/dashboard/log-flight/import" className="text-sm font-semibold text-aviation-cyan underline underline-offset-4">Subir un libro</Link>
        </div>
      )}
      {importacion && importacion.estado === "listo" && <Revision importacion={importacion} aircraftList={aircraftList} />}
    </div>
  );
}

/** Elegir el PDF o las fotos y mandarlos: el server los lee en segundo plano. */
function SubirLibro() {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  /** Un PDF, o fotos de las hojas (hasta `TOPE_FOTOS` por libro). Si viene un PDF, gana el PDF. */
  const elegir = (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    const pdf = archivos.find((f) => f.type === "application/pdf");
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (pdf) {
      setFile(pdf);
      setFotos([]);
      setError(null);
    } else if (imagenes.length) {
      setFile(null);
      setFotos(imagenes.slice(0, TOPE_FOTOS));
      setError(imagenes.length > TOPE_FOTOS ? `Tomamos las primeras ${TOPE_FOTOS} fotos: subí las demás en otro libro.` : null);
    } else {
      setError("Subí el libro en PDF, o fotos de las hojas.");
    }
  };

  const subir = async () => {
    if (!file && fotos.length === 0) return;
    setError(null);
    try {
      const formData = new FormData();
      if (file) {
        setSubiendo("Subiendo el PDF…");
        formData.append("file", file);
      } else {
        // Achicadas en el navegador: una foto de teléfono pesa 4–8 MB. A 2400 px la letra a mano
        // se sigue leyendo, y la ubicación GPS no sale del teléfono (el canvas no copia el EXIF).
        for (const [k, f] of fotos.entries()) {
          setSubiendo(`Preparando la foto ${k + 1} de ${fotos.length}…`);
          formData.append("fotos", await comprimirImagen(f, 2400, 0.85));
        }
        setSubiendo("Subiendo las fotos…");
      }
      const res = await fetch("/api/importar-libro", { method: "POST", body: formData });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "No se pudo subir el libro. Probá de nuevo.");
      }
      const { id } = await res.json();
      router.replace(`/dashboard/log-flight/import?importacion=${id}`);
      router.refresh();
    } catch (err: any) {
      setError(mensajeDeError(err, "No se pudo subir el libro. Probá de nuevo.", navigator.onLine));
      setSubiendo("");
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-5 rounded-2xl flex items-start space-x-3 text-xs font-bold leading-relaxed">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          elegir(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-[2rem] p-10 md:p-16 text-center transition-all ${
          dragActive ? "border-zinc-950 bg-zinc-50 dark:border-white dark:bg-white/5" : "border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 bg-white dark:bg-carbon"
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,image/*" multiple onChange={(e) => elegir(e.target.files)} className="hidden" />

        <div className="max-w-md mx-auto space-y-6 flex flex-col items-center">
          <div className="w-16 h-16 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl flex items-center justify-center text-zinc-400 dark:text-zinc-500">
            <Upload className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Tu libro en PDF, o fotos de las hojas</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
              Sin tope de 12: hasta 120 páginas de PDF u {TOPE_FOTOS} fotos por libro. Lo subís, lo leemos en segundo plano y te mandamos un mail cuando esté listo para revisar. No hace falta que te quedes acá.
            </p>
          </div>

          {file ? (
            <div className="flex items-center space-x-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-5 py-3.5 rounded-xl w-full justify-center">
              <FileText className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-mono font-bold truncate text-zinc-900 dark:text-white">{file.name}</span>
              <span className="text-[10px] font-mono text-zinc-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
          ) : fotos.length > 0 ? (
            <div className="flex items-center space-x-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-5 py-3.5 rounded-xl w-full justify-center">
              <Layers className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-bold text-zinc-900 dark:text-white">{fotos.length === 1 ? "1 foto" : `${fotos.length} fotos`} de hojas</span>
            </div>
          ) : null}

          {subiendo ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <RefreshCw className="w-4 h-4 animate-spin" /> {subiendo}
            </p>
          ) : (
            <div className="flex gap-4 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm py-4 rounded-2xl transition-all active:scale-[0.98]"
              >
                {file || fotos.length ? "Cambiar" : "Elegir PDF o fotos"}
              </button>
              {(file || fotos.length > 0) && (
                <button
                  type="button"
                  onClick={subir}
                  className="flex-1 bg-aviation-cyan text-noche hover:bg-sky-300 font-semibold text-sm py-4 rounded-full transition-all active:scale-[0.98]"
                >
                  Subir el libro
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Estamos leyendo tu libro": la barra avanza sola (se pregunta el estado cada 5 s, sin escribir nada). */
function LeyendoLibro({ inicial }: { inicial: Importacion }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);

  useEffect(() => {
    let vivo = true;
    const preguntar = async () => {
      try {
        const res = await fetch(`/api/importar-libro/${inicial.id}`, { cache: "no-store" });
        if (!res.ok || !vivo) return;
        const nuevo = (await res.json()) as Importacion;
        if (!vivo) return;
        setEstado((e) => ({ ...e, ...nuevo }));
        if (nuevo.estado !== "subido" && nuevo.estado !== "procesando") router.refresh();
      } catch {
        // Sin red: se vuelve a preguntar en 5 s.
      }
    };
    const t = setInterval(preguntar, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [inicial.id, router]);

  const pct = estado.paginas_total > 0 ? Math.min(100, Math.round((estado.paginas_leidas / estado.paginas_total) * 100)) : 0;
  return (
    <div className="space-y-6 border-t border-white/10 pt-8 max-w-xl">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-aviation-cyan" />
        <h3 className="text-base font-bold text-white">Estamos leyendo tu libro</h3>
      </div>
      <p className="text-sm leading-relaxed text-zinc-400">
        Te mandamos un mail a la dirección de tu cuenta cuando esté listo. Podés cerrar esta página: lo que leamos queda guardado y no se importa nada hasta que lo revises.
      </p>
      <div className="space-y-2">
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-aviation-cyan rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">
          {estado.paginas_leidas === 0 ? "Empezando…" : `Leídas ${estado.paginas_leidas} de ${estado.paginas_total} hojas`}
        </p>
      </div>
    </div>
  );
}

function LecturaFallida({ importacion }: { importacion: Importacion }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="space-y-5 max-w-xl">
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-2xl flex items-start space-x-3 text-xs font-bold leading-relaxed">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{importacion.error || "No pudimos leer tu libro."} Probá con otro PDF o con fotos de las hojas, de frente y con buena luz.</span>
      </div>
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          await cerrarImportacion(importacion.id, "descartado");
          router.replace("/dashboard/log-flight/import");
          router.refresh();
        }}
        className="bg-aviation-cyan text-noche hover:bg-sky-300 disabled:opacity-50 font-semibold text-sm px-8 py-3.5 rounded-full"
      >
        Subir otro libro
      </button>
    </div>
  );
}

/** La revisión de siempre —vuelos y aviones—, con lo que leyó el server. Nada se importa sin confirmar. */
function Revision({ importacion, aircraftList }: { importacion: Importacion; aircraftList: Aircraft[] }) {
  const router = useRouter();
  const leidos = importacion.resultado?.vuelos ?? [];
  const [aCrear, setACrear] = useState<AvionNuevo[]>(() => [...avionesNuevos(leidos, aircraftList.map((a) => a.registration)), ...simuladoresNuevos(leidos, aircraftList)]);
  const [parsedFlights, setParsedFlights] = useState<ParsedFlight[]>(() =>
    leidos.map((f, idx) => {
      const regClean = String(f.aircraft_registration ?? "").trim().toUpperCase();
      const sim = esSimuladorLeido(regClean);
      const match = sim
        ? aircraftList.find((ac) => ac.id === simuladorDelHangar(f.aircraft_model, aircraftList))
        : aircraftList.find((ac) => normalizarMatricula(ac.registration) === normalizarMatricula(regClean));
      const num = (x: unknown) => (typeof x === "number" && x ? x : undefined);
      return {
        id: `flight-temp-${idx}`,
        date: String(f.date ?? ""),
        aircraft_registration: String(f.aircraft_registration ?? ""),
        aircraft_id: match ? match.id : "",
        nuevo_clave: match ? undefined : sim ? claveDeSimulador(f.aircraft_model) : normalizarMatricula(regClean),
        route: String(f.route ?? ""),
        duration: typeof f.duration === "number" ? f.duration : parseFloat(String(f.duration)) || 0,
        takeoff: String(f.takeoff ?? ""),
        landing: String(f.landing ?? ""),
        landings: typeof f.landings === "number" ? f.landings : parseInt(String(f.landings), 10) || 1,
        purpose: String(f.purpose || "VP"),
        pic_day_loc: num(f.pic_day_loc),
        pic_day_tra: num(f.pic_day_tra),
        pic_night_loc: num(f.pic_night_loc),
        pic_night_tra: num(f.pic_night_tra),
        sic_day_loc: num(f.sic_day_loc),
        sic_day_tra: num(f.sic_day_tra),
        sic_night_loc: num(f.sic_night_loc),
        sic_night_tra: num(f.sic_night_tra),
        imc_pil: num(f.imc_pil),
        imc_cop: num(f.imc_cop),
        capota: num(f.capota),
        sim_instructor: num(f.sim_instructor),
        sim_pil_en_inst: num(f.sim_pil_en_inst),
      };
    })
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aviso = avisoDeFallidos(importacion.lotes_fallidos ?? []);

  const handleUpdateField = (id: string, field: keyof ParsedFlight, value: any) => {
    setParsedFlights((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  /** Un avión del Hangar, uno a crear (`nuevo:<clave>`) o ninguno. */
  const elegirAvion = (id: string, valor: string) => {
    setParsedFlights((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        if (valor.startsWith("nuevo:")) return { ...f, aircraft_id: "", nuevo_clave: valor.slice(6) };
        const ac = aircraftList.find((a) => a.id === valor);
        return { ...f, aircraft_id: valor, nuevo_clave: undefined, aircraft_registration: ac ? ac.registration : f.aircraft_registration };
      })
    );
  };

  const cambiarAvion = (clave: string, cambios: Partial<AvionNuevo>) => setACrear((prev) => prev.map((a) => (a.clave === clave ? { ...a, ...cambios } : a)));

  const handleRemoveFlight = (id: string) => setParsedFlights((prev) => prev.filter((f) => f.id !== id));

  const handleConfirmImport = async () => {
    const sinAvion = parsedFlights.filter((f) => vueloSinAvion(f, aCrear));
    if (sinAvion.length) {
      setError(sinAvion.length === 1
        ? `El vuelo del ${sinAvion[0].date} (${sinAvion[0].route}) no tiene avión. Elegí uno en la lista, marcado en amarillo.`
        : `${sinAvion.length} vuelos no tienen avión (el primero, del ${sinAvion[0].date}). Elegí uno en cada fila marcada en amarillo.`);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      // 1) Los aviones tildados, primero: con sus ids ya se pueden guardar los vuelos.
      const tildados = avionesATildados(aCrear).filter((a) => parsedFlights.some((f) => !f.aircraft_id && f.nuevo_clave === a.clave));
      const ids: Record<string, string> = {};
      if (tildados.length) {
        const r = await crearAvionesDelLibro(tildados.map((a) => ({ registration: a.registration.trim(), type: a.type.trim(), icao: a.icao.trim(), type_acft: a.type_acft, is_simulator: !!a.simulador })));
        if ("error" in r) throw new Error(r.error);
        for (const a of tildados) {
          const id = r.ids[normalizarMatricula(a.registration)];
          if (!id) throw new Error(`No pudimos agregar ${a.registration} a tu Hangar.`);
          ids[a.clave] = id;
        }
      }
      // 2) Los vuelos, ya con avión.
      // Las sesiones de simulador se guardan como las guarda el formulario: duración 0 y las horas en instrucción.
      const sims = new Set([...aircraftList.filter((a) => a.is_simulator).map((a) => a.id), ...tildados.filter((a) => a.simulador).map((a) => ids[a.clave])]);
      const paraGuardar = parsedFlights
        .map((f) => (f.aircraft_id ? f : { ...f, aircraft_id: ids[f.nuevo_clave ?? ""] ?? "" }))
        .map((f) => (sims.has(f.aircraft_id) ? comoSesionDeSimulador(f) : f));
      // Con la importación como base, un reintento no duplica vuelos (clave estable por vuelo).
      const res = await bulkLogFlights(paraGuardar, importacion.id);
      if (res.error) throw new Error(res.error);
      await cerrarImportacion(importacion.id, "importado");
      router.push("/dashboard/history");
    } catch (err: any) {
      setError(mensajeDeError(err, "Ocurrió un error al registrar los vuelos en la bitácora.", navigator.onLine));
    } finally {
      setIsSubmitting(false);
    }
  };

  const descartar = async () => {
    setIsSubmitting(true);
    await cerrarImportacion(importacion.id, "descartado");
    router.replace("/dashboard/log-flight/import");
    router.refresh();
  };

  if (parsedFlights.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">No quedan vuelos para importar.</p>
        <button type="button" onClick={descartar} className="text-sm font-semibold text-aviation-cyan underline underline-offset-4">Descartar y subir otro libro</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-5 rounded-2xl flex items-start space-x-3 text-xs font-bold leading-relaxed">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {aviso && (
        <div className="border-y border-amber-500/30 bg-amber-500/[0.06] px-1 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-amber-300 leading-relaxed">
          {aviso}
        </div>
      )}

      {aCrear.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">Aviones de tu libro que no están en tu Hangar · se agregan al importar</p>
          {aCrear.map((a) => (
            <div key={a.clave} className="flex flex-wrap items-center gap-3 py-1">
              <input type="checkbox" checked={a.crear} onChange={(e) => cambiarAvion(a.clave, { crear: e.target.checked })} className="h-4 w-4 accent-cyan-400" aria-label={`Agregar ${a.registration}`} />
              <input value={a.registration} onChange={(e) => cambiarAvion(a.clave, { registration: e.target.value.toUpperCase() })} disabled={!a.crear} className="w-28 bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold uppercase text-zinc-100 outline-none focus:border-white/30 disabled:opacity-40" aria-label="Matrícula" />
              {a.simulador && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-aviation-cyan">Simulador</span>}
              <input value={a.type} placeholder="Marca y modelo" onChange={(e) => cambiarAvion(a.clave, { type: e.target.value })} disabled={!a.crear} className="w-44 bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-zinc-100 outline-none focus:border-white/30 disabled:opacity-40" aria-label="Marca y modelo" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">{a.vuelos} {a.vuelos === 1 ? "vuelo" : "vuelos"}</span>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-zinc-500">Los agregamos con matrícula y modelo; después te pedimos completar el resto desde el Hangar. Si apagás uno, sus vuelos te piden elegir un avión a mano. Las filas sin matrícula son sesiones de simulador: van a un simulador del Hangar y sus horas, a instrucción en simulador, no a horas de vuelo.</p>
        </section>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-carbon border border-zinc-200 dark:border-white/10 rounded-[2rem] p-6 shadow-sm gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shadow-sm">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-none">Vuelos extraídos ({parsedFlights.length})</h4>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 leading-none">Revisá los datos: nada se guarda hasta que confirmes</p>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto self-stretch md:self-auto">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={descartar}
            className="flex-1 md:flex-none border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmImport}
            className="bg-aviation-cyan text-noche hover:bg-sky-300 flex-1 md:flex-none disabled:opacity-50 disabled:pointer-events-none font-semibold text-sm px-8 py-3.5 transition-all active:scale-[0.98] flex items-center justify-center space-x-2 rounded-full"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <span>Confirmar e importar</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

          {/* Large review table wrapper */}
          <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-white/10 rounded-[2rem] overflow-hidden shadow-cal dark:shadow-none">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-black/20 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Calendar className="w-3.5 h-3.5" /><span>Fecha</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Plane className="w-3.5 h-3.5" /><span>Aeronave (Matrícula)</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Route className="w-3.5 h-3.5" /><span>Ruta</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Clock className="w-3.5 h-3.5" /><span>Horario (DEP/ARR)</span></span></th>
                    <th className="px-6 py-4.5 text-center">Landings</th>
                    <th className="px-6 py-4.5">Total Hs</th>
                    <th className="px-6 py-4.5">Finalidad</th>
                    <th className="px-6 py-4.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5 text-xs">
                  {parsedFlights.map((flight) => {
                    const hasUnmatchedAc = vueloSinAvion(flight, aCrear);
                    
                    return (
                      <tr 
                        key={flight.id} 
                        className={`hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-colors ${
                          hasUnmatchedAc ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.01]" : ""
                        }`}
                      >
                        {/* Date field */}
                        <td className="px-6 py-4">
                          <input 
                            type="date" 
                            value={flight.date}
                            onChange={(e) => handleUpdateField(flight.id, "date", e.target.value)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-32 outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Aircraft selector */}
                        <td className="px-6 py-4 space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <select
                              value={flight.aircraft_id || (flight.nuevo_clave ? `nuevo:${flight.nuevo_clave}` : "")}
                              onChange={(e) => elegirAvion(flight.id, e.target.value)}
                              className={`bg-white dark:bg-zinc-900 border ${
                                hasUnmatchedAc 
                                  ? "border-amber-500 focus:border-amber-600 focus:dark:border-amber-500/50" 
                                  : "border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30"
                              } rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none text-zinc-800 dark:text-zinc-200 w-44`}
                            >
                              <option value="" disabled className="text-zinc-400">Seleccionar avión...</option>
                              {aircraftList.map((ac) => (
                                <option key={ac.id} value={ac.id}>
                                  {ac.registration} ({ac.icao})
                                </option>
                              ))}
                              {aCrear.filter((a) => a.crear).map((a) => (
                                <option key={a.clave} value={`nuevo:${a.clave}`}>
                                  {a.registration} ({a.simulador ? "simulador nuevo" : "nuevo"})
                                </option>
                              ))}
                            </select>
                            {hasUnmatchedAc && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" title="Aeronave no vinculada" />
                            )}
                          </div>
                          <p className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 uppercase font-black pl-1">
                            Lector: <span className="font-bold text-zinc-600 dark:text-zinc-300">{flight.aircraft_registration || "N/A"}</span>
                          </p>
                        </td>

                        {/* Route field */}
                        <td className="px-6 py-4">
                          <input 
                            type="text" 
                            value={flight.route}
                            onChange={(e) => handleUpdateField(flight.id, "route", e.target.value)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-28 outline-none text-zinc-800 dark:text-zinc-200 uppercase font-display"
                          />
                        </td>

                        {/* Takeoff & Landing times */}
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1.5 font-mono">
                            <input 
                              type="text" 
                              placeholder="HH:MM"
                              value={flight.takeoff}
                              onChange={(e) => handleUpdateField(flight.id, "takeoff", e.target.value)}
                              className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200"
                            />
                            <span className="text-zinc-400">/</span>
                            <input 
                              type="text" 
                              placeholder="HH:MM"
                              value={flight.landing}
                              onChange={(e) => handleUpdateField(flight.id, "landing", e.target.value)}
                              className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200"
                            />
                          </div>
                        </td>

                        {/* Landings count */}
                        <td className="px-6 py-4 text-center">
                          <input 
                            type="number" 
                            min="1"
                            value={flight.landings}
                            onChange={(e) => handleUpdateField(flight.id, "landings", parseInt(e.target.value, 10) || 1)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1.5 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Duration hours */}
                        <td className="px-6 py-4">
                          <input 
                            type="number" 
                            step="0.1"
                            min="0.1"
                            value={flight.duration}
                            onChange={(e) => handleUpdateField(flight.id, "duration", parseFloat(e.target.value) || 0)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-14 text-center outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Purpose select */}
                        <td className="px-6 py-4">
                          <select
                            value={flight.purpose}
                            onChange={(e) => handleUpdateField(flight.id, "purpose", e.target.value)}
                            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold outline-none text-zinc-800 dark:text-zinc-200 w-20"
                          >
                            <option value="VP">VP</option>
                            <option value="ENT">ENT</option>
                            <option value="INST">INST</option>
                            <option value="EXA">EXA</option>
                          </select>
                        </td>

                        {/* Remove button */}
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFlight(flight.id)}
                            className="p-2 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                            title="Eliminar del borrador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>


    </div>
  );
}
