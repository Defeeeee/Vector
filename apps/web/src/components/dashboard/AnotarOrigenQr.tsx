"use client";

import { useEffect } from "react";
import { anotarOrigenQr } from "@/actions/pegatinas";

/**
 * Si la cuenta llegó por una pegatina con QR, lo anota una vez, desde el navegador
 * (invariante 15: ninguna pantalla escribe al dibujarse). El layout la monta sólo si está la
 * cookie del escaneo (`lib/pegatinas.ts`), así que para casi todos no existe.
 */
export default function AnotarOrigenQr() {
  useEffect(() => {
    void anotarOrigenQr().catch(() => {});
  }, []);
  return null;
}
