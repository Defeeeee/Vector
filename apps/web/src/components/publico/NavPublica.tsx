"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Compass, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * La barra de las páginas públicas: la landing y las guías. Los links a secciones van
 * con la ruta entera (`/#libro`), así funcionan igual desde una guía.
 */
const LINKS = [
  { nombre: "Funciones", href: "/#funciones" },
  { nombre: "Libro de vuelo", href: "/#libro" },
  { nombre: "Red de pilotos", href: "/#red" },
  { nombre: "Guías", href: "/guias" },
];

export default function NavPublica() {
  const [abierto, setAbierto] = useState(false);

  return (
    <nav className="fixed top-4 md:top-6 w-full z-50 px-4" aria-label="Principal">
      <div className="container-wide flex items-center justify-between h-16 px-4 md:px-6 rounded-2xl bg-white/80 dark:bg-black/80 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none transition-colors">
        <Link href="/" className="flex items-center space-x-2.5 text-zinc-900 dark:text-white group" aria-label="Vector, inicio">
          <div className="w-9 h-9 bg-zinc-900 dark:bg-white rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Compass className="w-5 h-5 text-white dark:text-zinc-900" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Vector</span>
        </Link>

        <div className="hidden lg:flex items-center space-x-7">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              {l.nombre}
            </Link>
          ))}
          <div className="h-4 w-px bg-zinc-200 dark:bg-white/10" />
          <div className="w-40 scale-90 origin-right">
            <ThemeToggle />
          </div>
          <Link href="/login" className="text-sm font-medium text-zinc-900 dark:text-white hover:opacity-70 transition-opacity">
            Ingresar
          </Link>
          <Link
            href="/register"
            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-cal-highlight dark:shadow-none flex items-center gap-1.5"
          >
            Crear cuenta
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <button
          type="button"
          className="lg:hidden p-2 text-zinc-900 dark:text-white"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label={abierto ? "Cerrar el menú" : "Abrir el menú"}
        >
          {abierto ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {abierto && (
        <div className="lg:hidden mt-2 mx-4 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-2xl p-6 flex flex-col space-y-4 shadow-cal dark:shadow-none animate-in fade-in slide-in-from-top-2 duration-200">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-zinc-900 dark:text-white" onClick={() => setAbierto(false)}>
              {l.nombre}
            </Link>
          ))}
          <hr className="border-zinc-100 dark:border-white/10" />
          <div className="w-full">
            <ThemeToggle />
          </div>
          <Link href="/login" className="text-sm font-medium text-zinc-900 dark:text-white mt-2">
            Ingresar
          </Link>
          <Link
            href="/register"
            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-center font-semibold text-sm py-3.5 rounded-xl shadow-lg"
          >
            Crear cuenta
          </Link>
        </div>
      )}
    </nav>
  );
}
