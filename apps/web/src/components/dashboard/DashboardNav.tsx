"use client";

import { Compass, History, LayoutDashboard, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { SECCIONES, hrefDeSeccion, seccionDe, type ClaveSeccion } from "@/lib/secciones";

/**
 * Los íconos de cada sección. Viven acá y no en `lib/secciones.ts` para que ese
 * archivo siga siendo testeable en `environment: "node"`.
 *
 * Son los mismos que tenían esos cuatro destinos antes de agruparse: "Preparar
 * vuelo" hereda la brújula del Planificador, que ocupaba ese mismo lugar.
 */
const ICONOS: Record<ClaveSeccion, LucideIcon> = {
  inicio: LayoutDashboard,
  bitacora: History,
  balance: Wallet,
  preparar: Compass,
  pilotos: Users,
};

/**
 * Lo que pide atención en cada sección: un punto rojo en el ícono y, en el rail, el
 * texto del tooltip. Los hallazgos de auditoría van en la Bitácora, que es donde vive
 * esa pestaña, y las solicitudes para seguirte en Pilotos. Cero o ausente no dibuja
 * nada.
 */
export type AlertasDeSeccion = Partial<Record<ClaveSeccion, { cantidad: number; texto: string }>>;

export default function DashboardNav({
  variant,
  alertas = {},
}: {
  variant: "rail" | "mobile";
  alertas?: AlertasDeSeccion;
}) {
  const pathname = usePathname();
  const activa = seccionDe(pathname)?.clave;

  if (variant === "rail") {
    return (
      <nav className="flex flex-col items-center gap-1">
        {SECCIONES.map((seccion) => {
          const active = seccion.clave === activa;
          const Icon = ICONOS[seccion.clave];
          const alerta = alertas[seccion.clave];
          const flagged = !!alerta && alerta.cantidad > 0;

          return (
            <Link
              key={seccion.clave}
              href={hrefDeSeccion(seccion)}
              aria-current={active ? "page" : undefined}
              className="group relative flex items-center justify-center w-12 h-12"
            >
              {active && (
                <motion.div
                  layoutId="rail-nav-active"
                  className="absolute inset-0 rounded-2xl bg-white/10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}

              <span className="relative z-10">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    active ? "text-aviation-cyan" : "text-zinc-500 group-hover:text-white"
                  }`}
                  strokeWidth={2}
                />
                {flagged && <Dot ring="ring-zinc-950" />}
              </span>

              {/* The rail is icon-only, so the tooltip carries the label. */}
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg bg-zinc-900 text-white text-xs font-semibold px-3 py-1.5 opacity-0 scale-95 origin-left group-hover:opacity-100 group-hover:scale-100 transition-all z-50 shadow-xl border border-white/10">
                {seccion.label}
                {flagged && <span className="ml-1.5 text-red-400">{alerta.texto}</span>}
              </span>
            </Link>
          );
        })}
      </nav>
    );
  }

  /*
    The phone. Since 3.4.0 each icon carries its name underneath ("Preparar vuelo" is
    shortened to "Preparar": it doesn't fit under a ~55 px slot).
    - In the browser, a floating pill over Safari's bar, sharing the row with the round
      "Nuevo vuelo" button (Federico rejected a menu bar at the top).
    - Installed as an app (`app:`), a full-width tab bar against the bottom edge, with the
      home indicator's safe area under it; the + moves to the header.

    With five sections everything fits, so the "Más" sheet that used to hold the
    overflow is gone — and with it the extra tap to reach half the app.
  */
  return (
    <nav
      aria-label="Secciones"
      className="w-full h-[60px] app:h-auto bg-white/95 dark:bg-zinc-900/95 app:dark:bg-black/90 backdrop-blur-xl p-1 app:px-1.5 app:pt-1.5 app:pb-[calc(env(safe-area-inset-bottom)+0.25rem)] rounded-full app:rounded-none grid grid-cols-5 shadow-cal dark:shadow-none app:shadow-none border border-zinc-200 dark:border-white/10 app:border-x-0 app:border-b-0 pointer-events-auto"
    >
      {SECCIONES.map((seccion) => {
        const Icon = ICONOS[seccion.clave];
        return (
          <MobileNavItem
            key={seccion.clave}
            href={hrefDeSeccion(seccion)}
            label={seccion.clave === "preparar" ? "Preparar" : seccion.label}
            icon={<Icon className="w-[22px] h-[22px]" strokeWidth={2} />}
            active={seccion.clave === activa}
            flagged={(alertas[seccion.clave]?.cantidad ?? 0) > 0}
          />
        );
      })}
    </nav>
  );
}

function MobileNavItem({
  href,
  icon,
  label,
  active = false,
  flagged = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  flagged?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative h-full app:h-12 flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-aviation-blue-dark dark:text-aviation-cyan" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {active && (
        <motion.div
          layoutId="mobile-nav-active"
          className="absolute inset-0 rounded-full bg-aviation-blue/10 app:hidden"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span className="relative z-10">
        {icon}
        {flagged && <Dot ring="ring-white dark:ring-zinc-900" />}
      </span>
      <span className={`relative z-10 text-[10.5px] app:text-[11px] leading-none ${active ? "font-extrabold" : "font-bold"}`}>{label}</span>
    </Link>
  );
}

/**
 * Attention marker: open audit findings, pending follow requests.
 *
 * A dot rather than a count bubble: the number was big enough to break the
 * pill's silhouette and had nowhere to sit that wasn't overlapping the rounded
 * edge. The exact figure still shows where there's room for it — the tooltip on
 * the rail and the section's tab.
 *
 * Anchored to the icon, not to the slot: the slot is a flex column whose width
 * depends on how many destinations are visible, so positioning against it left
 * the dot drifting away from the glyph as that count changed.
 */
function Dot({ ring }: { ring: string }) {
  return (
    <span
      className={`absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ${ring} z-20`}
    />
  );
}
