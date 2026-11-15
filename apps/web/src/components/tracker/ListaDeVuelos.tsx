"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import MapaDeVuelos from "@/components/tracker/MapaDeVuelos";
import { CADA_ACTUALIZAR_MS, type TarjetaDeVuelo } from "@/lib/tracker";

/**
 * La lista de vuelos del tracker: arriba lo que está en el aire, después lo que todavía no salió y al
 * final lo que terminó hace poco. Cada tarjeta lleva al detalle (`/vuelo/<token>`).
 *
 * - **Se actualiza sola cada ~30 s mientras está a la vista** y al volver a la pestaña, con
 *   `/api/tracker/vuelos` (GET: no escribe nada, invariante 15). Un corte de red no borra lo que se
 *   estaba viendo: queda la lista y un aviso.
 * - Las horas ya vienen escritas del server (invariante 1): acá no se formatea ninguna fecha.
 * - Con **más de un avión en el aire** se suma un mapa con todos a la vez.
 */
export default function ListaDeVuelos({ inicial, resumenInicial }: { inicial: TarjetaDeVuelo[]; resumenInicial: string }) {
  const router = useRouter();
  const [tarjetas, setTarjetas] = useState(inicial);
  const [resumen, setResumen] = useState(resumenInicial);
  const [sinConexion, setSinConexion] = useState(false);
  const preguntando = useRef(false);

  const actualizar = useCallback(async () => {
    if (preguntando.current) return;
    preguntando.current = true;
    try {
      const res = await fetch("/api/tracker/vuelos", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/ingresar";
        return;
      }
      if (!res.ok) {
        setSinConexion(true);
        return;
      }
      const d = (await res.json()) as { tarjetas: TarjetaDeVuelo[]; resumen: string };
      setTarjetas(d.tarjetas);
      setResumen(d.resumen);
      setSinConexion(false);
    } catch {
      setSinConexion(true);
    } finally {
      preguntando.current = false;
    }
  }, []);

  useEffect(() => {
    const cada = window.setInterval(() => {
      if (document.visibilityState === "visible") void actualizar();
    }, CADA_ACTUALIZAR_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void actualizar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      window.clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [actualizar]);

  const enElAire = tarjetas.filter((t) => t.posicion);
  const grupos: { clave: TarjetaDeVuelo["grupo"]; titulo: string }[] = [
    { clave: "aire", titulo: "En el aire" },
    { clave: "proximo", titulo: "Por salir" },
    { clave: "termino", titulo: "Terminaron hace poco" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">{resumen}</h1>
        {sinConexion && <p className="mt-2 text-base text-white/60">Se cortó la conexión: se muestra lo último que llegó y se vuelve a intentar solo.</p>}
      </div>

      {enElAire.length > 1 && (
        <div className="relative h-[46dvh] min-h-72 overflow-hidden rounded-3xl border border-white/10" aria-label="Todos los aviones en el aire">
          <MapaDeVuelos vuelos={tarjetas} alAbrir={(token) => router.push(`/vuelo/${token}`)} />
        </div>
      )}

      {tarjetas.length === 0 ? (
        <p className="text-lg leading-snug text-white/75">
          Ningún piloto te asignó un vuelo por ahora. Cuando lo haga, aparece acá y te avisamos.
        </p>
      ) : (
        grupos.map((g) => {
          const lista = tarjetas.filter((t) => t.grupo === g.clave);
          if (lista.length === 0) return null;
          return (
            <section key={g.clave} aria-label={g.titulo} className="space-y-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white/60">{g.titulo}</h2>
              <ul className="space-y-3">
                {lista.map((t) => (
                  <li key={t.token}>
                    <Link
                      href={`/vuelo/${t.token}`}
                      className={`block rounded-3xl border p-5 transition-colors hover:border-white/40 ${t.grupo === "aire" ? "border-aviation-cyan/60 bg-aviation-cyan/[0.06]" : "border-white/15 bg-white/[0.03]"}`}
                    >
                      <p className="text-lg font-semibold text-white/80">
                        {t.piloto}
                        {t.handle && <span className="ml-2 font-mono text-sm font-medium text-white/50">@{t.handle}</span>}
                      </p>
                      {t.trayecto && <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-white">{t.trayecto}</p>}
                      <p className={`mt-3 flex items-center gap-2.5 text-xl font-bold ${t.grupo === "aire" ? "text-aviation-cyan" : "text-white"}`}>
                        {t.grupo === "aire" && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-aviation-cyan" aria-hidden />}
                        {t.titulo}
                      </p>
                      {t.detalle && <p className="mt-1 text-lg text-white/75">{t.detalle}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
