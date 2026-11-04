import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  /**
   * El título es el de la sección (Balance): en la app instalada ya lo dice el encabezado
   * (`TituloTelefono`), así que ahí no se repite.
   */
  esLaSeccion?: boolean;
  action?: ReactNode;
  children?: ReactNode;
}

export default function PageHeader({ eyebrow, title, esLaSeccion = false, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-8">
      {/* Eyebrow leads the title instead of trailing it: it says what section
          you are in, which is only useful *before* you read the heading. The
          accent bar that used to sit here is gone — with a neutral eyebrow the
          stack reads cleaner, and the accent is spent elsewhere on the page. */}
      {/* En el teléfono (3.5.0), como el encabezado de la Bitácora: el título de 28 px y sin el
          rótulo de arriba, que en una pantalla angosta ocupa dos renglones y repite la pestaña. */}
      <div className="space-y-2 md:space-y-3">
        <p className="eyebrow max-lg:hidden">{eyebrow}</p>
        <h2 className={`${esLaSeccion ? "app:hidden " : ""}text-[28px] md:text-5xl lg:text-6xl font-display font-extrabold lg:font-bold tracking-tight text-zinc-900 dark:text-white leading-tight md:leading-none`}>{title}</h2>
        {children}
      </div>
      {action && <div className="flex items-center gap-3 self-start md:self-auto">{action}</div>}
    </div>
  );
}
