"use client";

import Link from "next/link";
import { CloudOff, KeyRound, RotateCw, TriangleAlert } from "lucide-react";

/**
 * Lo que ve el piloto cuando algo falla. Compartido por las tres fronteras de error.
 *
 * **Antes de esto no existía ninguna en toda la app.** Un fallo llegaba al boundary
 * genérico de Next: pantalla en blanco con "Application error: a server-side
 * exception has occurred". Sin explicación, sin botón, y sin distinguir "no hay red"
 * de "se venció tu sesión" — que para el usuario son la misma pantalla y son dos
 * problemas con salidas opuestas.
 *
 * Los tres casos existen porque **cada uno se resuelve distinto**: la red se espera,
 * la sesión se renueva entrando de nuevo, el error real se reintenta. Un mensaje
 * único obligaría al piloto a adivinar cuál le tocó.
 *
 * Vive en un componente propio y no repetido en cada `error.tsx` porque son tres
 * —`app/`, `app/dashboard/` y `global-error`— y tres copias divergen.
 */

export interface ErrorEstadoProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorEstado({ error, reset }: ErrorEstadoProps) {
  /*
    La clasificación es por texto y hay que ser honesto: es frágil. En producción
    Next reemplaza el mensaje por un digest, así que lo más probable es caer en el
    caso genérico — **por eso el genérico tiene que servir solo**, no ser un cajón
    de sastre.

    Con `apiFetch` devolviendo 503 en vez de tirar, el camino de red ya casi no llega
    hasta acá. Esto es la red de contención de lo que se escape.
  */
  const texto = `${error.message}`.toLowerCase();
  const esRed =
    texto.includes("fetch failed") ||
    texto.includes("network") ||
    texto.includes("timeout") ||
    texto.includes("econnrefused");
  const esSesion = texto.includes("401") || texto.includes("unauthorized");

  const { Icono, titulo, detalle, tono } = esRed
    ? {
        Icono: CloudOff,
        titulo: "No hay conexión",
        detalle:
          "No pudimos contactar al servidor. Tus datos están a salvo — es un problema de red, no de tu cuenta. Probá de nuevo cuando tengas señal.",
        tono: "text-amber-600 dark:text-amber-500",
      }
    : esSesion
      ? {
          Icono: KeyRound,
          titulo: "Tu sesión venció",
          detalle: "Por seguridad la sesión caduca cada tanto. Entrá de nuevo y seguís donde estabas.",
          tono: "text-zinc-500 dark:text-zinc-400",
        }
      : {
          Icono: TriangleAlert,
          titulo: "Algo se rompió",
          detalle:
            "Fue un error nuestro, no algo que hayas hecho mal. Probá reintentar; si sigue pasando, avisanos.",
          tono: "text-red-600 dark:text-red-500",
        };

  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
        <Icono className={`w-6 h-6 ${tono}`} />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-display font-bold tracking-tight text-zinc-900 dark:text-white">
          {titulo}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{detalle}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {esSesion ? (
          <Link
            href="/api/auth/logout?redirect=/?expired=true"
            className="px-6 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold"
          >
            Entrar de nuevo
          </Link>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Reintentar
          </button>
        )}
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
        >
          Ir al inicio
        </Link>
      </div>

      {/* El digest es lo único que permite encontrar este error en los logs del
          servidor, donde el mensaje real sí está. Chico y al pie, pero presente. */}
      {error.digest && (
        <p className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600">ref: {error.digest}</p>
      )}
    </div>
  );
}
