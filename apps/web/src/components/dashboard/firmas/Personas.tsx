"use client";

import { useState, useTransition } from "react";
import { ChevronDown, PenLine, Trash2, X } from "lucide-react";
import {
  agregarSello,
  asignarCertificante,
  borrarFirmaCertificante,
  desasociarCertificante,
  editarCertificante,
  editarSello,
  guardarFirmaCertificante,
  quitarSello,
} from "@/actions/firmas";
import { useAvisos } from "@/components/dashboard/Avisos";
import CapturaFirma from "@/components/dashboard/CapturaFirma";
import { asignarPorSellos } from "@/lib/asignar-sellos";
import {
  fechaDelDorso,
  nombreDeSello,
  normalizarNombre,
  opcionesDeCertificante,
  vuelosPorCertificante,
  vuelosSinCertificante,
  type FirmaCertificante,
  type SelloCertificante,
  type SugerenciaCertificante,
} from "@/lib/firmas-libro";
import type { Aircraft, Flight } from "@/types";
import { ayuda, campo, cuenta, enlace, Miniatura, nombreDeCargo, peligro, principal, rotulo, secundario, SelectorCargo, subtitulo, unaFila } from "./comun";

/**
 * Quienes certifican tus vuelos (migraciones 047–049): una ficha por persona con
 * - **su firma**, el trazo solo, que va en la celda «Certificaciones» de sus vuelos;
 * - **sus sellos**, la firma con sello, uno por cargo del CAD, que van al dorso;
 * - los otros nombres con que aparece en tus vuelos, y cuántos certificó.
 *
 * Hasta la 3.36.0 el alta también pedía el primer sello, con su propio cargo: repetía «Sus
 * sellos» con otras palabras. Ahora el alta es la firma y los datos, y los sellos se suman en la
 * ficha, que se abre sola al guardar.
 */
