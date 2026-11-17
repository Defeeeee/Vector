"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { logFlight } from "@/actions/flight";
import { formDataDeCampos, pendientes, procesarCola, type Resultado } from "@/lib/cola-sin-senal";
import { EVENTO_ENVIAR_COLA, guardarCola, leerColaLocal } from "@/lib/cola-sin-senal-cliente";
import { useAvisos } from "@/components/dashboard/Avisos";

/** Cada cuánto reintenta mientras haya vuelos esperando. */
const CADA_MS = 60_000;

/**
 * Manda a Vector los vuelos que se guardaron en el teléfono sin señal (2026-11-17).
 *
 * Va en el layout del dashboard, sin dibujar nada. Intenta al montarse (abrir la app), al volver
 * la red (`online`), al volver a la pestaña, cada minuto mientras haya pendientes y cuando el
 * piloto toca "Cargar ahora". De a uno y en orden (`procesarCola`); cada pedido lleva su
 * `clave_cliente`, así que repetirlo —dos pestañas, una respuesta perdida— no crea otro vuelo.
 *
 * Nada de esto corre al dibujar una pantalla (invariante 15): todo sale del navegador.
 */
export default function EnviarColaSinSenal() {
  const router = useRouter();
  const { notificar } = useAvisos();
  const enCurso = useRef(false);

  const enviar = useCallback(async () => {
    if (enCurso.current) return;
    if (pendientes(leerColaLocal()) === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    enCurso.current = true;
    try {
      const resumen = await procesarCola({
        leer: leerColaLocal,
        escribir: guardarCola,
        enviar: async (campos): Promise<Resultado> => {
          const r = await logFlight(formDataDeCampos(campos));
          return "error" in r ? { ok: false, error: r.error, estado: r.estado } : { ok: true };
        },
      });
      if (resumen.enviados.length > 0) {
        const n = resumen.enviados.length;
        notificar({
          tipo: "exito",
          titulo: n === 1 ? "Vuelo cargado" : `${n} vuelos cargados`,
          detalle: "Estaban guardados en el teléfono y ya están en tu bitácora.",
        });
        router.refresh();
      }
      if (resumen.rechazados.length > 0) {
        notificar({
          tipo: "error",
          titulo: "Un vuelo no se pudo cargar",
          detalle: "Quedó guardado en el teléfono con el motivo. Mirá el aviso en el inicio o la Bitácora.",
        });
      }
    } finally {
      enCurso.current = false;
    }
  }, [notificar, router]);

  useEffect(() => {
    enviar();
    const alVolver = () => enviar();
    const alVerse = () => {
      if (document.visibilityState === "visible") enviar();
    };
    window.addEventListener("online", alVolver);
    window.addEventListener(EVENTO_ENVIAR_COLA, alVolver);
    document.addEventListener("visibilitychange", alVerse);
    const reloj = window.setInterval(enviar, CADA_MS);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener(EVENTO_ENVIAR_COLA, alVolver);
      document.removeEventListener("visibilitychange", alVerse);
      window.clearInterval(reloj);
    };
  }, [enviar]);

  return null;
}
