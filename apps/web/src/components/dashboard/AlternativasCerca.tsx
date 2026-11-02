"use client";

import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { fmt } from "./tools/ToolPrimitives";
import type { Alternativa } from "@/lib/alternativas";

/**
 * Aeródromos cerca de cada punto de la ruta.
 *
 * ## Qué pregunta contesta
 *
 * "Si tengo que bajar acá, ¿dónde?". Vector ya tenía el directorio de 711 aeródromos y
 * ya calculaba la ruta; lo único que faltaba era cruzarlos.
 *
 * ## Lo que NO promete, y por eso se llama así
 *
 * **"Aeródromos cerca", no "alternativas".** Esto no sabe si la pista alcanza para tu
 * avión, si está habilitada hoy, si tiene combustible ni si un NOTAM la cerró. Sabe
 * dónde hay un aeródromo y a qué distancia. Llamarlo "alternativa" sugeriría una
 * validación operativa que no existe, y en aviación una promesa de más es peor que una
 * de menos.
 *
 * Los helipuertos quedan afuera del lado del servidor: la primera prueba devolvió tres
 * entre los cinco más cercanos a Morón, y un helipuerto no es donde baja un avión.
 */
export default function AlternativasCerca({
  puntos,
  groundSpeedKt,
}: {
  puntos: { codigo: string; lat?: number; lon?: number }[];
  groundSpeedKt: number | null;
}) {
  const [porPunto, setPorPunto] = useState<Record<string, Alternativa[]>>({});

  const conPosicion = puntos.filter((p) => p.lat !== undefined && p.lon !== undefined);
  const clave = conPosicion.map((p) => p.codigo).join(",");

  useEffect(() => {
    if (conPosicion.length === 0) return;
    const controlador = new AbortController();
    let vivo = true;

    (async () => {
      const entradas = await Promise.all(
        conPosicion.map(async (p): Promise<[string, Alternativa[]]> => {
          try {
            const gs = groundSpeedKt && groundSpeedKt > 0 ? `&gs=${Math.round(groundSpeedKt)}` : "";
            const res = await fetch(
              `/api/airports/near?lat=${p.lat}&lon=${p.lon}${gs}`,
              { signal: controlador.signal }
            );
            if (!res.ok) return [p.codigo, []];
            return [p.codigo, (await res.json()).resultados ?? []];
          } catch {
            return [p.codigo, []];
          }
        })
      );
      if (vivo) setPorPunto(Object.fromEntries(entradas));
    })();

    return () => {
      vivo = false;
      controlador.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, groundSpeedKt]);

  const hayAlguno = Object.values(porPunto).some((l) => l.length > 0);
  if (!hayAlguno) return null;

  return (
    <section className="space-y-3" data-imprimir="junto">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
        <LifeBuoy className="w-4 h-4 text-zinc-400" />
        Aeródromos cerca de la ruta
      </h3>

      <div className="grid gap-3 md:grid-cols-2">
        {conPosicion.map((punto) => {
          const lista = porPunto[punto.codigo] ?? [];
          if (lista.length === 0) return null;

          return (
            <div
              key={punto.codigo}
              className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
                Desde {punto.codigo}
              </p>
              <ul className="space-y-1.5">
                {lista.map((a) => (
                  <li key={a.icao} className="flex items-baseline gap-2 text-[12px]">
                    <span className="font-bold text-zinc-900 dark:text-white shrink-0">{a.icao}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 truncate flex-1">{a.label}</span>
                    <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 shrink-0">
                      {fmt(a.distanciaNm, 0)} NM
                      {a.minutos !== null && ` · ${Math.round(a.minutos)}′`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        Sólo distancia y posición. <strong>No verificamos</strong> si la pista alcanza para tu
        aeronave, si el aeródromo está operativo hoy ni si tiene combustible: para eso están los
        NOTAM de arriba y la carta.
      </p>
    </section>
  );
}
