import { revalidatePath } from "next/cache";

/**
 * Las pantallas que un vuelo nuevo, editado o borrado también cambia (invariante 8).
 *
 * Compartida por `logFlight`, `updateFlight`, `deleteFlight` y `bulkLogFlights`
 * (`actions/flight.ts`) y por el copiloto de la web (`api/chat`), porque todos tocan la
 * misma bitácora y hasta ahora cada uno revalidaba un subconjunto distinto —ninguna
 * incluía resumen, balance, aeródromos, auditoría ni ajustes, y el copiloto, nada—, así
 * que un vuelo cargado podía verse en Historial y seguir faltando en el promedio mensual
 * de Resumen hasta que algo más revalidara esa ruta. Mismo patrón que
 * `revalidateEverythingThatCounts` en `logbook.ts` y `revalidarProgramados` en
 * `planned-flight.ts`.
 */
export function revalidarLoQueCambiaUnVuelo() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/history");
  revalidatePath("/dashboard/summary");
  revalidatePath("/dashboard/balance");
  revalidatePath("/dashboard/airports");
  revalidatePath("/dashboard/history/auditoria");
  revalidatePath("/dashboard/settings");
  // El plan que se acaba de cerrar tiene que desaparecer del calendario sin que
  // el piloto refresque a mano.
  revalidatePath("/dashboard/calendario");
}
