"use client";

import { useState, useTransition } from "react";
import { ChevronDown, PenLine, Trash2, X } from "lucide-react";
import {
  agregarFotoDorso,
  agregarSello,
  asignarCertificante,
  borrarDorso,
  borrarFirmaCertificante,
  desasociarCertificante,
  editarCertificante,
  editarSello,
  guardarDorso,
  guardarFirmaCertificante,
  quitarFotoDorso,
  quitarSello,
} from "@/actions/firmas";
import { useAvisos } from "@/components/dashboard/Avisos";
import CapturaFirma from "@/components/dashboard/CapturaFirma";
import { AUTORIDADES_CAD } from "@/lib/cad";
import { asignarPorSellos } from "@/lib/asignar-sellos";
import {
  fechaDelDorso,
  nombreDeSello,
  normalizarNombre,
  opcionesDeCertificante,
  vuelosPorCertificante,
  vuelosSinCertificante,
  type DorsoHoja,
  type FirmaCertificante,
  type SelloCertificante,
  type SugerenciaCertificante,
} from "@/lib/firmas-libro";
import type { Aircraft, Flight } from "@/types";

/**
 * Las firmas del libro, en el Hangar (migración 047): las de quienes certifican tus vuelos
 * (van en la celda "Certificaciones" del PDF) y el dorso de cada hoja. **Sólo sirven para tu
 * PDF**: no se publican ni salen de tu cuenta. Cada imagen se limpia en el teléfono antes de
 * guardarla (`CapturaFirma`).
 */
export default function FirmasDelLibro({
  firmas,
  dorsos,
  libros,
  hojasPorLibro,
  sugerencias = [],
  vuelos = [],
  aviones = [],
  sellosPorHoja = {},
}: {
  firmas: FirmaCertificante[];
  dorsos: DorsoHoja[];
  libros: { id: string; name: string }[];
  /** Cuántas hojas tiene hoy cada libro, como las numera el PDF. */
  hojasPorLibro: Record<string, number>;
  /** Nombres de vuelos sin certificante que son de una persona guardada (`/firmas/certificantes/sugerencias`). */
  sugerencias?: SugerenciaCertificante[];
  /** Los vuelos del libro: para contar los de cada persona y listar los que no tienen. */
  vuelos?: Flight[];
  aviones?: Aircraft[];
  /** Por libro y hoja, los sellos de los vuelos que caen en ella (para ofrecer «Usar los sellos de los vuelos»). */
  sellosPorHoja?: Record<string, Record<number, string[]>>;
}) {
  return (
    <div className="space-y-10">
      <Certificantes firmas={firmas} sugerencias={sugerencias} vuelos={vuelos} aviones={aviones} />
      <Dorsos dorsos={dorsos} libros={libros} hojasPorLibro={hojasPorLibro} firmas={firmas} sellosPorHoja={sellosPorHoja} />
    </div>
  );
}

const campo =
  "w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 min-h-12 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-aviation-cyan/20 focus:border-zinc-900 dark:focus:border-aviation-cyan/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600";
const rotulo = "text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1";
const principal =
  "inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-aviation-cyan text-noche font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity";

/** Una firma sobre fondo claro, para que se vea en el tema oscuro. */
function Miniatura({ png, alto = "h-12" }: { png: string; alto?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={png} alt="" className={`${alto} w-auto max-w-[9rem] object-contain rounded-lg bg-zinc-100 p-1`} />
  );
}

const unaFila = "divide-y divide-white/10 border-y border-white/10";

