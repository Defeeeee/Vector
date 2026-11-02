import Link from "next/link";
import { Compass } from "lucide-react";
import { GUIAS } from "@/lib/sitio";

/**
 * El pie de las páginas públicas. Cada destino existe: un pie lleno de links muertos es
 * peor que uno corto. Las guías salen de `GUIAS`, así una nueva aparece sola.
 */
export default function PiePublico() {
  const link = "hover:text-zinc-900 dark:hover:text-white transition-colors";
  return (
    <footer className="py-12 border-t border-zinc-200 dark:border-white/10 relative z-10 w-full">
      <div className="container-wide">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
          <div className="col-span-2 space-y-4">
            <div className="flex items-center space-x-2.5 text-zinc-900 dark:text-white">
              <div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center shadow-lg">
                <Compass className="w-5 h-5 text-white dark:text-zinc-900" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight">Vector</span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">
              La bitácora de vuelo digital para pilotos argentinos: el desglose de la hoja, tus
              vencimientos, tu camino a la PCA y el libro en PDF para firmar.
            </p>
          </div>

          <div className="space-y-3">
            <p className="eyebrow">Producto</p>
            <ul className="space-y-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <li><Link href="/#funciones" className={link}>Funciones</Link></li>
              <li><Link href="/#libro" className={link}>Libro en PDF</Link></li>
              <li><Link href="/#red" className={link}>Red de pilotos</Link></li>
              <li><Link href="/#preguntas" className={link}>Preguntas frecuentes</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="eyebrow">Guías</p>
            <ul className="space-y-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {GUIAS.map((g) => (
                <li key={g.slug}>
                  <Link href={`/guias/${g.slug}`} className={link}>
                    {g.corto}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="eyebrow">Cuenta</p>
            <ul className="space-y-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <li><Link href="/register" className={link}>Crear cuenta</Link></li>
              <li><Link href="/login" className={link}>Ingresar</Link></li>
              <li><Link href="/legal/privacidad" className={link}>Privacidad</Link></li>
              <li><Link href="/legal/terminos" className={link}>Términos</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-zinc-200 dark:border-white/10 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400 dark:text-zinc-600">&copy; 2026 Vector.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            Vector no es un servicio de ANAC. Lo que se declara ante la autoridad sigue siendo
            responsabilidad de cada piloto.
          </p>
        </div>
      </div>
    </footer>
  );
}
