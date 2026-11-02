"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import PanelCad from "@/components/dashboard/cad/PanelCad";
import { fuenteEnlace } from "@/components/dashboard/cad/fuente-cad";
import { ExtensionVieja } from "@/components/dashboard/cad/ExtensionCad";
import { CLAVE_MARCADOR_USADO } from "@/components/dashboard/MarcadorCad";
import { estadoExtension } from "@/lib/extension-cad";
import { hayCad, transporteCad, type TransporteCad } from "@/lib/enlace-cad";

/**
 * "Pasar al CAD" con la pestaña del CAD del piloto (2.36.0): si hay extensión o esta pestaña la
 * abrió el marcador, el panel de Vector (`PanelCad`) le pide al CAD lo que necesita por ahí. Si
 * no, se ven los pasos de siempre (`children`).
 *
 * Con la extensión y sin el CAD abierto, espera: pregunta cada dos segundos si ya hay una
 * pestaña del CAD, y arranca sola cuando el piloto entra.
 */
export default function ConElCad({ activo, children }: { activo: boolean; children: React.ReactNode }) {
  const [t, setT] = useState<TransporteCad | null>(null);
  const [cad, setCad] = useState(false);

  useEffect(() => {
    if (activo) setT(transporteCad());
  }, [activo]);

  useEffect(() => {
    if (!t) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout>;
    const probar = async () => {
      const ok = await hayCad(t);
      if (!vivo) return;
      setCad(ok);
      if (!ok) reloj = setTimeout(probar, 2000);
      else if (t === "marcador")
        try {
          localStorage.setItem(CLAVE_MARCADOR_USADO, "1");
        } catch {
          /* sin almacenamiento, el paso del marcador se sigue viendo entero */
        }
    };
    void probar();
    return () => {
      vivo = false;
      clearTimeout(reloj);
    };
  }, [t]);

  const fuente = useMemo(() => (t ? fuenteEnlace(t) : null), [t]);
  const [vieja, setVieja] = useState<string | null>(null);
  useEffect(() => {
    const v = document.documentElement.dataset.vectorCadExtension;
    if (t === "extension" && estadoExtension(v) === "vieja") setVieja(v ?? null);
  }, [t]);

  if (!t || !fuente) return <>{children}</>;

  return (
    <>
      {vieja && <ExtensionVieja instalada={vieja} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-5 py-4">
        <span className="relative grid place-items-center w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white shrink-0">
          <Link2 className="w-5 h-5 text-white dark:text-zinc-900" aria-hidden="true" />
          <span
            className={`absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-950 ${cad ? "bg-emerald-500" : "bg-amber-400"}`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">{cad ? "Conectado con tu CAD" : "Esperando tu CAD"}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {cad
              ? `Por ${t === "extension" ? "la extensión" : "el marcador"}, desde tu sesión del CAD en la otra pestaña. Lo que ves está actualizado recién. Vector carga los vuelos; la declaración jurada la hacés vos.`
              : t === "extension"
                ? 'Abrí el CAD en otra pestaña y entrá a "Registro horas vuelo". Esto arranca solo.'
                : "Se cerró la pestaña del CAD. Abrí el CAD y tocá el marcador de nuevo."}
          </p>
        </div>
        {!cad && (
          <a
            href="https://cad.anac.gob.ar/portalApp/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold"
          >
            Abrir el CAD <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      {cad ? (
        <PanelCad fuente={fuente} />
      ) : (
        <div className="rounded-3xl border border-zinc-200 dark:border-white/10 px-5 py-10 text-center space-y-2">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-400" aria-hidden="true" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Cuando el CAD esté abierto, acá aparecen tus vuelos.</p>
        </div>
      )}
    </>
  );
}
