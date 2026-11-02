"use client";

import dynamic from "next/dynamic";

// recharts is heavy to parse/hydrate — split it into its own chunk and skip
// server rendering so it doesn't block the rest of the summary.
const GraficosDeHoras = dynamic(() => import("./GraficosDeHoras"), {
  ssr: false,
  loading: () => (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="h-[420px] w-full bg-zinc-100 dark:bg-white/5 rounded-[2.5rem] animate-pulse" />
      <div className="h-[420px] w-full bg-zinc-100 dark:bg-white/5 rounded-[2.5rem] animate-pulse" />
    </div>
  ),
});

export default GraficosDeHoras;
