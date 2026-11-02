"use client";

import { FlightPack, Aircraft } from "@/types";
import { updateFlightPack, deleteFlightPack } from "@/actions/flight-pack";
import { Clock, Edit2, Trash2, X, Check, Loader2, ChevronRight, Package } from "lucide-react";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FlightPackCardProps {
  pack: FlightPack;
  aircraft: Aircraft[];
}

export default function FlightPackCard({ pack, aircraft }: FlightPackCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleUpdate(formData: FormData) {
    startTransition(async () => {
      try {
        await updateFlightPack(formData);
        setIsEditing(false);
      } catch (error: any) {
        alert(error.message);
      }
    });
  }

  async function handleDelete() {
    if (confirm("¿Estás seguro de eliminar este pack de horas?")) {
      startTransition(async () => {
        try {
          await deleteFlightPack(pack.id);
        } catch (error: any) {
          alert(error.message);
        }
      });
    }
  }

  const selectedAircraft = aircraft.filter(a => pack.aircraft_ids.includes(a.id));

  return (
    <div className={`transition-all duration-500 ${isEditing ? 'py-4' : 'py-0'}`}>
      <div className={`bg-white dark:bg-white/[0.02] border transition-all duration-500 overflow-hidden ${isEditing ? 'rounded-3xl md:rounded-[2.5rem] border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none bg-zinc-50 dark:bg-transparent p-6 md:p-10' : 'rounded-none border-transparent border-b-zinc-200 dark:border-b-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.04] p-4 md:p-8'}`}>
        {!isEditing ? (
          <div className="flex items-center justify-between group">
            <div className="flex items-center space-x-4 md:space-x-8">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 duration-500 flex-shrink-0">
                <Package className="w-5 h-5 md:w-6 md:h-6" strokeWidth={1.5} />
              </div>
              <div className="space-y-1 overflow-hidden">
                <div className="flex items-center space-x-2 md:space-x-3">
                  <p className="font-bold font-display text-xl md:text-3xl text-zinc-900 dark:text-white tracking-tight truncate">{pack.name}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pack.is_active ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-500' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10'}`}>
                    {pack.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium truncate">
                  <span className={pack.remaining_hours < 0 ? "text-red-600 dark:text-red-500" : ""}>{pack.remaining_hours.toFixed(1)}h</span> / {pack.total_hours}h 
                  <span className="mx-1 md:mx-2 text-zinc-300 dark:text-zinc-700">/</span> 
                  {selectedAircraft.length} aeronaves
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 md:space-x-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all transform translate-x-0 md:translate-x-4 md:group-hover:translate-x-0">
              <button 
                onClick={() => setIsEditing(true)}
                className="p-2 md:p-3 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-full transition-all"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={handleDelete}
                className="p-2 md:p-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded-full transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 md:space-y-10"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl md:text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Editar pack de horas</h3>
              <button onClick={() => setIsEditing(false)} className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm">
                <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </button>
            </div>

            <form action={handleUpdate} className="space-y-8 md:space-y-10">
              <input type="hidden" name="id" value={pack.id} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <EditField label="Nombre del pack">
                  <input name="name" defaultValue={pack.name} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all" />
                </EditField>
                
                <EditField label="Horas totales">
                  <input name="total_hours" type="number" step="0.1" defaultValue={pack.total_hours} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all" />
                </EditField>

                <EditField label="Fecha de inicio">
                  <input name="start_date" type="date" defaultValue={pack.start_date.split('T')[0]} required className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all [color-scheme:light] dark:[color-scheme:dark]" />
                </EditField>

                <EditField label="Estado">
                  <div className="relative">
                    <select 
                      name="is_active" 
                      defaultValue={pack.is_active ? "true" : "false"}
                      className="w-full bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all appearance-none"
                    >
                      <option value="true" className="dark:bg-zinc-900">Activo</option>
                      <option value="false" className="dark:bg-zinc-900">Inactivo</option>
                    </select>
                    <ChevronRight className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 rotate-90 pointer-events-none" />
                  </div>
                </EditField>

                <EditField label="Aeronaves válidas">
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {aircraft.map(ac => (
                      <label key={ac.id} className="flex items-center space-x-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          name="aircraft_ids" 
                          value={ac.id} 
                          defaultChecked={pack.aircraft_ids.includes(ac.id)}
                          className="w-4 h-4 rounded border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-zinc-300 focus:ring-0 focus:ring-offset-0"
                        />
                        <span>{ac.registration}</span>
                      </label>
                    ))}
                  </div>
                </EditField>
              </div>

              <div className="flex items-center justify-end pt-4">
                <button 
                  disabled={isPending}
                  type="submit"
                  className="w-full md:w-auto bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-10 md:px-12 py-4 md:py-5 rounded-full shadow-cal-highlight dark:shadow-none transition-all active:scale-[0.95] flex items-center justify-center space-x-2"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Guardar cambios</span>
                </button>
              </div>
            </form>
          </motion.div>
        )}
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
