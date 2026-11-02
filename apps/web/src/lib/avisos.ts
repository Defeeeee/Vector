/**
 * La cola de avisos de "esto se guardó", separada del componente que la dibuja.
 *
 * ## Por qué existe
 *
 * Ninguna mutación de esta app confirma que salió bien. Cargar un vuelo, editar una
 * aeronave, guardar un documento — todas devuelven `{success}` o cierran un modal, y
 * el único indicio de que algo pasó es que la lista cambió. El único parecido a una
 * confirmación en todo el repo es el puntito "Sincronizado" de `ProfileForm.tsx`, y
 * es local a esa pantalla.
 *
 * Esto no es un aviso para el alta de vuelo: es el mecanismo genérico, para que
 * cargar un vuelo, guardar una aeronave, un documento o un libro puedan usar el
 * mismo camino en vez de inventar cada uno el suyo.
 *
 * ## Por qué la cola vive acá y no en el componente
 *
 * `vitest` corre en `environment: "node"` — un componente no se puede testear, la
 * cola sí. Es la misma jugada que `briefing.ts`, `pca-progress.ts` y el resto: el
 * criterio con consecuencia sale del `.tsx` donde no se puede probar.
 *
 * ## El texto de cada aviso no vive acá, a propósito
 *
 * Este módulo no sabe qué es un vuelo ni una aeronave — sólo mueve `Aviso`, con un
 * título y un detalle que ya vienen armados. Construir el texto (`"Vuelo cargado —
 * SADF → SAAK · 1.2 h · LV-S114"`) es trabajo de quien conoce el dominio —
 * `FlightLogForm`, el día de mañana `AircraftForm`— porque cada mutación tiene sus
 * propios datos y su propia forma de contarlos. Meterlo acá sería atar la cola a
 * los vuelos, justo lo que la hace reusable para todo lo demás.
 */

export type TipoAviso = "exito" | "error";

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  /** Una línea con los datos de lo que se guardó. Opcional: no todo aviso los tiene. */
  detalle?: string;
}

/**
 * Cuánto queda un aviso en pantalla antes de irse solo, por tipo.
 *
 * Un error tarda más: hay que leerlo y decidir algo, no sólo confirmar de reojo que
 * salió bien. Un éxito que se queda tanto como un error estorbaría sin necesidad.
 */
export const DURACION_MS: Record<TipoAviso, number> = {
  exito: 5000,
  error: 8000,
};

/**
 * Cuántos avisos se muestran a la vez.
 *
 * El resto queda en la cola sin dibujarse, y sale solo a medida que los de arriba se
 * van — no hace falta rotarlos a mano: `visibles` siempre devuelve los primeros `n`
 * de lo que quede en la cola.
 */
export const TOPE_VISIBLES = 3;

/** Suma un aviso al final de la cola. El `id` lo trae quien lo crea. */
export function agregarAviso(cola: Aviso[], nuevo: Aviso): Aviso[] {
  return [...cola, nuevo];
}

/** Saca un aviso por id. Uno que ya no está no es un error: sólo no hace nada. */
export function quitarAviso(cola: Aviso[], id: string): Aviso[] {
  return cola.filter((a) => a.id !== id);
}

/** Los que corresponde dibujar ahora mismo — los primeros `tope` de la cola. */
export function visibles(cola: Aviso[], tope: number = TOPE_VISIBLES): Aviso[] {
  return cola.slice(0, tope);
}
