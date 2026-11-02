"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sincronizarCad } from "@/actions/cad-vector";

/** La última vez que este navegador pidió sincronizar: para no preguntarle al backend en cada pantalla. */
const CLAVE = "vector-cad-sincronizado";
const CADA_MS = 24 * 3600_000;

/**
 * Sincroniza el CAD en segundo plano al abrir el dashboard (migración 037): sólo para quien
 * conectó su cuenta de ANAC, y como mucho una vez por día (el backend también lo controla). No
 * dibuja nada. Lo hace el navegador después de mostrar la pantalla, y no el server al dibujarla:
 * ninguna pantalla escribe al dibujarse (invariante 15).
 */
export default function SincronizarCad() {
  const router = useRouter();
  useEffect(() => {
    let ultima = 0;
    try {
      ultima = Number(localStorage.getItem(CLAVE)) || 0;
    } catch {
      /* sin almacenamiento, decide el backend */
    }
    if (Date.now() - ultima < CADA_MS) return;
    const t = setTimeout(async () => {
      const r = await sincronizarCad();
      if (r.motivo !== "error") {
        try {
          localStorage.setItem(CLAVE, String(Date.now()));
        } catch {
          /* idem */
        }
      }
      if (r.sincronizado && (r.desmarcados || r.marcados || r.estados)) router.refresh();
    }, 2500);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
