/**
 * De dónde salen los tiles de todos los mapas de la app: el Resumen, el Planificador y el
 * vuelo de una publicación.
 *
 * **Eran de Carto y dejaron de servir.** Para el 2026-09-22 todos sus estilos
 * (`rastertiles/voyager`, `light_all`, `dark_all`…) devolvían, sin API key, un tile con
 * la leyenda "API KEY REQUIRED" cruzada encima: el mapa se veía, pero tachado. Se
 * cambió a los tiles de OpenStreetMap, que no piden clave.
 *
 * **La atribución no es opcional**: la política de uso de OSM la exige visible en el
 * mapa. Por eso los mapas llevan el control de atribución, que antes estaba apagado.
 * La misma política pide no usarlos para descargas masivas; para el tráfico de Vector
 * sobra.
 */
export const TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILES_OPCIONES = {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
} as const;
