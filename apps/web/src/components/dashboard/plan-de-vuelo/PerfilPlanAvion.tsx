"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, FileText, Loader2 } from "lucide-react";
import { guardarPerfilAvion } from "@/actions/plan-de-vuelo";
import type { PerfilAvionPlan } from "@/lib/formulario-plan";

/**
 * Lo fijo de un avión para el plan de vuelo, en el Hangar (`aircraft.plan_vuelo`,
 * migración 024): se carga una vez y cada plan con este avión sale casi entero. Es lo
 * que le ahorra tiempo a Federico en FPL.AR.
 */
export default function PerfilPlanAvion({ aircraftId, perfil }: { aircraftId: string; perfil: PerfilAvionPlan | null }) {
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState<PerfilAvionPlan>({ estela: "L", elt: true, ...(perfil ?? {}) });
  const [estado, setEstado] = useState<"" | "listo" | "error">("");
  const [pendiente, startTransition] = useTransition();

  const campo = (clave: keyof PerfilAvionPlan, etiqueta: string, placeholder: string, mayus = true) => (
    <label className="block">
      <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">{etiqueta}</span>
      <input
        value={(p[clave] as string | undefined) ?? ""}
        onChange={(e) => setP({ ...p, [clave]: mayus ? e.target.value.toUpperCase() : e.target.value })}
        placeholder={placeholder}
        className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white py-1.5 text-sm font-bold text-zinc-900 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 placeholder:font-medium"
      />
    </label>
  );

  const tilde = (clave: "elt" | "radioVhf" | "radioUhf", etiqueta: string) => (
    <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
      <input type="checkbox" checked={!!p[clave]} onChange={(e) => setP({ ...p, [clave]: e.target.checked })} className="w-4 h-4 accent-zinc-900 dark:accent-white" />
      {etiqueta}
    </label>
  );

  return (
    <div className="mt-3 border-t border-zinc-100 dark:border-white/5 pt-3">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="w-full flex items-center gap-2 text-left text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="flex-1">
          Plan de vuelo{" "}
          {perfil?.equipo ? <span className="data">· {perfil.equipo}/{perfil.vigilancia ?? "?"}</span> : <span>· sin cargar</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {campo("equipo", "Equipo (10a)", "SDGZ")}
            {campo("vigilancia", "Transponder (10b)", "C, EB2")}
            {campo("nav", "NAV/", "ABAS")}
            {campo("pbn", "PBN/", "Opcional")}
            {campo("opr", "Operador (OPR/)", "Escuela o aeroclub")}
            <label className="block">
              <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">PER/</span>
              <select
                value={p.per ?? ""}
                onChange={(e) => setP({ ...p, per: e.target.value })}
                className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-1.5 text-sm font-bold text-zinc-900 dark:text-white outline-none"
              >
                <option value="">—</option>
                <option value="A">A · menos de 91 kt</option>
                <option value="B">B · 91 a 120 kt</option>
              </select>
            </label>
          </div>
          {campo("colorMarcas", "Color y marcas (A/)", "Blanco y azul")}
          {campo("observacionFija", "Observación fija (va en N/ de cada plan)", "Opcional")}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tilde("elt", "ELT")}
            {tilde("radioVhf", "Radio de emergencia VHF")}
            {tilde("radioUhf", "UHF")}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                startTransition(async () => {
                  const r = await guardarPerfilAvion(aircraftId, p);
                  setEstado("error" in r ? "error" : "listo");
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : estado === "listo" ? <Check className="w-3.5 h-3.5" /> : null}
              {estado === "listo" ? "Guardado" : "Guardar"}
            </button>
            {estado === "error" && <span className="text-xs text-red-600">No se pudo guardar.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
