"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import { ImagenIlegible, comprimirImagen } from "@/lib/imagen-cliente";

/**
 * Subir, cambiar o sacar la foto de perfil, en el Hangar.
 *
 * Se achica en el navegador y el backend la recorta cuadrada a 512 px y la guarda sin
 * EXIF. Va a un bucket público porque se ve donde se ve el @, que ya es público: en el
 * encabezado, en las listas, en las publicaciones y en la vista previa de WhatsApp.
 */
export default function FotoDePerfil({ nombre, avatarUrl }: { nombre: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(avatarUrl);
  const [ocupado, setOcupado] = useState<"subiendo" | "sacando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const subir = async (archivo: File) => {
    setOcupado("subiendo");
    setError(null);
    try {
      const comprimida = await comprimirImagen(archivo, 1024);
      const formulario = new FormData();
      formulario.append("archivo", comprimida, comprimida.name);
      const res = await fetch("/api/social/avatar", { method: "POST", body: formulario });
      const cuerpo = (await res.json().catch(() => null)) as { avatar_url?: string | null; error?: string } | null;
      if (!res.ok) {
        setError(cuerpo?.error ?? (res.status === 413 ? "La foto pesa demasiado." : "No se pudo subir la foto."));
        return;
      }
      setUrl(cuerpo?.avatar_url ?? null);
      // El encabezado y las listas la muestran desde el server.
      router.refresh();
    } catch (e) {
      setError(e instanceof ImagenIlegible ? e.message : "No se pudo subir la foto. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const sacar = async () => {
    if (!window.confirm("¿Sacar tu foto de perfil?")) return;
    setOcupado("sacando");
    setError(null);
    try {
      const res = await fetch("/api/social/avatar", { method: "DELETE" });
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(cuerpo?.error ?? "No se pudo sacar la foto.");
        return;
      }
      setUrl(null);
      router.refresh();
    } catch {
      setError("No se pudo sacar la foto. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const boton =
    "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50";

  return (
    <div className="flex items-center gap-4 md:gap-5">
      <div className="relative">
        <AvatarPiloto nombre={nombre} avatarUrl={url} tamano="lg" />
        {ocupado && (
          <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </span>
        )}
      </div>
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={!!ocupado}
            className={`${boton} border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5`}
          >
            <Camera className="w-4 h-4" />
            {url ? "Cambiar foto" : "Subir foto"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => void sacar()}
              disabled={!!ocupado}
              className={`${boton} text-zinc-400 hover:text-red-600 dark:hover:text-red-400`}
            >
              Sacar
            </button>
          )}
        </div>
        <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
          Se ve donde se ve tu @. Se recorta cuadrada y se guarda sin datos de ubicación.
        </p>
        {error && <p className="text-[12px] font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          if (archivo) void subir(archivo);
        }}
      />
    </div>
  );
}
