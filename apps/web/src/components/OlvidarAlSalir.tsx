"use client";

import { useEffect } from "react";
import { olvidarDatosPersonales } from "@/lib/olvidar-datos";

/**
 * La red de seguridad del borrado: si estás acá, no hay sesión.
 *
 * Va en la landing y en el login, y borra lo personal al montar. Captura los tres
 * caminos que los otros dos disparadores no ven:
 *
 * - la sesión que el proxy declaró muerta y redirigió a `/?expired=true`,
 * - el refresh token vencido a los 30 días,
 * - las cookies borradas a mano desde el navegador.
 *
 * Hace falta porque **el service worker no puede consultar el estado de sesión por su
 * cuenta**: las cookies son `httpOnly` y ni `document.cookie` ni la Cookie Store API se
 * las muestran. Hay que avisarle; no puede averiguarlo.
 *
 * No dibuja nada.
 */
export default function OlvidarAlSalir() {
  useEffect(() => {
    void olvidarDatosPersonales();
  }, []);
  return null;
}
