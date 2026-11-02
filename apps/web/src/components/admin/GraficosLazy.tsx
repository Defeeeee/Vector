"use client";

import dynamic from "next/dynamic";

// recharts es pesado: va en su propio chunk y sin render en el server, como en el Resumen.
const cargando = (alto: number) =>
  function Cargando() {
    return <div className="w-full bg-zinc-100 dark:bg-white/5 rounded-2xl animate-pulse" style={{ height: alto }} />;
  };

export const GraficoAltas = dynamic(() => import("./Graficos").then((m) => m.GraficoAltas), { ssr: false, loading: cargando(280) });
export const GraficoBarras = dynamic(() => import("./Graficos").then((m) => m.GraficoBarras), { ssr: false, loading: cargando(220) });
export const GraficoVuelosPorMes = dynamic(() => import("./Graficos").then((m) => m.GraficoVuelosPorMes), { ssr: false, loading: cargando(260) });
export const GraficoLicencias = dynamic(() => import("./Graficos").then((m) => m.GraficoLicencias), { ssr: false, loading: cargando(180) });
export const GraficoMailsPorDia = dynamic(() => import("./Graficos").then((m) => m.GraficoMailsPorDia), { ssr: false, loading: cargando(260) });
export const GraficoHoras = dynamic(() => import("./Graficos").then((m) => m.GraficoHoras), { ssr: false, loading: cargando(220) });
