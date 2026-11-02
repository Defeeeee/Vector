"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine
} from "recharts";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { HorasDelMes, PuntoAcumulado } from "@/lib/tendencia";

/**
 * "Horas por mes" y "Horas acumuladas", en el Resumen.
 *
 * Vivían en el inicio como `DashboardCharts`, con una torta de horas por aeronave al
 * lado. La torta no vino: el Resumen ya tiene "Por aeronave", con vuelos, horas PIC
 * y totales por matrícula, y dos gráficos de lo mismo en una pantalla son uno de más.
 *
 * Las series llegan armadas desde el server (`src/lib/tendencia.ts`), así que acá no
 * se hace ninguna cuenta con fechas.
 */
interface GraficosDeHorasProps {
  monthlyData: HorasDelMes[];
  cumulativeData: PuntoAcumulado[];
}

export default function GraficosDeHoras({ monthlyData, cumulativeData }: GraficosDeHorasProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";
  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const barColor = isDark ? "#38bdf8" : "#2563eb";
  const tooltipBg = isDark ? "#0a0a0a" : "#ffffff";
  const tooltipBorder = isDark ? "#27272a" : "#e4e4e7";
  const tooltipTextColor = isDark ? "#ffffff" : "#18181b";
  const areaColor = isDark ? "#38bdf8" : "#2563eb";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(24,24,27,0.05)";

  // Milestone reference lines at round hour thresholds
  const maxTotal = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].total : 0;
  const milestones = [50, 100, 150, 200, 300, 500, 750, 1000].filter(m => m <= maxTotal * 1.1 && m >= maxTotal * 0.1);

  // Con un solo mes no hay curva que dibujar; el de barras ocupa el ancho entero.
  const conCurva = cumulativeData.length > 1;
  const grilla = `grid grid-cols-1 ${conCurva ? "lg:grid-cols-2" : ""} gap-6 w-full`;

  const CustomCumulativeTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 12, padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <p style={{ color: textColor, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{d.date}</p>
        <p style={{ color: tooltipTextColor, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{d.total.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 500, marginLeft: 4, color: textColor }}>hs acum.</span></p>
        {d.monthHours > 0 && <p style={{ color: textColor, fontSize: 12, fontWeight: 500, marginTop: 4 }}>+{d.monthHours.toFixed(1)} este mes</p>}
      </div>
    );
  };

  if (!mounted) {
    return (
      <div className={grilla}>
        <div className="p-8 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] h-[420px]" />
        {conCurva && <div className="p-8 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] h-[420px]" />}
      </div>
    );
  }

  return (
    <div className={grilla}>
      {/* Bar Chart: Flight Hours by Month */}
      <div className="p-8 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] flex flex-col space-y-8 h-[420px] shadow-cal hover:shadow-lg dark:hover:bg-white/[0.04] transition-all group">
        <div className="flex flex-col space-y-1">
          <h3 className="text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Horas por mes</h3>
          <p className="eyebrow">Los últimos seis meses</p>
        </div>
        <div className="flex-1 w-full -ml-4 min-h-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: textColor, fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: textColor, fontSize: 12, fontWeight: 500 }}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(24,24,27,0.03)' }}
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: '12px',
                  padding: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: tooltipTextColor, fontWeight: 700, fontSize: '13px' }}
                labelStyle={{ color: textColor, marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}
              />
              <Bar
                dataKey="hours"
                fill={barColor}
                radius={[6, 6, 0, 0]}
                barSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cumulative Hours Area Chart */}
      {conCurva && (
        <div className="p-8 bg-zinc-900 dark:bg-[#111111] border border-zinc-800 dark:border-white/10 rounded-[2.5rem] flex flex-col space-y-8 h-[420px] shadow-2xl hover:shadow-lg transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-aviation-blue/10 rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none transition-transform group-hover:scale-110" />
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 relative z-10">
            <div className="flex flex-col space-y-1">
              <h3 className="text-2xl font-bold font-display text-white tracking-tight">Horas acumuladas</h3>
              <p className="eyebrow eyebrow-invert">Progresión total de experiencia</p>
            </div>
            {/* `whitespace-nowrap`: a media pantalla la tarjeta es angosta, y "hs
                totales" se partía en dos renglones debajo del número. */}
            <div className="flex items-baseline space-x-2 whitespace-nowrap shrink-0">
              <span className="text-4xl font-display font-bold text-white tracking-tight leading-none">{maxTotal.toFixed(1)}</span>
              <span className="text-sm font-medium text-zinc-500">hs totales</span>
            </div>
          </div>
          <div className="flex-1 w-full -ml-2 min-h-0 relative z-10">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={areaColor} stopOpacity={isDark ? 0.25 : 0.15} />
                    <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11, fontWeight: 500 }}
                  dy={10}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11, fontWeight: 500 }}
                  tickFormatter={(v) => `${v}h`}
                  width={40}
                />
                {milestones.map(m => (
                  <ReferenceLine
                    key={m}
                    y={m}
                    stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(24,24,27,0.1)"}
                    strokeDasharray="4 4"
                    label={{ value: `${m}h`, fill: "#71717a", fontSize: 11, fontWeight: 500, position: 'insideTopRight', dy: -6 }}
                  />
                ))}
                <Tooltip content={<CustomCumulativeTooltip />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(24,24,27,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#cumulativeGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: areaColor, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
