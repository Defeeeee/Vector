"use client";

import { useEffect, useState } from "react";
import { navegadorParaCad, type NavegadorCad } from "@/lib/extension-cad";

/**
 * Los pasos de "Pasar al CAD" que le sirven a este navegador (`navegadorParaCad`). El server
 * adivina por el user agent, para que no salte; al montar se corrige con lo que sólo sabe el
 * navegador (un iPad dice ser una Mac).
 */
export default function SegunNavegador({
  inicial,
  extension,
  marcador,
  compu,
}: {
  inicial: NavegadorCad;
  extension: React.ReactNode;
  marcador: React.ReactNode;
  compu: React.ReactNode;
}) {
  const [nav, setNav] = useState(inicial);
  useEffect(() => {
    setNav(navegadorParaCad(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  return <>{nav === "compu" ? compu : nav === "marcador" ? marcador : extension}</>;
}
