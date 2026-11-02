"use client";

import { useTransition, useState } from "react";
import { Plus } from "lucide-react";
import { createFlightPack } from "@/actions/flight-pack";
import { LoadingButton } from "@/components/LoadingButton";
import { Aircraft } from "@/types";

interface FlightPackFormProps {
  aircraft: Aircraft[];
}

export default function FlightPackForm({ aircraft }: FlightPackFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createFlightPack(formData);
        // On success, the form will be revalidated by the server action
      } catch (e: any) {
        setError(e.message || "Error al crear el pack de horas");
      }
    });
  }

  return (
    <div className="bg-white dark:bg-white/[0.02] p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none hover:shadow-lg dark:hover:bg-white/[0.04] transition-all space-y-6 md:space-y-8">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center shadow-lg">
          <Plus className="w-4 h-4 text-white dark:text-zinc-900" />
        </div>
        <h4 className="text-sm md:text-base font-semibold text-zinc-900 dark:text-white">Cargar nuevo pack</h4>
      </div>
      
      <form action={handleSubmit} className="space-y-6">
        {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-red-600 dark:text-red-500 text-sm font-medium">
                {error}
            </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 group">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Nombre del pack</label>
            <input 
              name="name" 
              placeholder="ej. Pack 50h Cessna" 
              required 
              className="w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all font-bold placeholder:text-zinc-400 dark:placeholder:text-zinc-600" 
            />
          </div>
          <div className="space-y-2 group">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Total de horas</label>
            <input 
              name="total_hours" 
              type="number"
              step="0.1"
              placeholder="ej. 50" 
              required 
              className="w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all font-bold placeholder:text-zinc-400 dark:placeholder:text-zinc-600" 
            />
          </div>
          <div className="space-y-2 group">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">Fecha de inicio</label>
            <input 
              name="start_date" 
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
              required 
              className="w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-4 px-5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all font-bold [color-scheme:light] dark:[color-scheme:dark]" 
            />
          </div>
          <div className="space-y-2 md:col-span-2 group">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Aeronaves válidas</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              {aircraft.map(ac => (
                <label key={ac.id} className="flex items-center space-x-3 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 p-4 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-all">
                  <input 
                    type="checkbox" 
                    name="aircraft_ids" 
                    value={ac.id} 
                    className="w-5 h-5 rounded border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-aviation-cyan focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white uppercase">{ac.registration}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        
        <LoadingButton 
          isLoading={isPending}
          type="submit" 
          className="w-full md:w-auto bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 font-semibold text-sm py-5 px-10 rounded-2xl transition-all shadow-cal-highlight dark:shadow-xl"
        >
          Cargar pack
        </LoadingButton>
      </form>
    </div>
  );
}
