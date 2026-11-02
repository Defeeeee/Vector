"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { DocumentKind, Flight, OffsetUnit, PilotDocument } from "@/types";
import { documentStatus } from "@/lib/utils";
import {
  MAX_OFFSET,
  ayudaAncla,
  ayudaRegla,
  descripcionRegla,
  modoDe,
  type ModoVencimiento,
} from "@/lib/expiry-rules";
import { createDocument, deleteDocument, updateDocument } from "@/actions/document";
import StyledSelect from "./StyledSelect";
import { useAvisos } from "./Avisos";

const KIND_OPTIONS: { value: DocumentKind; label: string }[] = [
  { value: "cma", label: "Certificado médico (CMA)" },
  { value: "licencia", label: "Licencia" },
  { value: "habilitacion", label: "Habilitación" },
  { value: "seguro", label: "Seguro" },
  { value: "aeronavegabilidad", label: "Aeronavegabilidad" },
  { value: "repaso_vuelo", label: "Repaso de vuelo (24 meses)" },
  { value: "otro", label: "Otro" },
];

/**
 * The categories worth a one-tap shortcut, with the name they prefill.
 *
 * Deliberately not all six kinds: "otro" has no useful default name, and the
 * point of a chip row is to be scannable. Everything else stays reachable
 * through "Otro documento".
 */
const QUICK_ADD: { kind: DocumentKind; label: string; name: string }[] = [
  { kind: "cma", label: "CMA", name: "Certificado Médico Aeronáutico" },
  { kind: "licencia", label: "Licencia", name: "Licencia" },
  { kind: "habilitacion", label: "Habilitación", name: "Habilitación" },
  { kind: "seguro", label: "Seguro", name: "Seguro" },
  { kind: "aeronavegabilidad", label: "Aeronavegabilidad", name: "Certificado de aeronavegabilidad" },
  { kind: "repaso_vuelo", label: "Repaso de vuelo", name: "Repaso de vuelo (RAAC 61.135)" },
];

/**
 * Los tres modos de vencimiento, en orden de qué tan común es cada uno.
 *
 * "En una fecha" es el CMA y la licencia, o sea casi todo. La regla derivada es
 * para lo que no tiene fecha sino condición —"60 días sin volar y necesitás
 * adaptación"—, y se guarda como regla justamente porque escrita a mano estaría mal
 * al día siguiente. Ver `src/lib/expiry-rules.ts`.
 */
const MODO_OPTIONS: { value: ModoVencimiento; label: string }[] = [
  { value: "fecha", label: "En una fecha" },
  { value: "ultimo_vuelo", label: "Contado desde mi último vuelo" },
  { value: "vuelo_ancla", label: "Contado desde un vuelo puntual" },
  { value: "no_vence", label: "No vence" },
];

/**
 * Días o meses.
 *
 * Los meses no son un lujo: el repaso de 61.135 son **24 meses calendario**, y
 * resolverlo con 730 días se corre uno o dos según los bisiestos. En un vencimiento
 * regulatorio esos dos días son poder volar o no.
 */
const UNIDAD_OPTIONS: { value: OffsetUnit; label: string }[] = [
  { value: "dias", label: "días" },
  { value: "meses", label: "meses" },
];

const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label])) as Record<DocumentKind, string>;

const TONE_STYLES = {
  expired: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  critical: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  warning: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  ok: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  // Neutro y no verde: "no vence" no es un estado saludable que haya que
  // celebrar, es la ausencia de una cuenta regresiva.
  sin_vencimiento: "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10",
} as const;

