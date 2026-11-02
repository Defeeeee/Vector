import Link from "next/link";
import { Wallet, ArrowRight } from "lucide-react";
import { pesos, type GastoDelPeriodo } from "@/lib/costos";

/**
 * "¿Cuánta plata me queda?", para quien lleva un saldo con la escuela.
 *
 * Reemplaza a `GastoDelMes`, que mostraba lo gastado en el mes pero no el saldo: el
 * número que un alumno mira antes de reservar el próximo turno estaba sólo adentro de
 * Balance. Ahora el saldo es lo grande y lo del mes va debajo, como contexto.
 *
 * Quien lleva packs de horas no ve esto: su "cuánto me queda" son horas, y lo contesta
 * `FlightPackWidget`. La página decide cuál de los dos va, según `tracking_mode`.
 *
 * **No aparece si no hay nada que decir**, y quien la dibuja se ocupa de eso: sin
 * movimientos —o con la consulta de transacciones caída— el saldo llega en cero, y
 * "$ 0" se leería como "no tenés plata" cuando lo cierto es "no lo sabemos".
 */
export default function SaldoCard({ saldo, gasto }: { saldo: number; gasto: GastoDelPeriodo }) {
  const enContra = saldo < 0;
  // Del gasto y las horas, no de `cost_per_hour`: es lo que efectivamente se pagó
  // este mes, promediando aeronaves distintas si volaste varias.
  const porHora = gasto.horas > 0 ? gasto.pesos / gasto.horas : null;

  return (
    <Link
      href="/dashboard/balance"
      className="group flex flex-col sm:flex-row sm:items-center gap-4 rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 hover:shadow-lg dark:hover:bg-white/[0.04] transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center shrink-0">
        <Wallet className="w-4 h-4 text-white dark:text-zinc-900" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="eyebrow">{enContra ? "Saldo en contra" : "Saldo disponible"}</p>
        <p
          className={`data text-2xl md:text-3xl font-bold leading-none mt-1 ${
            enContra ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"
          }`}
        >
          {enContra ? "−" : ""}
          {pesos(Math.abs(saldo))}
        </p>
        {gasto.pesos > 0 && (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Este mes: <span className="data">{pesos(gasto.pesos)}</span> ·{" "}
            <span className="data">{gasto.vuelos}</span> {gasto.vuelos === 1 ? "vuelo" : "vuelos"} ·{" "}
            <span className="data">{gasto.horas.toFixed(1)}</span> hs
            {porHora !== null && (
              <>
                {" · "}
                <span className="data">{pesos(porHora)}</span> la hora
              </>
            )}
          </p>
        )}
      </div>

      <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0">
        Ver balance
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
