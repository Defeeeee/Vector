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
  sumaFirmasDeLosVuelos,
  type DorsoHoja,
  type FirmaAutomatica,
  type FirmaCertificante,
} from "@/lib/firmas-libro";
import { ayuda, campo, cuenta, enlace, Miniatura, peligro, principal, rotulo, subtitulo, unaFila } from "./comun";
import { verHoja } from "./VistaPreviaHoja";

/** Cuántas imágenes entran en un dorso (fotos más sellos): lo mismo que el PDF y el backend. */
const MAX_IMAGENES = 12;

/**
 * El dorso de cada hoja (migraciones 047, 049, 050 y 052): lo que va atrás de la hoja, en una
 * página aparte del PDF para imprimir a doble faz. Una hoja por fila; al abrirla, en el orden en
 * que se arma: las firmas de los vuelos de la hoja (solas), las fotos, otros sellos, los textos que
 * firman y, al pie, la aclaración y la fecha.
 */

/** "MACEDO · Jefe de instructores", o "MACEDO (firma y nombre)" si no tiene sello. */
function nombreDeAutomatica(a: FirmaAutomatica, firmas: FirmaCertificante[]): string {
  const p = firmas.find((f) => f.id === a.personaId);
  if (!p) return "";
  if (a.firma.startsWith("sello:")) return nombreDeSello({ nombre: p.nombre, sellos: p.sellos }, p.sellos?.find((x) => `sello:${x.id}` === a.firma));
  return `${p.nombre} (firma y nombre)`;
}

