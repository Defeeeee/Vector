"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Pencil, Plus, Trash2, X, Loader2 } from "lucide-react";
import { Logbook } from "@/types";
import { RENGLONES_MAX, RENGLONES_MIN, RENGLONES_POR_HOJA, renglonesDeLaHoja } from "@/lib/libro-anac";
import {
  createLogbook,
  updateLogbook,
  deleteLogbook,
  OpeningBalanceInput,
} from "@/actions/logbook";
import OpeningBalanceFields, { openingTotal } from "./OpeningBalanceFields";
import { useAvisos } from "./Avisos";

function openingOf(book: Logbook): OpeningBalanceInput {
  return {
    landings: book.opening_landings,
    pic_day_loc: book.opening_pic_day_loc,
    pic_day_tra: book.opening_pic_day_tra,
    pic_night_loc: book.opening_pic_night_loc,
    pic_night_tra: book.opening_pic_night_tra,
    sic_day_loc: book.opening_sic_day_loc,
    sic_day_tra: book.opening_sic_day_tra,
    sic_night_loc: book.opening_sic_night_loc,
    sic_night_tra: book.opening_sic_night_tra,
    imc_pil: book.opening_imc_pil,
    imc_cop: book.opening_imc_cop,
    capota: book.opening_capota,
  };
}

export default function LogbooksManager({ logbooks }: { logbooks: Logbook[] }) {
  const [editing, setEditing] = useState<Logbook | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { notificar } = useAvisos();

  const handleDelete = (book: Logbook) => {
    setError(null);
    setBusyId(book.id);
    startTransition(async () => {
      const result = await deleteLogbook(book.id);
      if (result?.error) {
        setError(result.error);
      } else {
        notificar({ tipo: "exito", titulo: "Libro eliminado", detalle: `Se borró "${book.name}".` });
      }
      setBusyId(null);
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-500 bg-red-500/10 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none divide-y divide-zinc-100 dark:divide-white/5 overflow-hidden">
        {logbooks.length === 0 && (
          <p className="px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Todavía no tenés libros. Creá uno para empezar.
          </p>
        )}

        {logbooks.map((book) => {
          const total = openingTotal(openingOf(book));
          return (
            <div
              key={book.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 md:px-6 py-4"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {book.name}
                  </span>
                  {book.is_default && (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                      Por defecto
                    </span>
                  )}
                </p>
                {book.description && (
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {book.description}
                  </p>
                )}
                <p className="data text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                  {book.flight_count ?? 0} {book.flight_count === 1 ? "vuelo" : "vuelos"}
                  {total > 0 && <> · {total.toFixed(1)} hs de saldo inicial</>}
                  {renglonesDeLaHoja(book) !== RENGLONES_POR_HOJA && <> · {renglonesDeLaHoja(book)} renglones por hoja</>}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => { setError(null); setEditing(book); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                  aria-label={`Editar ${book.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(book)}
                  disabled={pending && busyId === book.id}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-500 transition-colors disabled:opacity-50"
                  aria-label={`Borrar ${book.name}`}
                >
                  {pending && busyId === book.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => { setError(null); setAdding(true); }}
        className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white hover:opacity-70 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        Agregar libro
      </button>

      {(adding || editing) && (
        <LogbookForm
          book={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function LogbookForm({
  book,
  onClose,
  onError,
}: {
  book: Logbook | null;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(book?.name ?? "");
  const [description, setDescription] = useState(book?.description ?? "");
  const [opening, setOpening] = useState<OpeningBalanceInput>(
    book ? openingOf(book) : {}
  );
  // Como texto mientras se escribe, por lo mismo que el saldo inicial.
  const [renglones, setRenglones] = useState(String(renglonesDeLaHoja(book)));
  const [pending, startTransition] = useTransition();
  const renglonesNum = Number(renglones);
  const renglonesValidos =
    Number.isInteger(renglonesNum) && renglonesNum >= RENGLONES_MIN && renglonesNum <= RENGLONES_MAX;


  const setField = (key: keyof OpeningBalanceInput, raw: string) => {
    // Stored as typed and parsed on submit: keeping a number in state makes
    // "1." or an empty field wipe itself mid-typing.
    setOpening((prev) => ({ ...prev, [key]: raw === "" ? undefined : Number(raw) }));
  };

  const { notificar } = useAvisos();

  const submit = () => {
    onError(null);
    startTransition(async () => {
      const payload = { name: name.trim(), description: description.trim(), opening, renglones_por_hoja: renglonesNum };
      const result = book
        ? await updateLogbook(book.id, payload)
        : await createLogbook(payload);
      if (result?.error) {
        onError(result.error);
      } else {
        notificar({
          tipo: "exito",
          titulo: book ? "Libro guardado" : "Libro creado",
          detalle: `Se guardó "${payload.name}" correctamente.`
        });
        onClose();
      }
    });
  };

  // Por portal: la página entra con una animación (`transform`), y un `fixed` adentro
  // queda atrapado debajo de la barra del teléfono, que tapaba el botón de guardar.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="absolute inset-0 bg-zinc-900/50 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full md:max-w-lg max-h-[92dvh] bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 rounded-t-[2rem] md:rounded-[2rem] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-display font-bold text-lg text-zinc-900 dark:text-white tracking-tight">
            {book ? "Editar libro" : "Nuevo libro"}
          </h3>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-6">
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Nombre
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi libro"
              className="w-full bg-transparent border-b border-zinc-200 dark:border-white/10 py-2 text-base font-semibold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Descripción
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="w-full bg-transparent border-b border-zinc-200 dark:border-white/10 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors"
            />
          </div>

          {/* El libro en PDF corta la hoja donde la corta el de papel: no todos los libros
              que se venden tienen los 15 renglones de la hoja de ANAC. */}
          <div className="space-y-1.5">
            <label
              htmlFor="renglones-por-hoja"
              className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
            >
              Renglones por hoja
            </label>
            <input
              id="renglones-por-hoja"
              value={renglones}
              onChange={(e) => setRenglones(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="w-24 bg-transparent border-b border-zinc-200 dark:border-white/10 py-2 text-base font-semibold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors data"
            />
            <p className={`text-[12px] ${renglonesValidos ? "text-zinc-400 dark:text-zinc-500" : "text-red-600 dark:text-red-400"}`}>
              {renglonesValidos
                ? "Los de una hoja de tu libro de papel. La de ANAC tiene 15. El libro en PDF corta la hoja igual."
                : `Entre ${RENGLONES_MIN} y ${RENGLONES_MAX}.`}
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-white/10">
            <p className="eyebrow">Saldo inicial</p>
            <OpeningBalanceFields opening={opening} setField={setField} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-200 dark:border-white/10 shrink-0">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !name.trim() || !renglonesValidos}
            className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold py-3.5 rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : book ? "Guardar" : "Crear libro"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
