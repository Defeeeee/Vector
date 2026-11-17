"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CloudOff } from "lucide-react";
import { guardadoDeEstaPantalla, leerGuardado, pedirGuardado } from "@/lib/sin-senal-cliente";
import { textoDeLaFranja } from "@/lib/sin-senal";

/** Cuánto se espera a que la pantalla termine de cargar antes de bajar lo demás en segundo plano. */
const ESPERA_ANTES_DE_GUARDAR_MS = 8_000;

/**
 * Vector sin señal (3.44.0). Hace dos cosas, las dos en el layout del dashboard:
 *
 * 1. **Guarda lo necesario para volar.** Al abrir la app con sesión, unos segundos después de que la
 *    pantalla cargó, le pide al service worker que complete la app, el paquete de datos y las
 *    pantallas principales (`guardarParaVolar`). **Decide el service worker** (`debePrecalentar`:
 *    buena conexión, sin "ahorro de datos", como mucho una vez cada 6 h, y borra lo de otra cuenta);
 *    acá sólo se pide. Son GET de lectura: no escribe nada (invariante 15).
 * 2. **Dice, sin vueltas, que no hay señal.** Una franja de borde a borde arriba, con la hora de lo
 *    que se está mostrando. Es lo guardado, y el piloto tiene que saberlo antes de confiar en un
 *    número (invariante 2). La hora sale de la fecha de captura que el service worker anotó y se
 *    escribe a mano en hora argentina (invariante 1): nunca `toLocaleString`.
 *
 * No dibuja nada con señal. La franja no atrapa toques (`pointer-events-none`): lo que queda debajo
 * —el encabezado— sigue andando.
 */
export default function SinSenal({ usuarioId }: { usuarioId: string | null }) {
  const [sinRed, setSinRed] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const pathname = usePathname();

  // Ir y venir de la red.
  useEffect(() => {
    const actualizar = () => setSinRed(!navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  // Guardar para volar, en segundo plano, una vez por apertura (y al volver la red).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !usuarioId) return;
    const guardar = () => void pedirGuardado({ usuario: usuarioId, forzar: false });
    const t = setTimeout(guardar, ESPERA_ANTES_DE_GUARDAR_MS);
    window.addEventListener("online", guardar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", guardar);
    };
  }, [usuarioId]);

  // De cuándo es lo que se muestra: la pantalla actual si se sirvió de lo guardado; si no, la última pasada.
  useEffect(() => {
    if (!sinRed) return;
    let vivo = true;
    void (async () => {
      const deLaPantalla = await guardadoDeEstaPantalla(pathname);
      const cuando = deLaPantalla ?? (await leerGuardado()).precalentadoEn;
      if (!vivo) return;
      setGuardadoEn(cuando);
      setAhora(Date.now());
    })();
    return () => {
      vivo = false;
    };
  }, [sinRed, pathname]);

  if (!sinRed) return null;

  return (
    <div
      role="status"
      data-imprimir="no"
      className="pointer-events-none fixed inset-x-0 top-0 z-[95] flex items-end justify-center gap-2 bg-amber-400 px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-noche"
    >
      <CloudOff className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{textoDeLaFranja(guardadoEn, ahora || Date.now())}</span>
    </div>
  );
}