/** Las de los vuelos que de verdad suma: no repite a quien ya está por un sello elegido a mano. */
function efectivas(auto: FirmaAutomatica[], elegidos: Iterable<string>, firmas: FirmaCertificante[]): FirmaAutomatica[] {
  const presentes = new Set<string>();
  for (const id of elegidos) {
    const p = firmas.find((f) => f.sellos?.some((x) => x.id === id));
    if (p) presentes.add(p.id);
  }
  return auto.filter((a) => !presentes.has(a.personaId));
}
export default function Dorsos({
  dorsos,
  libros,
  hojasPorLibro,
  firmas,
  firmasPorHoja,
}: {
  dorsos: DorsoHoja[];
  libros: { id: string; name: string }[];
  hojasPorLibro: Record<string, number>;
  /** Las personas: cada sello suyo se puede elegir para el dorso. */
  firmas: FirmaCertificante[];
  /** Por libro y hoja, las firmas que el dorso suma solo por sus vuelos (`firmasPorHoja`). */
  firmasPorHoja: Record<string, Record<number, FirmaAutomatica[]>>;
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
          const auto = sumaFirmasDeLosVuelos(d) ? efectivas(firmasPorHoja[libroId]?.[hoja] ?? [], d?.sello_ids ?? [], firmas) : [];
          const resumen =
            d || auto.length
            ? [
                auto.length ? (auto.length === 1 ? "1 firma de los vuelos" : `${auto.length} firmas de los vuelos`) : "",
                fotos.length ? cuenta(fotos.length, "foto", "fotos") : "",
                sellos ? cuenta(sellos, "sello", "sellos") : "",
                d?.textos?.length ? cuenta(d.textos.length, "texto", "textos") : "",
                d?.aclaracion,
                fechaDelDorso(d?.fecha),
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
                  {resumen || (
                    <span className="text-zinc-500">
                      {d?.firmas_de_los_vuelos === false && (firmasPorHoja[libroId]?.[hoja]?.length ?? 0) > 0 ? "En blanco (sin las firmas de los vuelos)" : "En blanco"}
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-aviation-cyan">{abierta === hoja ? "Cerrar" : resumen ? "Abrir" : "Cargar"}</span>
              </button>
              {abierta === hoja && (
                <EditorDeDorso
                  key={`${libroId}-${hoja}`}
                  libroId={libroId}
                  hoja={hoja}
                  actual={d ?? null}
                  firmas={firmas}
                  deLosVuelos={firmasPorHoja[libroId]?.[hoja] ?? []}
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
  deLosVuelos,
  alTerminar,
}: {
  libroId: string;
  hoja: number;
  actual: DorsoHoja | null;
  firmas: FirmaCertificante[];
  /** Las firmas de quienes certificaron los vuelos de esta hoja: el dorso las suma solo. */
  deLosVuelos: FirmaAutomatica[];
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
  // Si suma las firmas de los vuelos (migración 052): lo guardado o, si nunca se eligió, sí salvo con fotos.
  const sumaAntes = sumaFirmasDeLosVuelos(actual);
  const [sumar, setSumar] = useState(sumaAntes);
  const automaticas = sumar ? efectivas(deLosVuelos, elegidos, firmas) : [];
  const total = fotos.length + elegidos.size + automaticas.length;
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
    sumar !== sumaAntes ||
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
        // Se guarda sólo si se cambió: así una hoja que nunca se tocó sigue con la regla de siempre.
        firmasDeLosVuelos: sumar !== sumaAntes ? sumar : (actual?.firmas_de_los_vuelos ?? null),
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
      <button type="button" onClick={() => verHoja(libroId, hoja)} className={enlace}>
        Ver cómo queda la hoja {hoja} ↑
      </button>

      {/* 0. Las firmas de los vuelos de la hoja: solas, se recalculan con cada vuelo. */}
      <div className="space-y-3">
        <p className={subtitulo}>De los vuelos de esta hoja</p>
        <label className="flex items-start gap-3 text-sm text-zinc-900 dark:text-white cursor-pointer">
          <input type="checkbox" checked={sumar} onChange={(e) => setSumar(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0" />
          <span>
            <strong>Sumar solas las firmas de quienes certificaron sus vuelos.</strong>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">
              El sello de cada persona para su cargo o, si no tiene, su firma con su nombre. Un vuelo nuevo, o una autoridad nueva en un vuelo de esta hoja, se suma sin hacer nada.
              {fotos.length > 0 && sumaAntes === false && actual?.firmas_de_los_vuelos == null ? " Con fotos viene apagado: un dorso fotografiado ya trae sus firmas." : ""}
            </span>
          </span>
        </label>
        {sumar &&
          (automaticas.length ? (
            <ul className="flex flex-wrap gap-2">
              {automaticas.map((a) => {
                const p = firmas.find((f) => f.id === a.personaId);
                const sello = a.firma.startsWith("sello:") ? p?.sellos?.find((x) => `sello:${x.id}` === a.firma) : null;
                return (
                  <li key={a.firma} className="inline-flex items-center gap-2 rounded-full border border-aviation-cyan/40 bg-aviation-cyan/10 pl-1 pr-3 py-1 text-sm text-aviation-cyan">
                    <Miniatura png={sello?.png ?? p?.png ?? ""} alto="h-8" />
                    {nombreDeAutomatica(a, firmas)}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={ayuda}>
              {deLosVuelos.length
                ? "Quienes certificaron sus vuelos ya están en este dorso."
                : "Ningún vuelo de esta hoja tiene quien lo certifique con firma guardada: asociálo arriba, en «Quienes certifican»."}
            </p>
          ))}
      </div>

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
          <legend className={subtitulo}>Otros sellos</legend>
          <p className={ayuda}>Para sumar a alguien que no certificó vuelos de esta hoja (una habilitación, por ejemplo). Ya traen la aclaración.</p>
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
          {pendiente ? "Guardando…" : "Guardar el dorso"}
        </button>
        {actual && !confirmando && (
          <button type="button" onClick={() => setConfirmando(true)} disabled={pendiente} className={peligro}>
            Borrar lo cargado en esta hoja
          </button>
        )}
        {actual && confirmando && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-zinc-900 dark:text-white">
            Se borra todo lo de esta hoja{fotos.length ? `, también ${cuenta(fotos.length, "foto", "fotos")}` : ""}.
            <button type="button" onClick={vaciar} disabled={pendiente} className={peligro}>Sí, borrarlo</button>
            <button type="button" onClick={() => setConfirmando(false)} className="min-h-11 px-3 text-sm font-semibold text-zinc-500">No</button>
          </span>
        )}
      </div>
    </div>
  );
}
