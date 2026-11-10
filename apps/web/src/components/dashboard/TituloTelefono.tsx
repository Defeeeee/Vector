"use client";

import { usePathname } from "next/navigation";
import { seccionDe } from "@/lib/secciones";

/**
 * La izquierda del encabezado del teléfono (3.4.0). En el navegador, siempre el logo que llega
 * como `children`. En la app instalada (`app:`) no hay logo, como en el diseño: un título
 * grande, como en iOS. En el inicio, "Hola" con la fecha; en una sección, su nombre ("Bitácora",
 * "Preparar vuelo"); fuera de las secciones (el Hangar, Registrar vuelo), el logo.
 *
 * La fecha baja escrita desde el server (`fecha`): acá no se formatea nada (invariante 1).
 */
export default function TituloTelefono({ fecha, nombre, children }: { fecha: string; nombre: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const enElInicio = pathname === "/dashboard";
  const seccion = enElInicio ? null : seccionDe(pathname);
  if (!enElInicio && !seccion) return <>{children}</>;
  return (
    <>
      <div className="app:hidden">{children}</div>
      <div className="hidden app:block min-w-0" data-titulo-inicio={enElInicio ? "" : undefined}>
        {/* Con la estética de la 3.14.0: la fecha en mono con el punto cian, el título en Bold. */}
        {enElInicio && (
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 truncate">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-aviation-cyan shrink-0" />
            {fecha}
          </p>
        )}
        <h1 className="text-[28px] font-display font-bold tracking-[-0.03em] leading-[42px] text-white truncate mt-0.5">
          {enElInicio ? `Hola, ${nombre}` : seccion!.clave === "preparar" ? "Preparar" : seccion!.label}
        </h1>
      </div>
    </>
  );
}
