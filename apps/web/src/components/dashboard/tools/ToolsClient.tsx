"use client";

import { useState } from "react";
import { Cloud, ClipboardList, Fuel, Gauge, Ruler, TrendingDown, Wind } from "lucide-react";
import UnitConverter from "./UnitConverter";
import FuelCalculator from "./FuelCalculator";
import WindCalculator from "./WindCalculator";
import AltitudeCalculator from "./AltitudeCalculator";
import CloudBaseCalculator from "./CloudBaseCalculator";
import GlideCalculator from "./GlideCalculator";
import Kneeboard from "./Kneeboard";

/**
 * Toolbox shell.
 *
 * One tool visible at a time rather than a wall of seven cards: each calculator
 * carries five or six inputs, and stacked together they'd bury the one being
 * used under a page of unrelated fields on a phone — which is exactly where this
 * gets opened, strapped to a leg.
 *
 * State per tool is deliberately kept inside each component, so switching tabs
 * unmounts and resets it. The alternative (lifting it up to survive the switch)
 * would mean a pilot returning to a calculator finds numbers from an hour ago
 * still sitting there, which is worse than a clean sheet.
 */

const TOOLS = [
  { id: "conversor", label: "Conversor", icon: Ruler, description: "Unidades de distancia, velocidad, peso, volumen, presión y temperatura" },
  { id: "combustible", label: "Combustible", icon: Fuel, description: "Autonomía, alcance y combustible necesario para la etapa" },
  { id: "viento", label: "Viento", icon: Wind, description: "Componentes de frente y cruzado, corrección de deriva y velocidad de suelo" },
  { id: "altitud", label: "Altitud", icon: Gauge, description: "Altitud de presión, de densidad y desvío respecto de ISA" },
  { id: "nubes", label: "Base de nubes", icon: Cloud, description: "Altura estimada de la base convectiva a partir del spread" },
  { id: "planeo", label: "Planeo", icon: TrendingDown, description: "Alcance en planeo y si llegás al campo elegido" },
  { id: "piernera", label: "Piernera", icon: ClipboardList, description: "Cronómetros de cabina y bloc de notas, guardados en este dispositivo" },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

export default function ToolsClient() {
  const [active, setActive] = useState<ToolId>("conversor");
  const tool = TOOLS.find((t) => t.id === active)!;

  return (
    <div className="space-y-6">
      {/* Horizontal scroller so all seven stay reachable on a phone without
          wrapping into a three-row block that pushes the tool off-screen. */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 w-max pb-1">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap border transition-colors ${
                  isActive
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
                    : "bg-white dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-white/[0.02] rounded-[2rem] md:rounded-[2.5rem] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none p-6 md:p-10">
        <div className="mb-6 md:mb-8">
          <h3 className="text-lg md:text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">
            {tool.label}
          </h3>
          <p className="mt-1 text-xs md:text-sm font-medium text-zinc-500 dark:text-zinc-400">{tool.description}</p>
        </div>

        {active === "conversor" && <UnitConverter />}
        {active === "combustible" && <FuelCalculator />}
        {active === "viento" && <WindCalculator />}
        {active === "altitud" && <AltitudeCalculator />}
        {active === "nubes" && <CloudBaseCalculator />}
        {active === "planeo" && <GlideCalculator />}
        {active === "piernera" && <Kneeboard />}
      </div>
    </div>
  );
}
