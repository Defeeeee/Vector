"use client";

import { FlightPack } from "@/types";
import { Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface FlightPackWidgetProps {
  packs: FlightPack[];
}

export default function FlightPackWidget({ packs }: FlightPackWidgetProps) {
  if (!packs || packs.length === 0) return null;

  const activePacks = packs.filter(p => p.is_active);
  if (activePacks.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl md:text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Packs de horas</h3>
        <p className="eyebrow">Estado de saldo</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {activePacks.map((pack) => {
          const percentage = Math.max(0, Math.min(100, (pack.remaining_hours / pack.total_hours) * 100));
          const isDebt = pack.remaining_hours < 0;
          const isLow = percentage < 20 && !isDebt;

          return (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative flex bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 shadow-cal hover:shadow-lg dark:hover:bg-white/[0.04] transition-all rounded-3xl md:rounded-[2.5rem] overflow-hidden group"
            >
              {/* Main stub — like the body of a boarding pass */}
              <div className="flex-1 p-6 md:p-8 space-y-5 min-w-0">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0 ${isDebt ? 'bg-red-500 text-white shadow-lg' : isLow ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg'}`}>
                    {isDebt ? <AlertCircle className="w-5 h-5 animate-pulse" /> : isLow ? <AlertCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{isDebt ? 'Saldo deudor' : 'Paquete de vuelo'}</p>
                    <h3 className="font-bold font-display text-zinc-900 dark:text-white tracking-tight text-lg md:text-xl leading-none truncate">{pack.name}</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={`text-3xl md:text-4xl font-display font-bold tracking-tighter leading-none ${isDebt ? 'text-red-600' : 'text-zinc-900 dark:text-white'}`}>
                    {pack.remaining_hours.toFixed(1)}
                    <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500 ml-1">/ {pack.total_hours}h</span>
                  </p>

                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${isDebt ? 100 : percentage}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full rounded-full ${isDebt ? 'bg-red-600' : isLow ? 'bg-red-600 dark:bg-red-500' : 'bg-aviation-blue dark:bg-aviation-cyan'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Ticket stub — perforated tear line + percentage */}
              <div className="w-28 shrink-0 flex flex-col items-center justify-center gap-1.5 p-4 bg-zinc-50/70 dark:bg-white/[0.03] border-l border-dashed border-zinc-300 dark:border-white/15">
                <p className={`text-2xl font-display font-bold tracking-tighter ${isDebt ? 'text-red-600 animate-pulse' : isLow ? 'text-red-600 dark:text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                  {isDebt ? '—' : `${Math.round(percentage)}%`}
                </p>
                <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 text-center leading-tight">
                  {isDebt ? 'En deuda' : 'Disponible'}
                </p>
              </div>

              {/* Punch-hole notches on the tear line */}
              <span className="absolute -top-3 right-[6.75rem] w-6 h-6 rounded-full bg-zinc-50 dark:bg-black" />
              <span className="absolute -bottom-3 right-[6.75rem] w-6 h-6 rounded-full bg-zinc-50 dark:bg-black" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