function Certificantes({
  firmas,
  sugerencias,
  vuelos,
  aviones,
}: {
  firmas: FirmaCertificante[];
  sugerencias: SugerenciaCertificante[];
  vuelos: Flight[];
  aviones: Aircraft[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [sello, setSello] = useState<string | null>(null);
  const [conSello, setConSello] = useState(false);
  const [etiquetaSello, setEtiquetaSello] = useState("");
  const [cargoSello, setCargoSello] = useState("");
  const [nombre, setNombre] = useState("");
  const [licencia, setLicencia] = useState("");
  const [autoridad, setAutoridad] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const cuantos = vuelosPorCertificante(vuelos);
  const puede = !!png && nombre.trim().length > 0 && autorizado && !pendiente;

  const guardar = () => {
    if (!png) return;
    setError(null);
    empezar(async () => {
      const r = await guardarFirmaCertificante({
        nombre,
        licencia,
        autoridadId: autoridad ? Number(autoridad) : null,
        png,
        sello: sello ? { png: sello, etiqueta: etiquetaSello.trim() || "Con sello", autoridadId: cargoSello ? Number(cargoSello) : autoridad ? Number(autoridad) : null } : null,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      notificar({ tipo: "exito", titulo: "Firma guardada", detalle: "Asocialo a sus vuelos desde acá, abajo." });
      setAgregando(false);
      setPng(null);
      setSello(null);
      setConSello(false);
      setEtiquetaSello("");
      setCargoSello("");
      setNombre("");
      setLicencia("");
      setAutoridad("");
      setAutorizado(false);
    });
  };

  const borrar = (f: FirmaCertificante) =>
    empezar(async () => {
      const r = await borrarFirmaCertificante(f.id);
      if ("error" in r) notificar({ tipo: "error", titulo: r.error });
    });

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base md:text-lg font-bold text-zinc-900 dark:text-white">Firmas de quienes certifican</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          La firma de tu instructor o de quien certifica tus vuelos, para la columna «Certificaciones» del libro en PDF. Cada vuelo apunta a la
          persona que lo certificó; si no, se la busca por el nombre que cargaste en él. Con «Ponerla sola en el PDF» apagado, su firma sólo va en los
          vuelos donde la pidas.
        </p>
      </div>

      {sugerencias.length > 0 && <Sugerencias sugerencias={sugerencias} firmas={firmas} />}

      {firmas.length > 0 && (
        <ul className={unaFila}>
          {firmas.map((f) => {
            const n = cuantos.get(f.id) ?? 0;
            const abiertaEsta = abierta === f.id;
            return (
              <li key={f.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setAbierta(abiertaEsta ? null : f.id)}
                  aria-expanded={abiertaEsta}
                  className="w-full flex items-center gap-4 min-h-11 text-left"
                >
                  <Miniatura png={f.png} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-zinc-900 dark:text-white truncate">{f.nombre}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {[f.licencia, AUTORIDADES_CAD.find((a) => a.id === f.autoridad_id)?.nombre].filter(Boolean).join(" · ") || "Sin licencia cargada"}
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {n === 1 ? "1 vuelo" : `${n} vuelos`} · {f.automatica === false ? "no se pone sola" : "se pone sola"}
                      {f.sellos?.length ? ` · ${f.sellos.length === 1 ? "1 sello" : `${f.sellos.length} sellos`}` : ""}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-zinc-500 transition-transform ${abiertaEsta ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {abiertaEsta && <EditorDePersona key={f.id} firma={f} idsDeVuelos={vuelos.filter((v) => v.certificante_id === f.id).map((v) => v.id)} alBorrar={() => borrar(f)} borrando={pendiente} />}
              </li>
            );
          })}
        </ul>
      )}

      {!agregando ? (
        <button type="button" onClick={() => setAgregando(true)} className={principal}>
          <PenLine className="w-4 h-4 mr-2" aria-hidden="true" />
          Agregar una firma
        </button>
      ) : (
        <div className="space-y-5 border-t border-white/10 pt-5">
          <CapturaFirma modo="firma" alCambiar={setPng} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={rotulo} htmlFor="firma-nombre">Aclaración (nombre)</label>
              <input id="firma-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" autoComplete="off" className={`${campo} uppercase`} />
            </div>
            <div className="space-y-1.5">
              <label className={rotulo} htmlFor="firma-licencia">Licencia (opcional)</label>
              <input id="firma-licencia" value={licencia} onChange={(e) => setLicencia(e.target.value)} placeholder="INA 12345" autoComplete="off" className={`${campo} uppercase`} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className={rotulo} htmlFor="firma-cargo">Cargo en el CAD (opcional)</label>
              <select id="firma-cargo" value={autoridad} onChange={(e) => setAutoridad(e.target.value)} className={campo}>
                <option value="">Sin elegir</option>
                {AUTORIDADES_CAD.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {!conSello ? (
            <button type="button" onClick={() => setConSello(true)} className="text-sm font-semibold text-aviation-cyan min-h-11">
              Sumar su firma con sello (opcional, para el dorso)
            </button>
          ) : (
            <div className="space-y-3">
              <p className={rotulo}>Firma con sello o aclaración (para el dorso de las hojas)</p>
              <CapturaFirma modo="dorso" alCambiar={setSello} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={rotulo} htmlFor="sello-etiqueta">Cómo se llama este sello</label>
                  <input id="sello-etiqueta" value={etiquetaSello} onChange={(e) => setEtiquetaSello(e.target.value)} placeholder="Jefe de instructores" autoComplete="off" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label className={rotulo} htmlFor="sello-cargo">Cargo en el CAD de este sello</label>
                  <select id="sello-cargo" value={cargoSello} onChange={(e) => setCargoSello(e.target.value)} className={campo}>
                    <option value="">El de arriba</option>
                    {AUTORIDADES_CAD.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Después le sumás los otros cargos desde su ficha, en «Sus sellos».</p>
            </div>
          )}

          <label className="flex items-start gap-3 text-sm text-zinc-900 dark:text-white">
            <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0" />
            <span>
              <strong>Usá la firma de alguien sólo con su autorización: certificar es suyo.</strong> Confirmo que esta persona me autorizó a guardar su firma.
            </span>
          </label>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={guardar} disabled={!puede} className={principal}>
              {pendiente ? "Guardando…" : "Guardar la firma"}
            </button>
            <button type="button" onClick={() => setAgregando(false)} className="min-h-12 px-5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {firmas.length > 0 && <SinCertificante firmas={firmas} vuelos={vuelos} aviones={aviones} />}
    </div>
  );
}

/** "45 vuelos dicen GUSTAVO… → Asociar a Macedo": un toque, sin adivinar (la sugerencia viene del backend). */
function Sugerencias({ sugerencias, firmas }: { sugerencias: SugerenciaCertificante[]; firmas: FirmaCertificante[] }) {
  const [pendiente, empezar] = useTransition();
  const [avisos, setAvisos] = useState<string[]>([]);
  const { notificar } = useAvisos();
  const visibles = sugerencias.filter((s) => firmas.some((f) => f.id === s.certificante_id));
  if (!visibles.length) return null;

  const asociar = (s: SugerenciaCertificante) =>
    empezar(async () => {
      const r = await asignarCertificante(s.certificante_id, s.vuelo_ids, null, s.sumar_alias ? s.nombre_en_vuelos : undefined, s.sello_id);
      if ("error" in r) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      setAvisos(r.avisos.map((a) => a.mensaje));
      notificar({ tipo: "exito", titulo: r.asignados === 1 ? "1 vuelo asociado" : `${r.asignados} vuelos asociados` });
    });

  return (
    <div className="space-y-2 border-t border-white/10 pt-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-aviation-cyan">Sugerencias</p>
      <ul className={unaFila}>
        {visibles.map((s) => {
          const persona = firmas.find((f) => f.id === s.certificante_id);
          const sello = persona?.sellos?.find((x) => x.id === s.sello_id);
          const quien = persona ? nombreDeSello({ nombre: persona.nombre, sellos: persona.sellos }, sello) : "";
          const n = s.vuelo_ids.length;
          return (
            <li key={`${s.certificante_id}-${s.nombre_en_vuelos}-${s.sello_id ?? ""}-${s.vuelo_ids[0]}`} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <p className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white">
                {n === 1 ? "1 vuelo dice" : `${n} vuelos dicen`} <strong className="break-words">{s.nombre_en_vuelos}</strong>
              </p>
              <button type="button" onClick={() => asociar(s)} disabled={pendiente} className="min-h-11 px-4 rounded-full border border-aviation-cyan/40 text-aviation-cyan text-sm font-semibold disabled:opacity-40 self-start">
                {s.sumar_alias ? `Asociar a ${quien} y sumar el alias` : `Asociar a ${quien}`}
              </button>
            </li>
          );
        })}
      </ul>
      {avisos.length > 0 && (
        <ul className="text-xs text-amber-300 space-y-0.5">
          {avisos.slice(0, 5).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditorDePersona({ firma, idsDeVuelos, alBorrar, borrando }: { firma: FirmaCertificante; idsDeVuelos: string[]; alBorrar: () => void; borrando: boolean }) {
  const vuelosDeEsta = idsDeVuelos.length;
  const [nombre, setNombre] = useState(firma.nombre);
  const [licencia, setLicencia] = useState(firma.licencia ?? "");
  const [autoridad, setAutoridad] = useState(firma.autoridad_id ? String(firma.autoridad_id) : "");
  const [nuevaFirma, setNuevaFirma] = useState<string | null>(null);
  const [cambiandoFirma, setCambiandoFirma] = useState(false);
  const [alias, setAlias] = useState<string[]>(firma.alias ?? []);
  const [nuevoAlias, setNuevoAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const cambios =
    nombre.trim().toUpperCase() !== firma.nombre ||
    licencia.trim().toUpperCase() !== (firma.licencia ?? "") ||
    autoridad !== (firma.autoridad_id ? String(firma.autoridad_id) : "") ||
    !!nuevaFirma;

  const aplicar = (c: Parameters<typeof editarCertificante>[1], listo?: string) =>
    empezar(async () => {
      setError(null);
      const r = await editarCertificante(firma.id, c);
      if ("error" in r) setError(r.error);
      else if (listo) notificar({ tipo: "exito", titulo: listo });
    });

  const guardar = () =>
    aplicar(
      {
        nombre,
        licencia,
        autoridadId: autoridad ? Number(autoridad) : null,
        ...(nuevaFirma ? { png: nuevaFirma } : {}),
      },
      "Cambios guardados"
    );

  const sumarAlias = () => {
    const limpio = normalizarNombre(nuevoAlias);
    if (!limpio || alias.includes(limpio) || limpio === normalizarNombre(firma.nombre)) return setNuevoAlias("");
    const lista = [...alias, limpio];
    setAlias(lista);
    setNuevoAlias("");
    aplicar({ alias: lista });
  };
  const sacarAlias = (a: string) => {
    const lista = alias.filter((x) => x !== a);
    setAlias(lista);
    aplicar({ alias: lista });
  };

  const sacarDeSusVuelos = () =>
    empezar(async () => {
      const r = await desasociarCertificante(idsDeVuelos);
      if (r.error) setError(r.error);
      else notificar({ tipo: "exito", titulo: "Sacada de sus vuelos", detalle: "El nombre para el CAD quedó como estaba." });
    });

  return (
    <div className="space-y-6 pt-4">
      <label className="flex items-start gap-3 text-sm text-zinc-900 dark:text-white cursor-pointer">
        <input
          type="checkbox"
          checked={firma.automatica !== false}
          onChange={(e) => aplicar({ automatica: e.target.checked }, e.target.checked ? "Su firma se pone sola" : "Su firma ya no se pone sola")}
          disabled={pendiente}
          className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0"
        />
        <span>
          <strong>Ponerla sola en el PDF.</strong> <span className="text-zinc-500 dark:text-zinc-400">Apagado, su firma sólo sale en los vuelos donde pongas «Firma: sí».</span>
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <p className={rotulo}>Su firma</p>
          {!cambiandoFirma ? (
            <div className="flex items-center gap-3">
              <Miniatura png={firma.png} alto="h-14" />
              <button type="button" onClick={() => setCambiandoFirma(true)} className="text-sm font-semibold text-aviation-cyan min-h-11">Cambiarla</button>
            </div>
          ) : (
            <CapturaFirma modo="firma" alCambiar={setNuevaFirma} />
          )}
        </div>
      </div>

      <SellosDePersona firma={firma} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`p-nombre-${firma.id}`}>Aclaración (nombre)</label>
          <input id={`p-nombre-${firma.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" className={`${campo} uppercase`} />
        </div>
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`p-lic-${firma.id}`}>Licencia (opcional)</label>
          <input id={`p-lic-${firma.id}`} value={licencia} onChange={(e) => setLicencia(e.target.value)} autoComplete="off" className={`${campo} uppercase`} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className={rotulo} htmlFor={`p-cargo-${firma.id}`}>Cargo en el CAD (opcional)</label>
          <select id={`p-cargo-${firma.id}`} value={autoridad} onChange={(e) => setAutoridad(e.target.value)} className={campo}>
            <option value="">Sin elegir</option>
            {AUTORIDADES_CAD.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className={rotulo}>Otros nombres con los que aparece en tus vuelos</p>
        {alias.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {alias.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 pl-3 pr-1 text-xs text-zinc-900 dark:text-white">
                <span className="py-1.5">{a}</span>
                <button type="button" onClick={() => sacarAlias(a)} aria-label={`Sacar el alias ${a}`} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-500">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={nuevoAlias}
            onChange={(e) => setNuevoAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sumarAlias();
              }
            }}
            placeholder="Como aparece en el vuelo"
            aria-label="Sumar un alias"
            autoComplete="off"
            className={`${campo} uppercase`}
          />
          <button type="button" onClick={sumarAlias} disabled={!nuevoAlias.trim() || pendiente} className="min-h-12 px-4 rounded-full border border-white/10 text-sm font-semibold text-zinc-900 dark:text-white disabled:opacity-40">Sumar</button>
        </div>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Vuelos que certificó: <strong className="text-zinc-900 dark:text-white">{vuelosDeEsta}</strong>
        {vuelosDeEsta > 0 && (
          <button type="button" onClick={sacarDeSusVuelos} disabled={pendiente} className="ml-3 font-semibold text-red-500 min-h-11">Sacarla de todos</button>
        )}
      </p>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={guardar} disabled={!cambios || pendiente} className={principal}>
          {pendiente ? "Guardando…" : "Guardar los cambios"}
        </button>
        <button type="button" onClick={alBorrar} disabled={borrando} className="min-h-12 px-5 text-sm font-semibold text-red-500 inline-flex items-center gap-2">
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Borrar esta firma
        </button>
      </div>
    </div>
  );
}

/**
 * "Sus sellos" (migración 049): una persona con varios sellos, cada uno con su cargo del CAD
 * ("Jefe de instructores", "Instructor de vuelo"). Una persona, no dos: así sus vuelos y las
 * sugerencias por nombre no se parten. Cada imagen va en su propio pedido.
 */
function SellosDePersona({ firma }: { firma: FirmaCertificante }) {
  const sellos = firma.sellos ?? [];
  const [agregando, setAgregando] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [cargo, setCargo] = useState(firma.autoridad_id ? String(firma.autoridad_id) : "");
  const [nombreCad, setNombreCad] = useState("");
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const sumar = () =>
    empezar(async () => {
      if (!png) return;
      setError(null);
      const r = await agregarSello(firma.id, { png, etiqueta: etiqueta.trim() || (cargo ? AUTORIDADES_CAD.find((a) => a.id === Number(cargo))?.nombre ?? "Con sello" : "Con sello"), autoridadId: cargo ? Number(cargo) : null, nombreCad });
      if ("error" in r) return setError(r.error);
      notificar({ tipo: "exito", titulo: "Sello guardado" });
      setAgregando(false);
      setPng(null);
      setEtiqueta("");
      setNombreCad("");
      setIntento((n) => n + 1);
    });

  return (
    <div className="space-y-3">
      <p className={rotulo}>Sus sellos (para el dorso y para saber con qué cargo certificó)</p>
      {sellos.length > 0 && (
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {sellos.map((x) => (
            <li key={x.id}>
              <FilaDeSello sello={x} />
            </li>
          ))}
        </ul>
      )}
      {!agregando ? (
        <button type="button" onClick={() => setAgregando(true)} className="text-sm font-semibold text-aviation-cyan min-h-11">
          {sellos.length ? "Agregar otro sello" : "Agregar su firma con sello"}
        </button>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/10 p-4">
          <CapturaFirma key={intento} modo="dorso" alCambiar={setPng} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={rotulo} htmlFor={`ns-etiqueta-${firma.id}`}>Cómo se llama este sello</label>
              <input id={`ns-etiqueta-${firma.id}`} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Instructor de vuelo" autoComplete="off" className={campo} />
            </div>
            <div className="space-y-1.5">
              <label className={rotulo} htmlFor={`ns-cargo-${firma.id}`}>Cargo en el CAD</label>
              <select id={`ns-cargo-${firma.id}`} value={cargo} onChange={(e) => setCargo(e.target.value)} className={campo}>
                <option value="">Sin cargo</option>
                {AUTORIDADES_CAD.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className={rotulo} htmlFor={`ns-cad-${firma.id}`}>Nombre para el CAD con este cargo (opcional)</label>
              <input id={`ns-cad-${firma.id}`} value={nombreCad} onChange={(e) => setNombreCad(e.target.value)} placeholder="Si va con la licencia, escribilo igual que en el CAD" autoComplete="off" className={`${campo} uppercase`} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={sumar} disabled={!png || pendiente} className={principal}>
              {pendiente ? "Guardando…" : "Guardar el sello"}
            </button>
            <button type="button" onClick={() => setAgregando(false)} className="min-h-12 px-5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaDeSello({ sello }: { sello: SelloCertificante }) {
  const [etiqueta, setEtiqueta] = useState(sello.etiqueta);
  const [cargo, setCargo] = useState(sello.autoridad_id ? String(sello.autoridad_id) : "");
  const [nombreCad, setNombreCad] = useState(sello.nombre_cad ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();
  const cambio =
    etiqueta.trim() !== sello.etiqueta || cargo !== (sello.autoridad_id ? String(sello.autoridad_id) : "") || nombreCad.trim().toUpperCase() !== (sello.nombre_cad ?? "");

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const r = await editarSello(sello.id, { etiqueta, autoridadId: cargo ? Number(cargo) : null, nombreCad: nombreCad || null });
      if ("error" in r) setError(r.error);
      else notificar({ tipo: "exito", titulo: "Sello guardado" });
    });
  const quitar = () =>
    empezar(async () => {
      const r = await quitarSello(sello.id);
      if ("error" in r) setError(r.error);
    });

  return (
    <div className="py-3 space-y-3">
      <div className="flex items-center gap-3">
        <Miniatura png={sello.png} alto="h-14" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <label className="sr-only" htmlFor={`se-${sello.id}`}>Etiqueta del sello</label>
          <input id={`se-${sello.id}`} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} autoComplete="off" className={campo} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`sc-${sello.id}`}>Cargo en el CAD</label>
          <select id={`sc-${sello.id}`} value={cargo} onChange={(e) => setCargo(e.target.value)} className={campo}>
            <option value="">Sin cargo</option>
            {AUTORIDADES_CAD.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`sn-${sello.id}`}>Nombre para el CAD (opcional)</label>
          <input id={`sn-${sello.id}`} value={nombreCad} onChange={(e) => setNombreCad(e.target.value)} autoComplete="off" className={`${campo} uppercase`} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={guardar} disabled={!cambio || !etiqueta.trim() || pendiente} className="min-h-11 px-5 rounded-full border border-aviation-cyan/40 text-aviation-cyan text-sm font-semibold disabled:opacity-40">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={quitar} disabled={pendiente} className="min-h-11 px-3 text-sm font-semibold text-red-500">Quitar</button>
      </div>
    </div>
  );
}

/** Los vuelos que nadie firmó: una lista corta para asociarlos de a uno o en lote. */
function SinCertificante({ firmas, vuelos, aviones }: { firmas: FirmaCertificante[]; vuelos: Flight[]; aviones: Aircraft[] }) {
  const sin = vuelosSinCertificante(vuelos);
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set());
  const [persona, setPersona] = useState("");
  const [anula, setAnula] = useState<"" | "si" | "no">("");
  const [limite, setLimite] = useState(30);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();
  const listaDeAvisos = avisos.length > 0 && (
    <ul className="text-xs text-amber-300 space-y-0.5">
      {avisos.slice(0, 5).map((a, i) => (
        <li key={i}>{a}</li>
      ))}
      {avisos.length > 5 && <li>…y {avisos.length - 5} más.</li>}
    </ul>
  );
  // Si se asignaron todos, la lista se va pero los avisos de lo que no se cambió se quedan a la vista.
  if (!sin.length) return listaDeAvisos ? <div className="border-t border-white/10 pt-5">{listaDeAvisos}</div> : null;

  const matricula = new Map(aviones.map((a) => [a.id, a.registration]));
  const visibles = sin.slice(0, limite);
  const alternar = (id: string, v: boolean) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  const opciones = opcionesDeCertificante(firmas, { segunCargo: true });
  const asignar = (quien: string, ids: string[], firma: "si" | "no" | null) =>
    empezar(async () => {
      const conCargo = sin.filter((v) => ids.includes(v.id));
      const r = await asignarPorSellos(quien, conCargo, firmas.find((f) => f.id === quien.split("|")[0])?.sellos, firma);
      if ("error" in r) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      setAvisos(r.avisos.map((a) => a.mensaje));
      setElegidos(new Set());
      notificar({
        tipo: "exito",
        titulo: r.asignados === 1 ? "1 vuelo asociado" : `${r.asignados} vuelos asociados`,
        detalle: r.completados ? `${r.completados === 1 ? "1 no tenía" : `${r.completados} no tenían`} certificante para el CAD: quedó el de la persona.` : undefined,
      });
    });

  const listos = [...elegidos].filter((id) => sin.some((v) => v.id === id));

  return (
    <div className="space-y-3 border-t border-white/10 pt-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-aviation-cyan">Vuelos sin certificante ({sin.length})</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Elegí a quién se lo asignás: de a uno con el selector, o tildá varios y asignalos juntos.</p>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-white min-h-11">
          <input
            type="checkbox"
            checked={listos.length === sin.length}
            onChange={(e) => setElegidos(e.target.checked ? new Set(sin.map((v) => v.id)) : new Set())}
            className="w-4 h-4 accent-[#2bd4ff]"
          />
          Todos
        </label>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Quién certificó los elegidos" className={`${campo} sm:max-w-[22rem]`}>
          <option value="">Quién certificó…</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
        <select value={anula} onChange={(e) => setAnula(e.target.value as "" | "si" | "no")} aria-label="Firma en el PDF" className={`${campo} sm:max-w-[13rem]`}>
          <option value="">Firma: automática</option>
          <option value="si">Firma: sí</option>
          <option value="no">Firma: no</option>
        </select>
        <button type="button" onClick={() => asignar(persona, listos, anula || null)} disabled={!persona || !listos.length || pendiente} className={principal}>
          {listos.length ? `Asignar ${listos.length}` : "Asignar"}
        </button>
      </div>

      <ul className={unaFila}>
        {visibles.map((v) => {
          const [, mes, dia] = v.date.split("-");
          return (
            <li key={v.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <input type="checkbox" checked={elegidos.has(v.id)} onChange={(e) => alternar(v.id, e.target.checked)} aria-label={`Elegir el vuelo ${v.route} del ${dia}/${mes}`} className="w-4 h-4 accent-[#2bd4ff] shrink-0" />
              <span className="data text-xs text-zinc-500 w-24 shrink-0">{fechaDelDorso(v.date)}</span>
              <span className="flex-1 min-w-[9rem]">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {v.route} <span className="font-normal text-zinc-500">· {(v.aircraft_id && matricula.get(v.aircraft_id)) || "—"} · {Number(v.duration).toFixed(1)} h</span>
                </span>
                {v.cad_autoridad_nombre?.trim() && <span className="block text-[11px] text-zinc-500 truncate">Dice: {v.cad_autoridad_nombre}</span>}
              </span>
              <select
                value=""
                disabled={pendiente}
                onChange={(e) => e.target.value && asignar(e.target.value, [v.id], null)}
                aria-label={`Asignar quién certificó ${v.route} del ${dia}/${mes}`}
                className="h-10 max-sm:w-full max-sm:ml-7 sm:w-44 shrink-0 rounded-xl bg-white/5 border border-white/10 px-2 text-sm text-zinc-900 dark:text-white [color-scheme:dark]"
              >
                <option value="">Asignar…</option>
                {opcionesDeCertificante(firmas).map((o) => (
                  <option key={o.valor} value={o.valor}>{o.texto}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      {sin.length > limite && (
        <button type="button" onClick={() => setLimite((l) => l + 30)} className="min-h-11 text-sm font-semibold text-aviation-cyan">
          Ver más ({sin.length - limite})
        </button>
      )}
      {listaDeAvisos}
    </div>
  );
}

function Dorsos({
  dorsos,
  libros,
  hojasPorLibro,
  firmas,
  sellosPorHoja,
}: {
  dorsos: DorsoHoja[];
  libros: { id: string; name: string }[];
  hojasPorLibro: Record<string, number>;
  /** Las personas: cada sello suyo se puede elegir para el dorso. */
  firmas: FirmaCertificante[];
  sellosPorHoja: Record<string, Record<number, string[]>>;
}) {
  const [libroId, setLibroId] = useState(libros[0]?.id ?? "");
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!libros.length) return null;
  const hojas = hojasPorLibro[libroId] ?? 1;
  const delLibro = new Map(dorsos.filter((d) => d.logbook_id === libroId).map((d) => [d.hoja, d]));
  const cuantosSellos = (d: DorsoHoja) => (d.sello_ids ?? []).filter((id) => firmas.some((f) => f.sellos?.some((x) => x.id === id))).length;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base md:text-lg font-bold text-zinc-900 dark:text-white">Firmas del dorso de cada hoja</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Las firmas con su sello o aclaración que van atrás de cada hoja del libro. Son otras imágenes que la de la celda de certificaciones:
          fotografialas tal como quedan en el papel (todas las que quieras por hoja) y sumá los sellos de tus certificantes. Salen a tamaño real, 7 × 3,5 cm cada una, como en el papel.
          Una hoja sin dorso cargado sale con su dorso en blanco, para que la doble faz no se corra.
        </p>
      </div>

      {libros.length > 1 && (
        <div className="space-y-1.5 max-w-sm">
          <label className={rotulo} htmlFor="dorso-libro">Libro</label>
          <select id="dorso-libro" value={libroId} onChange={(e) => { setLibroId(e.target.value); setAbierta(null); }} className={campo}>
            {libros.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      <ul className="divide-y divide-white/10 border-y border-white/10">
        {Array.from({ length: hojas }, (_, i) => i + 1).map((hoja) => {
          const d = delLibro.get(hoja);
          const fotos = d?.fotos ?? [];
          const sellos = d ? cuantosSellos(d) : 0;
          const resumen = d
            ? [
                fotos.length ? (fotos.length === 1 ? "1 foto" : `${fotos.length} fotos`) : "",
                sellos ? (sellos === 1 ? "1 sello" : `${sellos} sellos`) : "",
                d.aclaracion,
                fechaDelDorso(d.fecha),
              ]
                .filter(Boolean)
                .join(" · ")
            : "";
          return (
            <li key={`${libroId}-${hoja}`} className="py-3">
              <button
                type="button"
                onClick={() => setAbierta(abierta === hoja ? null : hoja)}
                aria-expanded={abierta === hoja}
                className="w-full flex items-center gap-3 min-h-11 text-left"
              >
                <span className="font-mono text-xs tracking-wider text-zinc-500 dark:text-zinc-400 w-16 shrink-0">HOJA {hoja}</span>
                {fotos[0] ? <Miniatura png={fotos[0].png} alto="h-9" /> : null}
                <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">
                  {d ? resumen || "Sin imágenes" : <span className="text-zinc-500">Sin cargar (dorso en blanco)</span>}
                </span>
                <span className="text-xs font-semibold text-aviation-cyan">{abierta === hoja ? "Cerrar" : d ? "Cambiar" : "Cargar"}</span>
              </button>
              {abierta === hoja && (
                <EditorDeDorso
                  key={`${libroId}-${hoja}`}
                  libroId={libroId}
                  hoja={hoja}
                  actual={d ?? null}
                  firmas={firmas}
                  selloIdsDeLosVuelos={sellosPorHoja[libroId]?.[hoja] ?? []}
                  alTerminar={() => setAbierta(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cuántas imágenes entran en un dorso (fotos más sellos): lo mismo que el PDF y el backend. */
const MAX_IMAGENES = 12;

function EditorDeDorso({
  libroId,
  hoja,
  actual,
  firmas,
  selloIdsDeLosVuelos,
  alTerminar,
}: {
  libroId: string;
  hoja: number;
  actual: DorsoHoja | null;
  firmas: FirmaCertificante[];
  /** Los sellos de los vuelos que caen en esta hoja, para ofrecer usarlos de un toque. */
  selloIdsDeLosVuelos: string[];
  alTerminar: () => void;
}) {
  const [nueva, setNueva] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [aclaracion, setAclaracion] = useState(actual?.aclaracion ?? "");
  const [fecha, setFecha] = useState(actual?.fecha ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const fotos = actual?.fotos ?? [];
  // Todos los sellos de todas las personas, cada uno con su nombre y su cargo.
  const sellos = firmas.flatMap((f) => (f.sellos ?? []).map((x) => ({ sello: x, texto: nombreDeSello({ nombre: f.nombre, sellos: f.sellos }, x) })));
  const existentes = new Set(sellos.map((x) => x.sello.id));
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set((actual?.sello_ids ?? []).filter((id) => existentes.has(id))));
  const deLosVuelos = selloIdsDeLosVuelos.filter((id) => existentes.has(id));
  const total = fotos.length + elegidos.size;
  const puede = !pendiente && (fotos.length > 0 || aclaracion.trim().length > 0 || !!fecha || elegidos.size > 0);

  const agregarFoto = () =>
    empezar(async () => {
      if (!nueva) return;
      setError(null);
      const r = await agregarFotoDorso({ logbookId: libroId, hoja, png: nueva });
      if ("error" in r) return setError(r.error);
      setNueva(null);
      setIntento((n) => n + 1);
    });

  const quitarFoto = (id: string) =>
    empezar(async () => {
      setError(null);
      const r = await quitarFotoDorso(id);
      if ("error" in r) setError(r.error);
    });

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const r = await guardarDorso({ logbookId: libroId, hoja, aclaracion, fecha, selloIds: [...elegidos] });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      notificar({ tipo: "exito", titulo: `Dorso de la hoja ${hoja} guardado` });
      alTerminar();
    });

  const quitar = () =>
    empezar(async () => {
      if (!actual) return;
      const r = await borrarDorso(actual.id);
      if ("error" in r) setError(r.error);
      else alTerminar();
    });

  return (
    <div className="space-y-5 pt-4">
      <div className="space-y-2">
        <p className={rotulo}>Fotos de este dorso ({fotos.length})</p>
        {fotos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fotos.map((f, i) => (
              <li key={f.id} className="rounded-2xl border border-white/10 p-2 space-y-1.5">
                <Miniatura png={f.png} alto="h-14" />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">{i + 1}</span>
                  <button type="button" onClick={() => quitarFoto(f.id)} disabled={pendiente} aria-label={`Quitar la foto ${i + 1}`} className="min-h-11 px-2 text-sm font-semibold text-red-500 disabled:opacity-40">
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {total >= MAX_IMAGENES ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Un dorso lleva hasta {MAX_IMAGENES} imágenes entre fotos y sellos.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{fotos.length ? "Agregar otra foto" : "Sacale una foto a la firma con su sello"}: cada una se limpia en tu teléfono y se guarda aparte.</p>
            <CapturaFirma key={intento} modo="dorso" alCambiar={setNueva} />
            {nueva && (
              <button type="button" onClick={agregarFoto} disabled={pendiente} className={principal}>
                {pendiente ? "Guardando…" : fotos.length ? "Agregar otra foto" : "Agregar esta foto"}
              </button>
            )}
          </div>
        )}
      </div>

      {sellos.length > 0 && (
        <fieldset className="space-y-2">
          <legend className={rotulo}>Sumar los sellos de…</legend>
          <ul className="flex flex-wrap gap-2">
            {sellos.map(({ sello, texto }) => (
              <li key={sello.id}>
                <label className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-full border text-sm cursor-pointer ${elegidos.has(sello.id) ? "border-aviation-cyan/60 bg-aviation-cyan/10 text-aviation-cyan" : "border-white/10 text-zinc-900 dark:text-white"}`}>
                  <input
                    type="checkbox"
                    checked={elegidos.has(sello.id)}
                    onChange={(e) =>
                      setElegidos((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(sello.id);
                        else n.delete(sello.id);
                        return n;
                      })
                    }
                    className="w-4 h-4 accent-[#2bd4ff]"
                  />
                  {texto}
                </label>
              </li>
            ))}
          </ul>
          {elegidos.size === 0 && deLosVuelos.length > 0 && (
            <button type="button" onClick={() => setElegidos(new Set(deLosVuelos.slice(0, MAX_IMAGENES - fotos.length)))} className="min-h-11 text-sm font-semibold text-aviation-cyan text-left">
              Usar los sellos de los vuelos de esta hoja ({deLosVuelos.length})
            </button>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Van junto a las fotos, a tamaño real. Un sello ya trae la aclaración: sólo escribila abajo si hace falta.</p>
        </fieldset>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`dorso-acl-${hoja}`}>Aclaración en texto (opcional)</label>
          <input id={`dorso-acl-${hoja}`} value={aclaracion} onChange={(e) => setAclaracion(e.target.value)} placeholder="Si el sello ya la trae, dejala vacía" autoComplete="off" className={campo} />
        </div>
        <div className="space-y-1.5">
          <label className={rotulo} htmlFor={`dorso-fecha-${hoja}`}>Fecha (opcional)</label>
          <input id={`dorso-fecha-${hoja}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={guardar} disabled={!puede} className={principal}>
          {pendiente ? "Guardando…" : "Guardar el dorso"}
        </button>
        {actual && (
          <button type="button" onClick={quitar} disabled={pendiente} className="min-h-12 px-5 text-sm font-semibold text-red-500">
            Quitar este dorso
          </button>
        )}
      </div>
    </div>
  );
}
