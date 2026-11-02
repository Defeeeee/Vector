import { TrendingUp } from "lucide-react";
import { pesos, type PrecioMensual } from "@/lib/costos";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Lo que costó la hora, mes a mes.
 *
 * Una serie que ningún piloto tiene en ningún lado y que sale gratis: cada
 * transacción guardó el precio **del día en que se voló**, así que esto muestra los
 * aumentos reales de la escuela y no el precio de hoy proyectado hacia atrás.
 *
 * SVG a mano y no la librería de gráficos: `GraficosDeHoras` se carga en diferido
 * en el Resumen justamente para no pagarla en el primer paint, y traerla a la
 * pantalla de saldo para dibujar seis puntos sería pagarla de nuevo.
 *
 * Las coordenadas se redondean antes de entrar al `path`: la aritmética de floats
 * serializa distinto en Node y en Chrome, y eso es un desajuste de hidratación. Este
 * repo ya lo pagó con el dial del resumen.
 */
export default function PrecioHoraChart({ serie }: { serie: PrecioMensual[] }) {
  // Con un solo punto no hay línea que dibujar ni tendencia que mostrar: una
  // "evolución" de un mes es un número, y ese número ya está en otras pantallas.
  if (serie.length < 2) return null;

  const puntos = serie.slice(-12);
  const valores = puntos.map((p) => p.porHora);
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  // Rango cero —el precio nunca cambió— dividiría por cero. Se dibuja plano.
  const rango = max - min || 1;

  const w = 100;
  const h = 32;
  const paso = w / (puntos.length - 1);
  const y = (v: number) => (h - ((v - min) / rango) * h).toFixed(2);
  const d = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * paso).toFixed(2)} ${y(p.porHora)}`).join(" ");

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const variacion = primero.porHora > 0
    ? ((ultimo.porHora - primero.porHora) / primero.porHora) * 100
    : 0;

  const etiqueta = (p: PrecioMensual) => {
    const [y2, m] = p.mes.split("-");
    return `${MESES[Number(m) - 1]} ${y2.slice(2)}`;
  };

  return (
    <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div>
          <p className="eyebrow">Lo que te sale la hora</p>
          <p className="data text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white leading-none mt-1">
            {pesos(ultimo.porHora)}
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            {etiqueta(ultimo)} · desde {etiqueta(primero)}{" "}
            {/* El signo importa: una baja de precio es noticia tanto como una suba. */}
            <span className={variacion >= 0 ? "text-amber-600 dark:text-amber-500" : "text-emerald-600 dark:text-emerald-500"}>
              {variacion >= 0 ? "+" : ""}{variacion.toFixed(0)}%
            </span>
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-20" aria-hidden="true">
        <path d={d} fill="none" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-aviation-blue-dark dark:stroke-aviation-cyan" />
      </svg>

      <div className="flex justify-between text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
        <span>{etiqueta(primero)} · <span className="data">{pesos(primero.porHora)}</span></span>
        <span>{etiqueta(ultimo)} · <span className="data">{pesos(ultimo.porHora)}</span></span>
      </div>
    </div>
  );
}
