import { Plane } from "lucide-react";
import AircraftForm from "./AircraftForm";

/**
 * Nuevo Vuelo cuando el piloto todavía no cargó ninguna aeronave.
 *
 * Antes de esto, la pantalla se renderizaba igual: el select de aeronave recibía
 * `options=[]`, se abría, decía "Sin resultados", y el `required` bloqueaba el
 * submit **sin ninguna forma de satisfacerlo**. Ni mensaje ni salida. Es el
 * escalón donde el embudo se corta —de 4 pilotos con aeronave a 1 con vuelo— y se
 * descubría abriendo un desplegable vacío.
 *
 * **El alta va acá adentro, no en un link a Configuración.** La salida del
 * callejón tiene que estar en el callejón; mandar al piloto a otra pantalla es
 * pedirle que vuelva solo. `AircraftForm` ya trae su `try/catch`, su estado de
 * pending y su banner de error, así que se embebe tal cual.
 *
 * Nació como componente porque lo compartían `/dashboard/log-flight` y el modal
 * interceptado de Nuevo Vuelo. El modal se sacó en septiembre de 2026 —Registrar
 * es una sola página— y esto quedó como el estado vacío de esa página.
 */
export default function SinAeronaves() {
  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-dashed border-zinc-200 dark:border-white/10 p-10 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center">
          <Plane className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h3 className="mt-4 text-lg font-bold font-display text-zinc-900 dark:text-white">
          Primero, tu aeronave
        </h3>
        <p className="mt-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
          Un vuelo se anota contra una aeronave, así que necesitás cargar al menos
          una antes de registrar el primero. Se hace acá abajo y toma un minuto.
        </p>
      </div>

      <AircraftForm />
    </div>
  );
}