export default function Personas({
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
  const [abierta, setAbierta] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(firmas.length === 0);
  const cuantos = vuelosPorCertificante(vuelos);

  return (
    <div className="space-y-8">
      {sugerencias.length > 0 && <Sugerencias sugerencias={sugerencias} firmas={firmas} />}

      {firmas.length > 0 && (
        <ul className={unaFila}>
          {firmas.map((f) => {
            const n = cuantos.get(f.id) ?? 0;
            const abiertaEsta = abierta === f.id;
            const sellos = f.sellos?.length ?? 0;
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
                      {[f.licencia, nombreDeCargo(f.autoridad_id)].filter(Boolean).join(" · ") || "Sin licencia cargada"}
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {cuenta(n, "vuelo", "vuelos")} · {sellos ? cuenta(sellos, "sello", "sellos") : "sin sellos"}
                      {f.automatica === false ? " · sólo donde la pidas" : ""}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-zinc-500 transition-transform ${abiertaEsta ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {abiertaEsta && (
                  <FichaDePersona key={f.id} firma={f} idsDeVuelos={vuelos.filter((v) => v.certificante_id === f.id).map((v) => v.id)} alBorrar={() => setAbierta(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {agregando ? (
        <AltaDePersona
          alCancelar={firmas.length ? () => setAgregando(false) : undefined}
          alGuardar={(id) => {
            setAgregando(false);
            if (id) setAbierta(id);
          }}
        />
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className={principal}>
          <PenLine className="w-4 h-4 mr-2" aria-hidden="true" />
          Agregar una persona
        </button>
      )}

      {firmas.length > 0 && <SinCertificante firmas={firmas} vuelos={vuelos} aviones={aviones} />}
    </div>
  );
}

/** El alta: la firma (el trazo solo) y sus datos. Los sellos, después, en su ficha. */
function AltaDePersona({ alGuardar, alCancelar }: { alGuardar: (id: string | null) => void; alCancelar?: () => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [licencia, setLicencia] = useState("");
  const [autoridad, setAutoridad] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();
  const puede = !!png && nombre.trim().length > 0 && autorizado && !pendiente;

  const guardar = () =>
    empezar(async () => {
      if (!png) return;
      setError(null);
      const r = await guardarFirmaCertificante({ nombre, licencia, autoridadId: autoridad ? Number(autoridad) : null, png });
      if ("error" in r) return setError(r.error);
      notificar({ tipo: "exito", titulo: "Persona guardada", detalle: "Si firma con sello, sumáselo en su ficha." });
      alGuardar(r.id);
    });

  return (
    <div className="space-y-5 border-t border-white/10 pt-6">
      <p className={subtitulo}>Nueva persona</p>
      <div className="space-y-2">
        <p className={rotulo}>Su firma, el trazo solo (la de la celda «Certificaciones»)</p>
        <CapturaFirma modo="firma" alCambiar={setPng} />
      </div>
      <DatosDePersona
        prefijo="alta"
        nombre={nombre}
        setNombre={setNombre}
        licencia={licencia}
        setLicencia={setLicencia}
        autoridad={autoridad}
        setAutoridad={setAutoridad}
      />
      <label className="flex items-start gap-3 text-sm text-zinc-900 dark:text-white">
        <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0" />
        <span>
          <strong>Usá la firma de alguien sólo con su autorización: certificar es suyo.</strong> Confirmo que esta persona me autorizó a guardar su firma.
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={guardar} disabled={!puede} className={principal}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {alCancelar && (
          <button type="button" onClick={alCancelar} className="min-h-12 px-5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function DatosDePersona({
  prefijo,
  nombre,
  setNombre,
  licencia,
  setLicencia,
  autoridad,
  setAutoridad,
}: {
  prefijo: string;
  nombre: string;
  setNombre: (v: string) => void;
  licencia: string;
  setLicencia: (v: string) => void;
  autoridad: string;
  setAutoridad: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className={rotulo} htmlFor={`${prefijo}-nombre`}>Aclaración (nombre)</label>
        <input id={`${prefijo}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" autoComplete="off" className={`${campo} uppercase`} />
      </div>
      <div className="space-y-1.5">
        <label className={rotulo} htmlFor={`${prefijo}-licencia`}>Licencia (opcional)</label>
        <input id={`${prefijo}-licencia`} value={licencia} onChange={(e) => setLicencia(e.target.value)} placeholder="INA 12345" autoComplete="off" className={`${campo} uppercase`} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <label className={rotulo} htmlFor={`${prefijo}-cargo`}>Cargo habitual en el CAD (opcional)</label>
        <SelectorCargo id={`${prefijo}-cargo`} valor={autoridad} alCambiar={setAutoridad} vacio="Sin elegir" />
        <p className={`${ayuda} ml-1`}>El que se completa en sus vuelos. Si certifica con más de un cargo, cada sello lleva el suyo.</p>
      </div>
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
    <div className="space-y-2">
      <p className={subtitulo}>Para asociar</p>
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
              <button type="button" onClick={() => asociar(s)} disabled={pendiente} className={`${secundario} self-start`}>
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

/**
 * La ficha de una persona, en el orden en que se piensa: su firma y sus datos (con su botón), sus
 * sellos, los nombres con que aparece en tus vuelos y cuándo se pone sola. Lo que no es «sus
 * datos» se guarda al tocarlo, y lo dice.
 */
function FichaDePersona({ firma, idsDeVuelos, alBorrar }: { firma: FirmaCertificante; idsDeVuelos: string[]; alBorrar: () => void }) {
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

  const guardarDatos = () =>
    aplicar({ nombre, licencia, autoridadId: autoridad ? Number(autoridad) : null, ...(nuevaFirma ? { png: nuevaFirma } : {}) }, "Cambios guardados");

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

  const borrar = () =>
    empezar(async () => {
      const r = await borrarFirmaCertificante(firma.id);
      if ("error" in r) setError(r.error);
      else alBorrar();
    });

  return (
    <div className="space-y-8 pt-5 pb-2">
      {/* Su firma y sus datos: lo único que espera a «Guardar». */}
      <div className="space-y-4">
        <p className={subtitulo}>Su firma y sus datos</p>
        {!cambiandoFirma ? (
          <div className="flex items-center gap-3">
            <Miniatura png={firma.png} alto="h-14" />
            <button type="button" onClick={() => setCambiandoFirma(true)} className={enlace}>Cambiar la firma</button>
          </div>
        ) : (
          <CapturaFirma modo="firma" alCambiar={setNuevaFirma} />
        )}
        <DatosDePersona
          prefijo={`p-${firma.id}`}
          nombre={nombre}
          setNombre={setNombre}
          licencia={licencia}
          setLicencia={setLicencia}
          autoridad={autoridad}
          setAutoridad={setAutoridad}
        />
        {cambios && (
          <button type="button" onClick={guardarDatos} disabled={pendiente} className={principal}>
            {pendiente ? "Guardando…" : "Guardar los cambios"}
          </button>
        )}
      </div>

      <SellosDePersona firma={firma} />

      <div className="space-y-2">
        <p className={subtitulo}>Cómo aparece en tus vuelos</p>
        <p className={ayuda}>Los vuelos que dicen alguno de estos nombres se le sugieren a esta persona.</p>
        {alias.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {alias.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 pl-3 pr-1 text-xs text-zinc-900 dark:text-white">
                <span className="py-1.5">{a}</span>
                <button type="button" onClick={() => sacarAlias(a)} aria-label={`Sacar el nombre ${a}`} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-500">
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
            placeholder="Otro nombre, como figura en el vuelo"
            aria-label="Sumar otro nombre"
            autoComplete="off"
            className={`${campo} uppercase`}
          />
          <button type="button" onClick={sumarAlias} disabled={!nuevoAlias.trim() || pendiente} className="min-h-12 px-4 rounded-full border border-white/10 text-sm font-semibold text-zinc-900 dark:text-white disabled:opacity-40">Sumar</button>
        </div>
      </div>

      <div className="space-y-3">
        <p className={subtitulo}>En el PDF</p>
        <label className="flex items-start gap-3 text-sm text-zinc-900 dark:text-white cursor-pointer">
          <input
            type="checkbox"
            checked={firma.automatica !== false}
            onChange={(e) => aplicar({ automatica: e.target.checked }, e.target.checked ? "Su firma se pone sola" : "Su firma ya no se pone sola")}
            disabled={pendiente}
            className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0"
          />
          <span>
            <strong>Ponerla sola en sus vuelos.</strong>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">Apagado, su firma sólo sale en los vuelos donde pongas «Firma: sí».</span>
          </span>
        </label>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Certificó <strong className="text-zinc-900 dark:text-white">{cuenta(vuelosDeEsta, "vuelo", "vuelos")}</strong>
          {vuelosDeEsta > 0 && (
            <button type="button" onClick={sacarDeSusVuelos} disabled={pendiente} className={`ml-2 ${peligro}`}>Sacarla de todos</button>
          )}
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button type="button" onClick={borrar} disabled={pendiente} className={`${peligro} inline-flex items-center gap-2 px-0`}>
        <Trash2 className="w-4 h-4" aria-hidden="true" />
        Borrar a esta persona
      </button>
    </div>
  );
}

/**
 * Sus sellos (migración 049): la firma con sello, uno por cargo ("Jefe de instructores",
 * "Instructor de vuelo"). Una persona, no dos: así sus vuelos y las sugerencias no se parten.
 * Cada imagen va en su propio pedido, y se guarda al tocar «Guardar el sello».
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
      const r = await agregarSello(firma.id, { png, etiqueta: etiqueta.trim() || nombreDeCargo(cargo ? Number(cargo) : null) || "Con sello", autoridadId: cargo ? Number(cargo) : null, nombreCad });
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
      <p className={subtitulo}>Sus sellos</p>
      <p className={ayuda}>Su firma con el sello, como la estampa en el papel: va al dorso de las hojas. Uno por cada cargo con el que certifica.</p>
      {sellos.length > 0 && (
        <ul className={unaFila}>
          {sellos.map((x) => (
            <li key={x.id}>
              <FilaDeSello sello={x} />
            </li>
          ))}
        </ul>
      )}
      {!agregando ? (
        <button type="button" onClick={() => setAgregando(true)} className={enlace}>
          {sellos.length ? "+ Agregar otro sello" : "+ Agregar su firma con sello"}
        </button>
      ) : (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <CapturaFirma key={intento} modo="dorso" alCambiar={setPng} />
          <CamposDeSello prefijo={`ns-${firma.id}`} etiqueta={etiqueta} setEtiqueta={setEtiqueta} cargo={cargo} setCargo={setCargo} nombreCad={nombreCad} setNombreCad={setNombreCad} />
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

function CamposDeSello({
  prefijo,
  etiqueta,
  setEtiqueta,
  cargo,
  setCargo,
  nombreCad,
  setNombreCad,
}: {
  prefijo: string;
  etiqueta: string;
  setEtiqueta: (v: string) => void;
  cargo: string;
  setCargo: (v: string) => void;
  nombreCad: string;
  setNombreCad: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-1.5">
        <label className={rotulo} htmlFor={`${prefijo}-etiqueta`}>Nombre del sello</label>
        <input id={`${prefijo}-etiqueta`} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Instructor de vuelo" autoComplete="off" className={campo} />
      </div>
      <div className="space-y-1.5">
        <label className={rotulo} htmlFor={`${prefijo}-cargo`}>Cargo en el CAD</label>
        <SelectorCargo id={`${prefijo}-cargo`} valor={cargo} alCambiar={setCargo} vacio="Sin cargo" />
      </div>
      <div className="space-y-1.5">
        <label className={rotulo} htmlFor={`${prefijo}-cad`}>Nombre en el CAD (opcional)</label>
        <input id={`${prefijo}-cad`} value={nombreCad} onChange={(e) => setNombreCad(e.target.value)} placeholder="Igual que en el CAD" autoComplete="off" className={`${campo} uppercase`} />
      </div>
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
    <div className="py-4 flex flex-col sm:flex-row gap-4">
      <div className="shrink-0">
        <Miniatura png={sello.png} alto="h-16" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <CamposDeSello prefijo={`s-${sello.id}`} etiqueta={etiqueta} setEtiqueta={setEtiqueta} cargo={cargo} setCargo={setCargo} nombreCad={nombreCad} setNombreCad={setNombreCad} />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex flex-wrap gap-3 items-center">
          {cambio && (
            <button type="button" onClick={guardar} disabled={!etiqueta.trim() || pendiente} className={secundario}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          )}
          <button type="button" onClick={quitar} disabled={pendiente} className={peligro}>Quitar el sello</button>
        </div>
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
    <div className="space-y-3 border-t border-white/10 pt-6">
      <p className={subtitulo}>Vuelos sin certificante ({sin.length})</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Elegí quién lo certificó: de a uno con el selector de cada vuelo, o tildá varios y asignalos juntos.</p>

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
        <button type="button" onClick={() => setLimite((l) => l + 30)} className={enlace}>
          Ver más ({sin.length - limite})
        </button>
      )}
      {listaDeAvisos}
    </div>
  );
}
