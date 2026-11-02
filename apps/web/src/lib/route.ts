/**
 * Lectura del campo `route` de un vuelo.
 *
 * Es texto libre en la base y convive en tres formatos, todos legítimos porque
 * se fueron guardando en distintas épocas y por distintas puertas:
 *
 *   "SADF SADM"   — lo que escribe el formulario hoy, y el copiloto desde el
 *                   plan 07 (canonicalizado, separador espacio)
 *   "SADF-SADM"   — formato viejo, y lo que todavía tipea un piloto a mano
 *   "SADF"        — circuito local: un solo código
 *
 * Esta función estaba escrita **cinco veces** —`dashboard/page.tsx`,
 * `FlightCard.tsx`, `RecentFlights.tsx`, `FlightLogForm.tsx` y `summary.ts`— con
 * cuatro criterios distintos para el borde. Ninguna estaba mal, pero la próxima
 * que alguien tocara iba a divergir de las otras cuatro.
 */

/**
 * Separa una ruta en origen y destino.
 *
 * `fallback` es lo que se devuelve cuando falta un extremo, y es un parámetro
 * porque las dos respuestas son correctas según quién pregunte: una pantalla
 * quiere mostrar `"???"` y una agregación quiere `""` para poder descartarlo.
 *
 * Un circuito local —un solo código— devuelve el `fallback` como destino, **no
 * repite el origen**. Repetirlo tiene sentido para prefijar el formulario, y por
 * eso `FlightLogForm` lo hace en su propia llamada; hacerlo acá haría que las
 * agregaciones contaran ese aeródromo dos veces y que un vuelo local apareciera
 * como travesía consigo mismo.
 */
export function splitRoute(route: string | undefined, fallback = ""): [string, string] {
  const raw = (route ?? "").trim();
  if (!raw) return [fallback, fallback];

  const parts = raw
    .split(/[\s-]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  return [parts[0] || fallback, parts[1] || fallback];
}
