import { CloudOff } from "lucide-react";

/**
 * "No pudimos hablar con el servidor."
 *
 * Va en el layout, así que aparece en cualquier pantalla del dashboard donde la
 * consulta base haya fallado. Sin esto, un corte de red se ve como un dashboard con
 * todo en cero — y un piloto que abre la app en la rampa y ve cero horas, cero
 * vuelos y ningún documento no tiene forma de distinguir "se cayó la red" de "perdí
 * mis datos". La segunda lectura es la que arruina el día.
 *
 * Es la misma disciplina que `unavailable` en `dashboard/page.tsx` y que el estado
 * `datos_no_disponibles` del semáforo: **cuando no se sabe, se dice que no se sabe.**
 *
 * Deliberadamente sobrio y no una alerta roja: el caso más común es señal mala en un
 * aeródromo, no una catástrofe. Tiene que informar sin asustar.
 */
export default function SinConexionBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 mb-6">
      <CloudOff className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Sin conexión con el servidor
        </p>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5">
          Lo que veas puede estar incompleto o desactualizado. Tus datos están a salvo:
          esto es un problema de red, no de tu cuenta.
        </p>
      </div>
    </div>
  );
}
