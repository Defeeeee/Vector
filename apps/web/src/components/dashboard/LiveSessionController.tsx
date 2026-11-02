"use client";

import { useState, useTransition, useEffect } from "react";
import { Aircraft } from "@/types";
import { toggleFlightSession } from "@/actions/flight";
import { Play, Square, Loader2, Plane } from "lucide-react";
import FlightLogModal from "./FlightLogModal";

interface LiveSessionControllerProps {
  aircraft: Aircraft[];
  activeSession: any;
}

export default function LiveSessionController({ aircraft, activeSession }: LiveSessionControllerProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedAircraft, setSelectedAircraft] = useState(activeSession?.session?.aircraft_id || "");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!activeSession?.active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession?.active]);

  async function handleToggle() {
    const isStopping = activeSession?.active;
    const formData = new FormData();
    if (!isStopping) {
      if (!selectedAircraft) {
        alert("Por favor, selecciona una aeronave para iniciar.");
        return;
      }
      formData.append("aircraft_id", selectedAircraft);
    }

    startTransition(async () => {
      try {
        const result = await toggleFlightSession(formData);

        if (isStopping && result) {
          const session = result.session || result;
          // Use ISO strings for reliable HH:mm formatting in UTC
          const takeoffTime = new Date(session.start_time).toISOString().split('T')[1].substring(0, 5);
          const landingTime = new Date(session.end_time || new Date()).toISOString().split('T')[1].substring(0, 5);
          const date = new Date(session.start_time).toISOString().split('T')[0];

          setModalData({
            aircraft_id: session.aircraft_id,
            route: session.route || "",
            takeoff: takeoffTime,
            landing: landingTime,
            date: date,
            landings: session.landings || 1,
            duration: session.flight_time ? session.flight_time.replace("hs", "") : undefined,
          });
          setIsModalOpen(true);
        }
      } catch (e) {
        alert("Error al gestionar la sesión de vuelo.");
      }
    });
  }

  const startTime = activeSession?.active ? new Date(activeSession.session.start_time).getTime() : null;
  const elapsedSec = mounted && startTime ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0;
  const hh = Math.floor(elapsedSec / 3600);
  const mm = Math.floor((elapsedSec % 3600) / 60);
  const ss = elapsedSec % 60;
  const secondHandDeg = (ss / 60) * 360;
  const minuteHandDeg = ((elapsedSec % 3600) / 3600) * 360;

  return (
    <>
      <div className="p-10 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none hover:shadow-lg dark:hover:bg-white/[0.04] transition-all rounded-[2.5rem] space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="eyebrow">Modo operativo</p>
            <h3 className="text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Vuelo en vivo</h3>
          </div>
          <div className={`w-3 h-3 rounded-full ${activeSession?.active ? 'bg-green-500 animate-pulse' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
        </div>

        {!activeSession?.active ? (
          <div className="space-y-6">
            <div className="relative group">
              <select
                value={selectedAircraft}
                onChange={(e) => setSelectedAircraft(e.target.value)}
                className="w-full bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-zinc-400 dark:focus:border-white/20 transition-all appearance-none shadow-sm cursor-pointer"
              >
                <option value="" disabled>Seleccionar aeronave...</option>
                {aircraft.map(ac => (
                  <option key={ac.id} value={ac.id} className="dark:bg-zinc-900">
                    {ac.registration} — {ac.type}
                  </option>
                ))}
              </select>
              <Plane className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
            </div>

            <button
              disabled={isPending}
              onClick={handleToggle}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 rounded-2xl shadow-cal-highlight dark:shadow-none flex items-center justify-center space-x-3 transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              <span>Iniciar cronómetro</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pilot chronograph — analog stopwatch tracking the live session */}
            <div className="flex flex-col items-center py-2">
              <div className="relative w-44 h-44 md:w-48 md:h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-0">
                  <circle cx="100" cy="100" r="96" fill="none" className="stroke-zinc-900 dark:stroke-white/10" strokeWidth="2" />
                  <circle cx="100" cy="100" r="80" className="fill-zinc-950 dark:fill-black" />

                  {/* Sub-dial: minutes within the hour */}
                  <circle cx="100" cy="60" r="22" fill="none" className="stroke-white/10" strokeWidth="1" />
                  <line
                    x1="100" y1="60" x2="100" y2="44"
                    stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"
                    style={{ transform: `rotate(${minuteHandDeg}deg)`, transformOrigin: "100px 60px" }}
                  />

                  {/* Tick marks */}
                  {Array.from({ length: 60 }).map((_, i) => {
                    const angle = (i * 6 * Math.PI) / 180;
                    const isMajor = i % 5 === 0;
                    const r1 = isMajor ? 68 : 73;
                    const r2 = 78;
                    const x1 = 100 + r1 * Math.sin(angle);
                    const y1 = 100 - r1 * Math.cos(angle);
                    const x2 = 100 + r2 * Math.sin(angle);
                    const y2 = 100 - r2 * Math.cos(angle);
                    return (
                      <line
                        key={i}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={isMajor ? "#ffffff" : "rgba(255,255,255,0.25)"}
                        strokeWidth={isMajor ? 2 : 1}
                      />
                    );
                  })}

                  {/* Sweeping second hand */}
                  <line
                    x1="100" y1="100" x2="100" y2="26"
                    stroke="#f4f4f5" strokeWidth="2" strokeLinecap="round"
                    style={{ transform: `rotate(${secondHandDeg}deg)`, transformOrigin: "100px 100px", transition: "transform 0.2s linear" }}
                  />
                  <circle cx="100" cy="100" r="5" fill="#38bdf8" />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
                  <span className="text-2xl md:text-3xl font-bold text-white data tracking-tight">
                    {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-medium text-zinc-500 mt-1">Tiempo de vuelo</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-zinc-50 dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-white/10 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Aeronave activa</p>
                <p className="text-lg font-bold font-display text-zinc-900 dark:text-white tracking-tighter uppercase">
                  {aircraft.find(a => a.id === activeSession.session.aircraft_id)?.registration || "Unknown"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Inicio (UTC)</p>
                <p className="text-lg font-bold font-display text-green-600 dark:text-green-500 tracking-tighter">
                  {new Date(activeSession.session.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                </p>
              </div>
            </div>

            <button
              disabled={isPending}
              onClick={handleToggle}
              className="w-full bg-red-600 text-white font-semibold text-sm py-5 rounded-2xl shadow-lg flex items-center justify-center space-x-3 transition-all hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
              <span>Finalizar y registrar</span>
            </button>
          </div>
        )}
      </div>

      <FlightLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        aircraft={aircraft}
        initialData={modalData}
      />
    </>
  );
}
