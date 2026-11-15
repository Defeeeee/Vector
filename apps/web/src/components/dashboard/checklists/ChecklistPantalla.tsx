"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { asignarAvionesAChecklist, borrarChecklist, guardarChecklist } from "@/actions/checklists";
import { parsearChecklist, validarChecklist } from "@/lib/checklist";
import { ayuda, campo, peligro, principal, rotulo, secundario } from "@/components/dashboard/firmas/comun";
import UsarChecklist from "./UsarChecklist";

interface AvionBreve {
  id: string;
  registration: string;
  type: string;
  checklist_id: string | null;
}

interface Props {
  checklist: { id: string; nombre: string; texto: string };
  aviones: AvionBreve[];
  editarAlEntrar: boolean;
}

const FORMATO = `# Antes del despegue
- Frenos: PUESTOS
- Mezcla: RICA
  - Sub-paso con sangría (A., B., C.)
> Una nota, sin tilde`;

/** Una checklist: se usa (lo que importa) o se edita. */
export default function ChecklistPantalla({ checklist, aviones, editarAlEntrar }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(editarAlEntrar);
  const [nombre, setNombre] = useState(checklist.nombre);
  const [texto, setTexto] = useState(checklist.texto);
  const [asignados, setAsignados] = useState<Set<string>>(new Set(aviones.filter((a) => a.checklist_id === checklist.id).map((a) => a.id)));
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const motivo = validarChecklist(nombre, texto);
  const pasos = useMemo(() => parsearChecklist(texto).secciones.reduce((n, s) => n + s.elementos.filter((e) => e.tipo === "paso").length, 0), [texto]);
  const matriculas = aviones.filter((a) => asignados.has(a.id)).map((a) => a.registration);

  function alternarAvion(id: string) {
    const nuevo = new Set(asignados);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    setAsignados(nuevo);
  }

  function guardar() {
    setMensaje(null);
    empezar(async () => {
      const g = await guardarChecklist(checklist.id, nombre, texto);
      if ("error" in g) return setMensaje({ tipo: "error", texto: g.error });
      const a = await asignarAvionesAChecklist(checklist.id, [...asignados]);
      if ("error" in a) return setMensaje({ tipo: "error", texto: `Se guardó la checklist, pero ${a.error.toLowerCase()}` });
      setMensaje({ tipo: "ok", texto: "Guardada." });
      setEditando(false);
      router.refresh();
    });
  }

  function borrar() {
    if (!window.confirm(`¿Borrar la checklist «${checklist.nombre}»? Los aviones que la tenían quedan sin checklist.`)) return;
    setMensaje(null);
    empezar(async () => {
      const r = await borrarChecklist(checklist.id);
      if ("error" in r) setMensaje({ tipo: "error", texto: r.error });
      else router.push("/dashboard/tools/checklists");
    });
  }

  if (!editando) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {matriculas.length ? matriculas.join(" · ") : "Sin avión asignado"}
          </p>
          <button type="button" onClick={() => setEditando(true)} className={`${secundario} gap-2`}>
            <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
          </button>
        </div>
        <UsarChecklist id={checklist.id} texto={checklist.texto} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2 border-t border-white/10 pt-8 max-w-xl">
        <label htmlFor="nombre-checklist" className={rotulo}>Nombre</label>
        <input id="nombre-checklist" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className={campo} />
      </section>

      <section className="space-y-3 border-t border-white/10 pt-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-3 min-w-0">
            <label htmlFor="texto-checklist" className={rotulo}>Texto de la checklist</label>
            <textarea
              id="texto-checklist"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              spellCheck={false}
              rows={18}
              placeholder="Pegá o escribí la checklist, tal cual está en tu papel."
              className={`${campo} font-mono text-sm leading-relaxed min-h-[22rem] resize-y`}
            />
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">Formato</p>
              <pre className="font-mono text-xs text-zinc-400 whitespace-pre-wrap border-l-2 border-white/10 pl-3">{FORMATO}</pre>
              <p className={ayuda}>
                <code># Título</code> abre una sección; <code>- texto</code> es un paso (<code>Etiqueta: valor</code> separa la
                etiqueta del valor); una línea con sangría que empieza con <code>- </code> es un sub-paso; <code>&gt; texto</code> es una nota.
                Lo que escribas antes del primer <code>#</code> es una introducción.
              </p>
            </div>
          </div>
          <div className="space-y-3 min-w-0">
            <p className={rotulo}>Vista previa · {pasos} {pasos === 1 ? "paso" : "pasos"}</p>
            <div className="lg:max-h-[40rem] lg:overflow-y-auto lg:pr-2 custom-scrollbar">
              {texto.trim() ? <UsarChecklist id={checklist.id} texto={texto} vistaPrevia /> : <p className="text-sm text-zinc-500">Acá se ve cómo queda a medida que escribís.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-white/10 pt-8">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-aviation-cyan">Aviones con esta checklist</h3>
        {aviones.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenés aviones en el Hangar. Cargalos en Ajustes para asignarles la checklist.</p>
        ) : (
          <ul className="divide-y divide-white/10 border-y border-white/10 max-w-xl">
            {aviones.map((a) => {
              const otra = a.checklist_id && a.checklist_id !== checklist.id;
              return (
                <li key={a.id}>
                  <label className="flex items-center gap-3 min-h-14 py-2 cursor-pointer">
                    <input type="checkbox" checked={asignados.has(a.id)} onChange={() => alternarAvion(a.id)} className="w-5 h-5 accent-aviation-cyan shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold uppercase text-zinc-900 dark:text-white">{a.registration}</span>
                      <span className="block text-xs text-zinc-500 truncate">{a.type}</span>
                    </span>
                    {otra && asignados.has(a.id) && <span className="text-xs text-amber-400 shrink-0">Reemplaza a la que tiene</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 border-t border-white/10 pt-8">
        {motivo && <p role="alert" className="text-sm text-amber-400">{motivo}</p>}
        {mensaje && <p role={mensaje.tipo === "error" ? "alert" : "status"} className={`text-sm ${mensaje.tipo === "error" ? "text-red-400" : "text-aviation-cyan"}`}>{mensaje.texto}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={guardar} disabled={pendiente || !!motivo} className={principal}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setNombre(checklist.nombre);
              setTexto(checklist.texto);
              setAsignados(new Set(aviones.filter((a) => a.checklist_id === checklist.id).map((a) => a.id)));
              setMensaje(null);
            }}
            disabled={pendiente}
            className={secundario}
          >
            Cancelar
          </button>
          <span className="flex-1" />
          <button type="button" onClick={borrar} disabled={pendiente} className={peligro}>
            Borrar la checklist
          </button>
        </div>
      </section>
    </div>
  );
}
