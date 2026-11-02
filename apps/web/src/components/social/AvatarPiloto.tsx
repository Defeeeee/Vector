"use client";

import { useState } from "react";
import { iniciales } from "@/lib/social";

const TAMANOS = {
  xs: "w-7 h-7 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-20 h-20 md:w-24 md:h-24 text-2xl md:text-3xl",
} as const;

/**
 * La foto de un piloto, o sus iniciales si no subió ninguna o si no carga.
 *
 * Decorativa: el nombre siempre está al lado, así que para un lector de pantalla no
 * agrega nada. Es cliente sólo por el `onError`; el fallo se recuerda por URL, así que
 * una foto nueva se vuelve a intentar.
 */
export default function AvatarPiloto({
  nombre,
  avatarUrl,
  tamano = "md",
}: {
  nombre: string;
  avatarUrl?: string | null;
  tamano?: keyof typeof TAMANOS;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const conFoto = !!avatarUrl && fallo !== avatarUrl;

  return (
    <div
      aria-hidden="true"
      className={`${TAMANOS[tamano]} shrink-0 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-display font-bold overflow-hidden`}
    >
      {conFoto ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setFallo(avatarUrl)}
        />
      ) : (
        iniciales(nombre)
      )}
    </div>
  );
}
