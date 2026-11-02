"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-10 w-20" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-between p-1.5 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-all group shadow-sm dark:shadow-none relative w-16 h-8"
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <div className="relative z-10 w-full flex justify-between px-1">
        <Sun className={`h-3 w-3 ${!isDark ? 'text-zinc-900' : 'text-zinc-500'}`} />
        <Moon className={`h-3 w-3 ${isDark ? 'text-white' : 'text-zinc-400'}`} />
      </div>
      <div className={`absolute top-1 left-1 bottom-1 w-6 bg-white dark:bg-zinc-800 rounded-full shadow-sm transition-transform duration-300 transform ${isDark ? 'translate-x-8' : 'translate-x-0'}`} />
    </button>
  );
}
