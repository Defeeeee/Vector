"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CHANGELOG, NOVEDADES_EN_TARJETA, claveDescarte } from "@/lib/changelog";
import NovedadCard from "./NovedadCard";

/**
 * "Esto es lo nuevo", en el dashboard.
 *
 * **El contenido ya no vive acá.** Antes eran dos tarjetas escritas a mano en JSX con
 * el número de versión en una constante local, y el resultado previsible: la tarjeta
 * quedó diez features atrasada, anunciando la 2.7.0 mientras se publicaban los costos,
 * el calendario, los vencimientos variables y el planificador. Agregar una feature no
 * puede depender de que alguien se acuerde de tocar un componente.
 *
 * Ahora lee `src/lib/changelog.ts`, que es un `.ts` puro y por lo tanto **testeado**:
 * hay tests que atan su versión a la de `package.json` y que abren `src/app/` para
 * comprobar que cada link exista.
 *
 * Lo que sí se conserva del diseño original, porque estaba bien: **el descarte es por
 * versión**. Quien cierra la tarjeta no la ve más… hasta que se publica una nueva, y
 * ahí vuelve sola.
 */
export default function ChangelogNotice() {
  const ultima = CHANGELOG[0];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /*
      Arranca oculta y se muestra recién en el efecto, no al revés. El servidor no puede
      leer `localStorage`, así que empezar visible haría parpadear la tarjeta en la cara
      de alguien que ya la descartó, en cada carga.
    */
    try {
      if (!localStorage.getItem(claveDescarte(ultima.version))) setVisible(true);
    } catch {
      // Safari en privado tira al tocar localStorage. Sin poder recordar el descarte,
      // lo correcto es no molestar: es una novedad, no un aviso importante.
    }
  }, [ultima.version]);

  const descartar = () => {
    try {
      localStorage.setItem(claveDescarte(ultima.version), "true");
    } catch {
      /* ídem: si no se puede recordar, igual se cierra por esta vez. */
    }
    setVisible(false);
  };

  if (!visible) return null;

  const enTarjeta = ultima.novedades.slice(0, NOVEDADES_EN_TARJETA);
  const hayMas = CHANGELOG.length > 1 || ultima.novedades.length > enTarjeta.length;

  return (
    <div className="rounded-[2rem] border border-aviation-blue/20 bg-aviation-blue/[0.04] dark:bg-aviation-blue/[0.06] p-6 md:p-7 relative overflow-hidden transition-all shadow-sm">
      <button
        onClick={descartar}
        type="button"
        className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-xl hover:bg-zinc-200/50 dark:hover:bg-white/10"
        title="Descartar novedades"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <span className="p-2 rounded-xl bg-aviation-blue/10 text-aviation-blue">
          <Sparkles className="w-4 h-4" />
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-aviation-blue">
          Novedades de la versión v{ultima.version}
        </span>
      </div>

      <h3 className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight mb-4 pr-10">
        {ultima.titulo}
      </h3>

      <div className="grid md:grid-cols-2 gap-4">
        {enTarjeta.map((novedad) => (
          <NovedadCard key={novedad.titulo} novedad={novedad} />
        ))}
      </div>

      {hayMas && (
        <Link
          href="/dashboard/novedades"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-aviation-blue hover:underline mt-4"
        >
          Ver todas las novedades <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
