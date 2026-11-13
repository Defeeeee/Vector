"use client";

import { useState, useTransition } from "react";
import { agregarFotoDorso, borrarDorso, guardarDorso, quitarFotoDorso } from "@/actions/firmas";
import { useAvisos } from "@/components/dashboard/Avisos";
import CapturaFirma from "@/components/dashboard/CapturaFirma";
import {
  fechaDelDorso,
  MAX_ACLARACION_DORSO,
  MAX_LARGO_TEXTO_DORSO,
  MAX_TEXTOS_DORSO,
  nombreDeSello,
  type DorsoHoja,
  type FirmaCertificante,
} from "@/lib/firmas-libro";
import { ayuda, campo, cuenta, enlace, Miniatura, peligro, principal, rotulo, subtitulo, unaFila } from "./comun";

/** Cuántas imágenes entran en un dorso (fotos más sellos): lo mismo que el PDF y el backend. */
const MAX_IMAGENES = 12;

/**
 * El dorso de cada hoja (migraciones 047, 049 y 050): lo que va atrás de la hoja, en una página
 * aparte del PDF para imprimir a doble faz. Una hoja por fila; al abrirla, en el orden en que se
 * arma: las fotos, los sellos de tus certificantes, los textos que firman y, al pie, la aclaración
 * y la fecha.
 */
