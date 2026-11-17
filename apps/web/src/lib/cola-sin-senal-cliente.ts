"use client";

import { useSyncExternalStore } from "react";
import { CLAVE_COLA, escribirCola, leerCola, type Cola } from "@/lib/cola-sin-senal";

/**
 * La cola de vuelos sin señal sobre `localStorage` (2026-11-17). Todo con `try/catch`: en una
 * ventana privada o con el almacenamiento bloqueado, `localStorage` tira o no guarda. Que no
 * guarde se avisa (`guardarCola` devuelve `false`) y el formulario no dice "guardado" en falso.
 */

/** Avisa a la misma pestaña (el evento `storage` sólo salta en las otras). */
export const EVENTO_COLA = "vector-cola-cambio";
/** "Cargar ahora": le pide a `EnviarColaSinSenal` que mande ya. */
export const EVENTO_ENVIAR_COLA = "vector-cola-enviar";

const VACIA: Cola = [];
let cacheTexto: string | null | undefined;
let cacheCola: Cola = VACIA;

function textoGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_COLA);
  } catch {
    return null;
  }
}

export function leerColaLocal(): Cola {
  const texto = textoGuardado();
  if (texto !== cacheTexto) {
    cacheTexto = texto;
    cacheCola = texto ? leerCola(texto) : VACIA;
  }
  return cacheCola;
}

export function guardarCola(cola: Cola): boolean {
  try {
    if (cola.length === 0) window.localStorage.removeItem(CLAVE_COLA);
    else window.localStorage.setItem(CLAVE_COLA, escribirCola(cola));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(EVENTO_COLA));
  return true;
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO_COLA, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_COLA, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** La cola, viva. En el server (y en la hidratación) es vacía: nada se dibuja distinto (invariante 1). */
export function useColaSinSenal(): Cola {
  return useSyncExternalStore(suscribir, leerColaLocal, () => VACIA);
}
