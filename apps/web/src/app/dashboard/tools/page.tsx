import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import ToolsClient from "@/components/dashboard/tools/ToolsClient";
import { PREGUNTAS } from "@/lib/examen-ppa";

export const metadata = {
  title: "Herramientas | Vector",
};

export default function ToolsPage() {
  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <PageHeader eyebrow="Calculadoras de cabina y piernera" title="Herramientas" />
      {/* La práctica del examen de PPA es una guía pública (`/guias/examen-ppa`): se usa sin
          cuenta. Desde acá se llega a ella. */}
      <Link
        href="/guias/examen-ppa"
        className="flex items-center gap-4 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors max-w-2xl"
      >
        <span className="w-11 h-11 rounded-2xl bg-aviation-blue/10 text-aviation-blue dark:text-aviation-cyan flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-zinc-900 dark:text-white">Practicá el examen de Piloto Privado</span>
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">{PREGUNTAS.length} preguntas del banco de ANAC, por materia, con su respuesta y sus figuras.</span>
        </span>
        <ArrowRight className="w-4 h-4 text-zinc-400" />
      </Link>
      <ToolsClient />
    </div>
  );
}
