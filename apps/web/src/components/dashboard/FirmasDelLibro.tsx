"use client";

import { useState, useTransition } from "react";
import { PenLine, Trash2 } from "lucide-react";
import { borrarDorso, borrarFirmaCertificante, guardarDorso, guardarFirmaCertificante } from "@/actions/firmas";
import { useAvisos } from "@/components/dashboard/Avisos";
import CapturaFirma from "@/components/dashboard/CapturaFirma";
import { AUTORIDADES_CAD } from "@/lib/cad";
import { fechaDelDorso, type DorsoHoja, type FirmaCertificante } from "@/lib/firmas-libro";

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
}: {
  firmas: FirmaCertificante[];
  dorsos: DorsoHoja[];
  libros: { id: string; name: string }[];
  /** Cuántas hojas tiene hoy cada libro, como las numera el PDF. */
  hojasPorLibro: Record<string, number>;
}) {
  return (
    <div className="space-y-10">
      <Certificantes firmas={firmas} />
      <Dorsos dorsos={dorsos} libros={libros} hojasPorLibro={hojasPorLibro} />
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

function Certificantes({ firmas }: { firmas: FirmaCertificante[] }) {
  const [agregando, setAgregando] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [licencia, setLicencia] = useState("");
  const [autoridad, setAutoridad] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  const puede = !!png && nombre.trim().length > 0 && autorizado && !pendiente;

  const guardar = () => {
    if (!png) return;
    setError(null);
    empezar(async () => {
      const r = await guardarFirmaCertificante({ nombre, licencia, autoridadId: autoridad ? Number(autoridad) : null, png });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      notificar({ tipo: "exito", titulo: "Firma guardada", detalle: "Va en la celda de certificaciones cuando pidas el PDF con las firmas." });
      setAgregando(false);
      setPng(null);
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
    <div className="space-y-4">
      <div>
        <h4 className="text-base md:text-lg font-bold text-zinc-900 dark:text-white">Firmas de quienes certifican</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          La firma de tu instructor o de quien certifica tus vuelos, para la columna «Certificaciones» del libro en PDF. Se asocia a cada
          vuelo por el nombre del certificante que cargaste en él.
        </p>
      </div>

      {firmas.length > 0 && (
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {firmas.map((f) => (
            <li key={f.id} className="flex items-center gap-4 py-3">
              <Miniatura png={f.png} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-white truncate">{f.nombre}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {[f.licencia, AUTORIDADES_CAD.find((a) => a.id === f.autoridad_id)?.nombre].filter(Boolean).join(" · ") || "Sin licencia cargada"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => borrar(f)}
                disabled={pendiente}
                aria-label={`Borrar la firma de ${f.nombre}`}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
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
    </div>
  );
}

function Dorsos({
  dorsos,
  libros,
  hojasPorLibro,
}: {
  dorsos: DorsoHoja[];
  libros: { id: string; name: string }[];
  hojasPorLibro: Record<string, number>;
}) {
  const [libroId, setLibroId] = useState(libros[0]?.id ?? "");
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!libros.length) return null;
  const hojas = hojasPorLibro[libroId] ?? 1;
  const delLibro = new Map(dorsos.filter((d) => d.logbook_id === libroId).map((d) => [d.hoja, d]));

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base md:text-lg font-bold text-zinc-900 dark:text-white">Firmas del dorso de cada hoja</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          La firma con su sello o aclaración que va atrás de cada hoja del libro. Es otra imagen que la de la celda de certificaciones:
          fotografiala tal como queda en el papel. Una hoja sin dorso cargado sale con su dorso en blanco, para que la doble faz no se corra.
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
          return (
            <li key={`${libroId}-${hoja}`} className="py-3">
              <button
                type="button"
                onClick={() => setAbierta(abierta === hoja ? null : hoja)}
                aria-expanded={abierta === hoja}
                className="w-full flex items-center gap-4 min-h-11 text-left"
              >
                <span className="font-mono text-xs tracking-wider text-zinc-500 dark:text-zinc-400 w-16 shrink-0">HOJA {hoja}</span>
                {d?.png ? <Miniatura png={d.png} alto="h-9" /> : null}
                <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">
                  {d ? [d.aclaracion, fechaDelDorso(d.fecha)].filter(Boolean).join(" · ") || "Con imagen" : <span className="text-zinc-500">Sin cargar (dorso en blanco)</span>}
                </span>
                <span className="text-xs font-semibold text-aviation-cyan">{abierta === hoja ? "Cerrar" : d ? "Cambiar" : "Cargar"}</span>
              </button>
              {abierta === hoja && <EditorDeDorso key={`${libroId}-${hoja}-${d?.id ?? "nuevo"}`} libroId={libroId} hoja={hoja} actual={d ?? null} alTerminar={() => setAbierta(null)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditorDeDorso({ libroId, hoja, actual, alTerminar }: { libroId: string; hoja: number; actual: DorsoHoja | null; alTerminar: () => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [aclaracion, setAclaracion] = useState(actual?.aclaracion ?? "");
  const [fecha, setFecha] = useState(actual?.fecha ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();

  // Sin foto nueva se conserva la imagen que ya estaba.
  const imagen = png ?? actual?.png ?? null;
  const puede = !pendiente && (!!imagen || aclaracion.trim().length > 0 || !!fecha);

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const r = await guardarDorso({ logbookId: libroId, hoja, png: imagen, aclaracion, fecha });
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
      {actual?.png && !png && (
        <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Miniatura png={actual.png} alto="h-16" />
          <span>Imagen actual. Sacá otra foto para reemplazarla.</span>
        </div>
      )}
      <CapturaFirma modo="dorso" alCambiar={setPng} />
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