export default function DocumentsManager({
  documents,
  todayIso,
  flights = [],
}: {
  documents: PilotDocument[];
  /**
   * Los vuelos del piloto, para los vencimientos derivados.
   *
   * Acá se usan **sólo para explicar y para elegir**: la fecha que vale la calcula y
   * la guarda el backend. Sirven para dos cosas —contestar "entonces hoy vence el
   * ..." antes de guardar, y ofrecer la lista de la que se elige el vuelo ancla—.
   */
  flights?: Flight[];
  /**
   * "Today" as decided by the server, in YYYY-MM-DD.
   *
   * Letting this component call `new Date()` would mean SSR and hydration can
   * land on different calendar days — the server runs in UTC while the pilot's
   * browser is at UTC-3, so any evening after 21:00 local the two disagree and
   * every "vence en N días" badge mismatches.
   */
  todayIso: string;
}) {
  const today = new Date(`${todayIso}T00:00:00Z`);

  // Del más reciente al más viejo: es el orden en que un piloto busca un vuelo suyo,
  // y deja el ancla más probable arriba de todo. Comparación de strings ISO, sin
  // construir un `Date`.
  const vuelosOrdenados = [...flights].sort((a, b) => b.date.localeCompare(a.date));
  const ultimoVuelo = vuelosOrdenados[0]?.date ?? null;
  const fechaPorVuelo = new Map(flights.map((f) => [f.id, f.date]));

  const [editing, setEditing] = useState<PilotDocument | null>(null);
  const [adding, setAdding] = useState(false);
  /** Category a quick-add chip preselected, if the form was opened by one. */
  const [presetKind, setPresetKind] = useState<DocumentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const openQuickAdd = (kind: DocumentKind | null) => {
    setPresetKind(kind);
    setEditing(null);
    setAdding(true);
    setError(null);
  };

  const closeForm = () => {
    setAdding(false);
    setPresetKind(null);
  };

  const { notificar } = useAvisos();

  const remove = (doc: PilotDocument) => {
    if (!confirm(`¿Borrar "${doc.name}"?`)) return;
    setBusyId(doc.id);
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument(doc.id);
      if (result?.error) {
        setError(result.error);
      } else {
        notificar({ tipo: "exito", titulo: "Documento eliminado", detalle: `Se borró "${doc.name}" correctamente.` });
      }
      setBusyId(null);
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {documents.length === 0 && !adding && (
          <div className="bg-white dark:bg-white/[0.02] p-6 md:p-10 rounded-[2rem] text-center border border-dashed border-zinc-200 dark:border-white/10">
            <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">
              No hay documentos cargados. Agregá el CMA, la licencia o cualquier cosa que venza.
            </p>
          </div>
        )}

        {documents.map((doc) => {
          const status = documentStatus(doc.expiry_date, today);
          const isEditing = editing?.id === doc.id;

          if (isEditing) {
            return (
              <DocumentForm
                key={doc.id}
                document={doc}
                vuelos={vuelosOrdenados}
                onCancel={() => setEditing(null)}
                onDone={() => setEditing(null)}
                onError={setError}
              />
            );
          }

          return (
            // Stacks below `sm`: on a 390 px phone the pill plus the two icon
            // buttons take ~140 px of a 342 px row, which squeezed the name to
            // "Certifi…" and broke the date across three lines. Side by side
            // only works once there's room for both halves.
            <div
              key={doc.id}
              className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">{doc.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    {KIND_LABEL[doc.kind] ?? doc.kind}
                  </span>
                </div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {doc.expiry_date
                    ? new Date(`${doc.expiry_date}T00:00:00`).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "No vence"}
                  {doc.notes ? ` · ${doc.notes}` : ""}
                </p>
                {/* La fecha de un vencimiento derivado se mueve sola. Sin la regla
                    escrita al lado, el piloto ve un número distinto cada tanto y no
                    tiene forma de saber por qué. */}
                {descripcionRegla(
                  doc,
                  doc.expiry_anchor_flight_id
                    ? fechaPorVuelo.get(doc.expiry_anchor_flight_id)
                    : ultimoVuelo
                ) && (
                  <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                    Se recalcula:{" "}
                    {descripcionRegla(
                      doc,
                      doc.expiry_anchor_flight_id
                        ? fechaPorVuelo.get(doc.expiry_anchor_flight_id)
                        : ultimoVuelo
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 shrink-0">
              <span
                className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border whitespace-nowrap ${TONE_STYLES[status.tone]}`}
              >
                {status.label}
              </span>

              <div className="shrink-0 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(doc)}
                  aria-label={`Editar ${doc.name}`}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={pending && busyId === doc.id}
                  onClick={() => remove(doc)}
                  aria-label={`Borrar ${doc.name}`}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {pending && busyId === doc.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <DocumentForm
          presetKind={presetKind}
          vuelos={vuelosOrdenados}
          onCancel={closeForm}
          onDone={closeForm}
          onError={setError}
        />
      ) : (
        <div className="space-y-3">
          {/* Quick-add chips. Most documents a pilot loads are the same handful,
              and picking the category from a six-entry listbox every time is the
              slow half of the job. A chip opens the form with the category —
              and a sensible default name — already filled in. */}
          <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2 w-max pb-1">
              {QUICK_ADD.map((quick) => (
                <button
                  key={quick.name}
                  type="button"
                  onClick={() => openQuickAdd(quick.kind)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap bg-white dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  {quick.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => openQuickAdd(null)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-white/30 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Otro documento
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentForm({
  document: doc,
  presetKind,
  vuelos = [],
  onCancel,
  onDone,
  onError,
}: {
  document?: PilotDocument;
  /** Los vuelos, del más reciente al más viejo. Ver `DocumentsManager`. */
  vuelos?: Flight[];
  /** Set when a quick-add chip opened this form. */
  presetKind?: DocumentKind | null;
  onCancel: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [kind, setKind] = useState<string>(doc?.kind ?? presetKind ?? "otro");
  // Default "nada": un documento no condiciona el vuelo salvo que el piloto lo
  // pida. Cambiar eso haría que cargar un curso vencido apagara el semáforo sin
  // que nadie lo haya decidido.
  const [blocking, setBlocking] = useState<string>(doc?.blocking ?? "nada");
  // Un select de tres y no una casilla de "no vence".
  //
  // Empezó siendo esa casilla, por un motivo que sigue valiendo: un
  // <input type="date"> con valor no se puede vaciar de forma confiable —en varios
  // navegadores no hay forma, y en el teléfono el picker no ofrece "ninguna"—, así
  // que "dejalo en blanco" era pedir algo que el control no permite, y encima nadie
  // lo adivinaba. Con la migración 011 aparece un tercer caso —la fecha la calcula
  // el backend desde el último vuelo— y tres estados no entran en una casilla.
  const [modo, setModo] = useState<ModoVencimiento>(modoDe(doc));
  const [offset, setOffset] = useState<string>(String(doc?.expiry_offset_days ?? 60));
  const [unidad, setUnidad] = useState<OffsetUnit>(doc?.expiry_offset_unit ?? "dias");
  const [ancla, setAncla] = useState<string>(
    doc?.expiry_anchor_flight_id ?? vuelos[0]?.id ?? ""
  );

  const ultimoVuelo = vuelos[0]?.date ?? null;
  const fechaAncla = vuelos.find((f) => f.id === ancla)?.date ?? null;
  const cantidad = Number(offset) || 0;
  const presetName = presetKind ? QUICK_ADD.find((q) => q.kind === presetKind)?.name : undefined;
  const [pending, startTransition] = useTransition();
  const { notificar } = useAvisos();

  const submit = (formData: FormData) => {
    onError(null);
    startTransition(async () => {
      const result = doc ? await updateDocument(doc.id, formData) : await createDocument(formData);
      if (result?.error) {
        onError(result.error);
        return;
      }
      notificar({
        tipo: "exito",
        titulo: doc ? "Documento guardado" : "Documento agregado",
        detalle: `Se guardó "${formData.get("name")}" correctamente.`
      });
      onDone();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
      className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-zinc-900/20 dark:border-white/20 shadow-cal dark:shadow-none p-5 md:p-6 space-y-5"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
          {doc ? "Editar documento" : "Nuevo documento"}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
            Tipo
          </label>
          <StyledSelect name="kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
        </div>

        <div>
          <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
            Nombre
          </label>
          <input
            name="name"
            required
            defaultValue={doc?.name ?? presetName ?? ""}
            placeholder="ej. Certificado Médico Aeronáutico"
            className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
            Cuándo vence
          </label>
          {/* El modo viaja como campo del form: la server action lo lee para armar
              el trío regla/offset/fecha de una sola vez. Ver `parseVencimiento`. */}
          <StyledSelect
            name="expiry_mode"
            value={modo}
            onChange={(v) => setModo(v as ModoVencimiento)}
            options={MODO_OPTIONS}
          />

          {modo === "fecha" && (
            <input
              name="expiry_date"
              type="date"
              required
              defaultValue={doc?.expiry_date ?? ""}
              className="mt-3 w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors [color-scheme:light] dark:[color-scheme:dark]"
            />
          )}

          {(modo === "ultimo_vuelo" || modo === "vuelo_ancla") && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  name="expiry_offset_days"
                  type="number"
                  min={1}
                  max={MAX_OFFSET[unidad]}
                  required
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  aria-label="Cantidad"
                  className="w-20 bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-semibold data text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors"
                />
                <div className="w-28">
                  <StyledSelect
                    name="expiry_offset_unit"
                    value={unidad}
                    onChange={(v) => setUnidad(v as OffsetUnit)}
                    options={UNIDAD_OPTIONS}
                  />
                </div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {modo === "ultimo_vuelo" ? "después de tu último vuelo" : "después de:"}
                </span>
              </div>

              {modo === "vuelo_ancla" &&
                (vuelos.length === 0 ? (
                  // Sin vuelos no hay ancla que elegir, y ofrecer un select vacío es
                  // ofrecer un callejón sin salida.
                  <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                    No tenés vuelos cargados todavía, así que no hay desde cuál contar.
                    Cargá el vuelo primero y volvé.
                  </p>
                ) : (
                  <StyledSelect
                    name="expiry_anchor_flight_id"
                    value={ancla}
                    onChange={setAncla}
                    options={vuelos.map((f) => ({
                      value: f.id,
                      label: `${f.date} · ${f.route || "sin ruta"}`,
                    }))}
                  />
                ))}

              {/*
                Los dos textos dicen cosas opuestas y eso es el punto. Con el último
                vuelo, volar **corre** la fecha —al revés que todos los otros
                vencimientos de Vector, donde lo único que ayuda es un trámite—. Con
                un vuelo puntual, no la mueve nada. Una vez guardado, esta línea es la
                única diferencia visible entre los dos modos, y confundirlos es creer
                que estás cubierto cuando no.
              */}
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {modo === "ultimo_vuelo"
                  ? ayudaRegla(cantidad, ultimoVuelo, unidad)
                  : ayudaAncla(cantidad, fechaAncla, unidad)}
              </p>
            </div>
          )}
        </div>

        {/*
          Los dos campos que sólo tienen sentido si el documento vence. "Si vence"
          describe qué pasa al vencer y "Avisar a los (días)" cuándo avisar: en un
          documento que no caduca, ninguno de los dos se va a evaluar nunca.
          Dejarlos a la vista sugiere que hacen algo.
        */}
        {modo !== "no_vence" && (
          <>
            <div>
              <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                Si vence
              </label>
              <StyledSelect
                name="blocking"
                value={blocking}
                onChange={setBlocking}
                options={[
                  { value: "nada", label: "Sólo avisame" },
                  { value: "pasajeros", label: "No puedo llevar pasajeros" },
                  { value: "solo", label: "Sólo puedo volar con instructor" },
                  { value: "vuelo", label: "No puedo volar" },
                ]}
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                Avisar a los (días)
              </label>
              <input
                name="alert_days"
                defaultValue={(doc?.alert_days ?? [60, 30, 7]).join(", ")}
                placeholder="60, 30, 7"
                className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
              />
            </div>
          </>
        )}
      </div>

      <div>
        <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
          Nota (opcional)
        </label>
        <input
          name="notes"
          defaultValue={doc?.notes ?? ""}
          placeholder="ej. Clase 2, Dr. Pérez"
          className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold transition-opacity disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
          {doc ? "Guardar cambios" : "Agregar"}
        </button>
        <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          Si tenés WhatsApp configurado, el aviso llega por ahí.
        </p>
      </div>
    </form>
  );
}
