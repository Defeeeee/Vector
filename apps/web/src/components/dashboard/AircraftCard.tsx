"use client";

import { Aircraft } from "@/types";
import { updateAircraft, deleteAircraft } from "@/actions/flight";
import { Plane, MonitorPlay, Edit2, Trash2, X, Check, Loader2, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import CamposPerformance from "./CamposPerformance";
import CampoSimulador from "./CampoSimulador";
import CampoPotencia from "./CampoPotencia";
import { useAvisos } from "./Avisos";
import PerfilPlanAvion from "./plan-de-vuelo/PerfilPlanAvion";

interface AircraftCardProps {
  aircraft: Aircraft;
}

export default function AircraftCard({ aircraft }: AircraftCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { notificar } = useAvisos();

  async function handleUpdate(formData: FormData) {
    startTransition(async () => {
      const result = await updateAircraft(formData);
      if (result?.error) {
        notificar({ tipo: "error", titulo: "Error", detalle: result.error });
      } else {
        notificar({ tipo: "exito", titulo: "Aeronave guardada", detalle: "Los cambios se guardaron correctamente." });
        setIsEditing(false);
      }
    });
  }

  async function handleDelete() {
    if (confirm("¿Estás seguro de eliminar esta aeronave?")) {
      startTransition(async () => {
        const result = await deleteAircraft(aircraft.id);
        if (result?.error) {
          notificar({ tipo: "error", titulo: "Error", detalle: result.error });
        } else {
          notificar({ tipo: "exito", titulo: "Aeronave eliminada", detalle: "La aeronave fue eliminada del hangar." });
        }
      });
    }
  }

  if (isEditing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2rem] p-6 md:p-8 space-y-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Editar aeronave</h3>
          <button onClick={() => setIsEditing(false)} className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm">
            <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>

        <form action={handleUpdate} className="space-y-8">
          <input type="hidden" name="id" value={aircraft.id} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <EditField label="Matrícula">
              <input name="registration" defaultValue={aircraft.registration} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all uppercase" />
            </EditField>

            <EditField label="Tipo OACI">
              <input name="icao" defaultValue={aircraft.icao} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all uppercase" />
            </EditField>

            <EditField label="Marca y modelo">
              <input name="type" defaultValue={aircraft.type} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all uppercase" />
            </EditField>

            <EditField label="Categoría (ANAC)">
              <div className="relative">
                <select
                  name="type_acft"
                  defaultValue={aircraft.type_acft}
                  className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all uppercase appearance-none"
                >
                  <option value="MONT-T" className="dark:bg-zinc-900">MONT-T (Monomotor Terrestre)</option>
                  <option value="MULT-T" className="dark:bg-zinc-900">MULT-T (Multimotor Terrestre)</option>
                  <option value="MONT-H" className="dark:bg-zinc-900">MONT-H (Monomotor Hidroavión)</option>
                  <option value="MULT-H" className="dark:bg-zinc-900">MULT-H (Multimotor Hidroavión)</option>
                </select>
                <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 rotate-90 pointer-events-none" />
              </div>
            </EditField>

            <CampoPotencia
              valor={aircraft.potencia_hp}
              claseLabel="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors"
              claseInput="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all"
            />
          </div>

          <div className="pt-2 border-t border-zinc-200 dark:border-white/10">
            <div className="pt-6">
              <CampoSimulador
                aeronave={aircraft}
                claseLabel="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
              />
            </div>
            <div className="pt-6">
              <CamposPerformance
                aeronave={aircraft}
                claseLabel="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 ml-1"
                claseInput="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-6">
            <button
              disabled={isPending}
              type="submit"
              className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-12 py-5 rounded-full shadow-cal-highlight dark:shadow-none transition-all active:scale-[0.95] flex items-center space-x-2"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Guardar cambios</span>
            </button>
          </div>
        </form>
      </motion.div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-5 hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-md dark:hover:bg-white/[0.04] transition-all group flex flex-col gap-4">
      <div className="flex items-start justify-between">
        {/* Otro ícono, no un cartelito al costado: en una grilla de tarjetas es lo
            primero que se ve, y confundir el simulador con el avión al cargar un vuelo
            es exactamente el error que esta marca existe para evitar. */}
        <div className="w-11 h-11 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-500">
          {aircraft.is_simulator ? (
            <MonitorPlay className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <Plane className="w-5 h-5" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-full transition-all"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 rounded-full transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <p className="font-bold font-display text-xl text-zinc-900 dark:text-white tracking-tight uppercase truncate">{aircraft.registration}</p>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs font-medium truncate mt-0.5">
          {aircraft.is_simulator && (
            <>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                Simulador
              </span>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">/</span>
            </>
          )}
          {aircraft.type}
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">/</span>
          {aircraft.icao}
          {aircraft.type_acft && (
            <>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">/</span>
              {aircraft.type_acft}
            </>
          )}
        </p>

        {/* Sólo si hay algo que mostrar. Una fila de guiones no informa: el que no
            cargó performance ya lo sabe, y la tarjeta queda más limpia sin ella. */}
        {(aircraft.potencia_hp || aircraft.cruise_tas_kt || aircraft.fuel_burn_lph || aircraft.fuel_capacity_l) && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {aircraft.potencia_hp && <span>{aircraft.potencia_hp} HP</span>}
            {aircraft.cruise_tas_kt && <span>{aircraft.cruise_tas_kt} kt</span>}
            {aircraft.fuel_burn_lph && <span>{aircraft.fuel_burn_lph} L/h</span>}
            {aircraft.fuel_capacity_l && <span>{aircraft.fuel_capacity_l} L</span>}
          </p>
        )}

        {!aircraft.is_simulator && <PerfilPlanAvion aircraftId={aircraft.id} perfil={aircraft.plan_vuelo ?? null} />}
      </div>
    </div>
  );
}

function EditField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2 group">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">{label}</label>
      {children}
    </div>
  );
}
