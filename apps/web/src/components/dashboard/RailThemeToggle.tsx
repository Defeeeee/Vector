"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function RailThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-12 h-12" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="group relative flex items-center justify-center w-12 h-12 rounded-2xl transition-colors text-zinc-500 hover:text-white hover:bg-white/5"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg bg-zinc-900 text-white text-xs font-semibold px-3 py-1.5 opacity-0 scale-95 origin-left group-hover:opacity-100 group-hover:scale-100 transition-all z-50 shadow-xl border border-white/10">
        {isDark ? "Modo claro" : "Modo oscuro"}
      </span>
    </button>
  );
}