export default function Dorsos({
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

      <ul className={unaFila}>
        {Array.from({ length: hojas }, (_, i) => i + 1).map((hoja) => {
          const d = delLibro.get(hoja);
          const fotos = d?.fotos ?? [];
          const sellos = d ? cuantosSellos(d) : 0;
          const resumen = d
            ? [
                fotos.length ? cuenta(fotos.length, "foto", "fotos") : "",
                sellos ? cuenta(sellos, "sello", "sellos") : "",
                d.textos?.length ? cuenta(d.textos.length, "texto", "textos") : "",
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
                  {d ? resumen || "Vacío" : <span className="text-zinc-500">En blanco</span>}
                </span>
                <span className="text-xs font-semibold text-aviation-cyan">{abierta === hoja ? "Cerrar" : d ? "Abrir" : "Cargar"}</span>
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
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const fotos = actual?.fotos ?? [];
  // Todos los sellos de todas las personas, cada uno con su nombre y su cargo.
  const sellos = firmas.flatMap((f) => (f.sellos ?? []).map((x) => ({ sello: x, texto: nombreDeSello({ nombre: f.nombre, sellos: f.sellos }, x) })));
  const existentes = new Set(sellos.map((x) => x.sello.id));
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set((actual?.sello_ids ?? []).filter((id) => existentes.has(id))));
  const deLosVuelos = selloIdsDeLosVuelos.filter((id) => existentes.has(id));
  const total = fotos.length + elegidos.size;
  // Los textos del dorso (migración 050), cada uno con la firma que lo avala. `clave` es sólo para React.
  const [textos, setTextos] = useState<{ clave: number; texto: string; firma: string }[]>(() =>
    (actual?.textos ?? []).map((t, i) => ({ clave: i, texto: t.texto, firma: t.firma ?? "" }))
  );
  const [proximaClave, setProximaClave] = useState(() => (actual?.textos?.length ?? 0) + 1);
  const opcionesDeFirma = [
    ...fotos.map((f, i) => ({ valor: `foto:${f.id}`, texto: `Foto ${i + 1} de esta hoja` })),
    ...sellos.map(({ sello, texto }) => ({ valor: `sello:${sello.id}`, texto })),
  ];
  const cambiarTexto = (clave: number, cambio: Partial<{ texto: string; firma: string }>) => {
    setTextos((ts) => ts.map((t) => (t.clave === clave ? { ...t, ...cambio } : t)));
    // Un texto avalado por un sello suma ese sello al dorso: el texto va arriba de esa firma.
    const id = cambio.firma?.startsWith("sello:") ? cambio.firma.slice(6) : null;
    if (id && !elegidos.has(id) && total < MAX_IMAGENES) setElegidos((e) => new Set(e).add(id));
  };
  const alternarSello = (id: string, si: boolean) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  const textoLargo = textos.some((t) => t.texto.trim().length > MAX_LARGO_TEXTO_DORSO);
  const aclaracionLarga = aclaracion.trim().length > MAX_ACLARACION_DORSO;

  // Lo que espera a «Guardar»: los sellos, los textos y el pie. Las fotos se guardan al agregarlas.
  const textosIniciales = JSON.stringify((actual?.textos ?? []).map((t) => [t.texto, t.firma ?? ""]));
  const sellosIniciales = [...(actual?.sello_ids ?? [])].filter((id) => existentes.has(id)).sort().join();
  const hayCambios =
    aclaracion !== (actual?.aclaracion ?? "") ||
    fecha !== (actual?.fecha ?? "") ||
    [...elegidos].sort().join() !== sellosIniciales ||
    JSON.stringify(textos.map((t) => [t.texto, t.firma])) !== textosIniciales;
  const puede = !pendiente && hayCambios && !textoLargo && !aclaracionLarga;

  const agregarFoto = () =>
    empezar(async () => {
      if (!nueva) return;
      setError(null);
      const r = await agregarFotoDorso({ logbookId: libroId, hoja, png: nueva });
      if ("error" in r) return setError(r.error);
      setNueva(null);
      setIntento((n) => n + 1);
      notificar({ tipo: "exito", titulo: "Foto guardada" });
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
      const r = await guardarDorso({
        logbookId: libroId,
        hoja,
        aclaracion,
        fecha,
        selloIds: [...elegidos],
        // Una firma que ya no está (se quitó la foto) deja el texto solo.
        textos: textos.map((t) => ({ texto: t.texto, firma: opcionesDeFirma.some((o) => o.valor === t.firma) ? t.firma : null })),
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      notificar({ tipo: "exito", titulo: `Dorso de la hoja ${hoja} guardado` });
      alTerminar();
    });

  const vaciar = () =>
    empezar(async () => {
      if (!actual) return;
      const r = await borrarDorso(actual.id);
      if ("error" in r) setError(r.error);
      else alTerminar();
    });

  return (
    <div className="space-y-8 pt-5 pb-2">
      {/* 1. Las fotos: cada una se guarda al agregarla (una imagen por pedido). */}
      <div className="space-y-3">
        <p className={subtitulo}>Fotos ({fotos.length})</p>
        <p className={ayuda}>La firma con su sello tal como quedó en el papel. Cada foto se limpia en tu teléfono y se guarda al agregarla.</p>
        {fotos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fotos.map((f, i) => (
              <li key={f.id} className="space-y-1">
                <Miniatura png={f.png} alto="h-16" />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">FOTO {i + 1}</span>
                  <button type="button" onClick={() => quitarFoto(f.id)} disabled={pendiente} aria-label={`Quitar la foto ${i + 1}`} className={peligro}>
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {total >= MAX_IMAGENES ? (
          <p className={ayuda}>Un dorso lleva hasta {MAX_IMAGENES} imágenes entre fotos y sellos.</p>
        ) : (
          <div className="space-y-3">
            <CapturaFirma key={intento} modo="dorso" alCambiar={setNueva} />
            {nueva && (
              <button type="button" onClick={agregarFoto} disabled={pendiente} className={principal}>
                {pendiente ? "Guardando…" : "Agregar esta foto"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Los sellos de las personas. */}
      {sellos.length > 0 && (
        <fieldset className="space-y-3">
          <legend className={subtitulo}>Sellos</legend>
          <p className={ayuda}>Las firmas con sello que guardaste en cada persona. Ya traen la aclaración.</p>
          <ul className="flex flex-wrap gap-2">
            {sellos.map(({ sello, texto }) => (
              <li key={sello.id}>
                <label className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-full border text-sm cursor-pointer ${elegidos.has(sello.id) ? "border-aviation-cyan/60 bg-aviation-cyan/10 text-aviation-cyan" : "border-white/10 text-zinc-900 dark:text-white"}`}>
                  <input type="checkbox" checked={elegidos.has(sello.id)} onChange={(e) => alternarSello(sello.id, e.target.checked)} className="w-4 h-4 accent-[#2bd4ff]" />
                  {texto}
                </label>
              </li>
            ))}
          </ul>
          {elegidos.size === 0 && deLosVuelos.length > 0 && (
            <button type="button" onClick={() => setElegidos(new Set(deLosVuelos.slice(0, MAX_IMAGENES - fotos.length)))} className={enlace}>
              Usar los de los vuelos de esta hoja ({deLosVuelos.length})
            </button>
          )}
        </fieldset>
      )}

      {/* 3. Los textos, cada uno con la firma que lo avala. */}
      <div className="space-y-3">
        <p className={subtitulo}>Textos ({textos.length})</p>
        <p className={ayuda}>Una habilitación o una constancia con la firma que la avala: en el PDF el texto va arriba de esa firma.</p>
        {textos.map((t, i) => {
          const largo = t.texto.trim().length;
          return (
            <div key={t.clave} className="space-y-2 border-l-2 border-white/10 pl-4">
              <div className="space-y-1.5">
                <label className={rotulo} htmlFor={`dorso-texto-${hoja}-${t.clave}`}>Texto {i + 1}</label>
                <textarea
                  id={`dorso-texto-${hoja}-${t.clave}`}
                  value={t.texto}
                  onChange={(e) => cambiarTexto(t.clave, { texto: e.target.value })}
                  rows={3}
                  placeholder="En el día de la fecha el titular del presente libro queda habilitado para…"
                  className={`${campo} resize-y`}
                />
                <p className={`text-xs ml-1 font-mono ${largo > MAX_LARGO_TEXTO_DORSO ? "text-red-500" : "text-zinc-500"}`}>
                  {largo}/{MAX_LARGO_TEXTO_DORSO}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5 flex-1 min-w-[12rem]">
                  <label className={rotulo} htmlFor={`dorso-firma-${hoja}-${t.clave}`}>Firma que lo avala</label>
                  <select id={`dorso-firma-${hoja}-${t.clave}`} value={opcionesDeFirma.some((o) => o.valor === t.firma) ? t.firma : ""} onChange={(e) => cambiarTexto(t.clave, { firma: e.target.value })} className={campo}>
                    <option value="">Sin firma (el texto solo)</option>
                    {opcionesDeFirma.map((o) => (
                      <option key={o.valor} value={o.valor}>{o.texto}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={() => setTextos((ts) => ts.filter((x) => x.clave !== t.clave))} className={`${peligro} min-h-12`}>
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
        {textos.length < MAX_TEXTOS_DORSO && (
          <button
            type="button"
            onClick={() => {
              setTextos((ts) => [...ts, { clave: proximaClave, texto: "", firma: "" }]);
              setProximaClave((n) => n + 1);
            }}
            className={enlace}
          >
            + Agregar un texto
          </button>
        )}
      </div>

      {/* 4. El pie de la hoja. */}
      <div className="space-y-3">
        <p className={subtitulo}>Al pie</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={rotulo} htmlFor={`dorso-acl-${hoja}`}>Aclaración (opcional)</label>
            <input id={`dorso-acl-${hoja}`} value={aclaracion} onChange={(e) => setAclaracion(e.target.value)} placeholder="Si las firmas ya la traen, dejala vacía" autoComplete="off" className={campo} />
            {aclaracionLarga && (
              <p className="text-xs text-red-500 ml-1">
                Hasta {MAX_ACLARACION_DORSO} letras ({aclaracion.trim().length}). Para algo más largo, agregalo en «Textos».
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className={rotulo} htmlFor={`dorso-fecha-${hoja}`}>Fecha (opcional)</label>
            <input id={`dorso-fecha-${hoja}`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" onClick={guardar} disabled={!puede} className={principal}>
          {pendiente ? "Guardando…" : "Guardar sellos, textos y pie"}
        </button>
        {actual && !confirmando && (
          <button type="button" onClick={() => setConfirmando(true)} disabled={pendiente} className={peligro}>
            Dejar esta hoja en blanco
          </button>
        )}
        {actual && confirmando && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-zinc-900 dark:text-white">
            Se borra todo lo de esta hoja{fotos.length ? `, también ${cuenta(fotos.length, "foto", "fotos")}` : ""}.
            <button type="button" onClick={vaciar} disabled={pendiente} className={peligro}>Sí, dejarla en blanco</button>
            <button type="button" onClick={() => setConfirmando(false)} className="min-h-11 px-3 text-sm font-semibold text-zinc-500">No</button>
          </span>
        )}
      </div>
    </div>
  );
}
