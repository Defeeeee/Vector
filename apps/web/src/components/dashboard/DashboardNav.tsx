"use client";

import { Compass, History, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
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
    // La barra del escritorio (3.11.0): el ícono queda en su lugar y el nombre aparece al abrirse
    // la barra (`.rail` en el layout, `.rail-rotulo` en globals.css).
    return (
      <nav aria-label="Secciones" className="flex flex-col gap-1">
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
              className="group relative flex items-center gap-3 h-12 rounded-2xl px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-aviation-cyan"
            >
              {active && (
                <motion.div
                  layoutId="rail-nav-active"
                  className="absolute inset-0 rounded-2xl bg-cabina-activa"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative z-10 shrink-0">
                <Icon className={`w-5 h-5 transition-colors ${active ? "text-aviation-cyan" : "text-zinc-400 group-hover:text-white"}`} strokeWidth={2} />
                {flagged && <Dot ring="ring-cabina" />}
              </span>
              <span className={`rail-rotulo relative z-10 text-sm font-semibold ${active ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>
                {seccion.label}
                {flagged && <span className="ml-1.5 text-xs font-medium text-red-400">{alerta.texto}</span>}
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
    - Since 3.14.0, in the browser and installed, a full-width bar against the bottom edge (the
      layout draws it): names in mono, the active one in cyan with a line on top. In the browser
      the cyan + sits at the end of the bar; installed, it moves to the header.

    With five sections everything fits, so the "Más" sheet that used to hold the
    overflow is gone — and with it the extra tap to reach half the app.
  */
  return (
    <nav
      aria-label="Secciones"
      className="w-full h-16 grid grid-cols-4"
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
      className={`relative h-full flex flex-col items-center justify-center gap-1.5 transition-colors ${
        active ? "text-aviation-cyan" : "text-zinc-500 active:text-zinc-300"
      }`}
    >
      {/* La activa, con la raya cian arriba (3.14.0): sin la burbuja de fondo, que era una cajita. */}
      {active && (
        <motion.span
          layoutId="mobile-nav-active"
          aria-hidden="true"
          className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-aviation-cyan"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span className="relative">
        {icon}
        {flagged && <Dot ring="ring-noche" />}
      </span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] leading-none">{label}</span>
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
