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
        {enElInicio && <p className="eyebrow truncate">{fecha}</p>}
        <h1 className="text-[32px] font-display font-extrabold tracking-[-0.8px] leading-[42px] text-zinc-900 dark:text-white truncate mt-0.5">
          {enElInicio ? `Hola, ${nombre}` : seccion!.clave === "preparar" ? "Preparar" : seccion!.label}
        </h1>
      </div>
    </>
  );
}
