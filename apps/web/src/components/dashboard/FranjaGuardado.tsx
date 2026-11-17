import { franjaDeGuardado, type CausaGuardado, type DatoViejo } from "@/lib/dato-guardado";

/**
 * La franja ámbar de arriba de un dato que sale de lo guardado y no de la red (3.46.0,
 * `lib/dato-guardado.ts`): "SIN SEÑAL · METAR observado a las 14:20 (hace 3 h 40 min): no sirve
 * para decidir el vuelo".
 *
 * **Sólo se monta con datos que llegaron por un pedido desde el navegador** (nunca en el HTML que
 * dibuja el server), así que `Date.now()` no puede desfasar la hidratación (invariante 1).
 */
export default function FranjaGuardado({
  dato,
  observadoEn,
  capturadoEn,
  causa,
}: {
  dato: DatoViejo;
  observadoEn?: Date | string | null;
  capturadoEn?: string | null;
  causa?: CausaGuardado;
}) {
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 font-mono text-[11px] font-semibold leading-relaxed text-amber-300"
    >
      {franjaDeGuardado({ dato, observadoEn, capturadoEn, causa, ahoraMs: Date.now() })}
    </p>
  );
}
