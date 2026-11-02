"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Los gráficos del panel de administración. Las series llegan con la etiqueta ya
 * escrita desde el server (`lib/admin.ts`): acá no se hace ninguna cuenta con fechas.
 */

function usePaleta() {
  const { theme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const oscuro = montado && theme === "dark";
  return {
    texto: oscuro ? "#a1a1aa" : "#71717a",
    principal: oscuro ? "#38bdf8" : "#2563eb",
    secundario: oscuro ? "#10b981" : "#059669",
    tenue: oscuro ? "rgba(255,255,255,0.08)" : "rgba(24,24,27,0.08)",
    grilla: oscuro ? "rgba(255,255,255,0.05)" : "rgba(24,24,27,0.05)",
    fondoTooltip: oscuro ? "#0a0a0a" : "#ffffff",
    bordeTooltip: oscuro ? "#27272a" : "#e4e4e7",
    textoTooltip: oscuro ? "#ffffff" : "#18181b",
    torta: oscuro
      ? ["#38bdf8", "#10b981", "#f59e0b", "#a78bfa", "#f472b6", "#71717a"]
      : ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#a1a1aa"],
  };
}

function estiloTooltip(p: ReturnType<typeof usePaleta>) {
  return {
    contentStyle: { background: p.fondoTooltip, border: `1px solid ${p.bordeTooltip}`, borderRadius: 12, fontSize: 12 },
    labelStyle: { color: p.textoTooltip, fontWeight: 700 },
    itemStyle: { color: p.textoTooltip },
    cursor: { fill: p.tenue },
  };
}

const eje = (color: string) => ({ tick: { fill: color, fontSize: 11 }, axisLine: false, tickLine: false });

/** Altas por día (barras) y cuentas acumuladas (línea, eje derecho). */
export function GraficoAltas({ datos }: { datos: { etiqueta: string; altas: number; acumulado: number }[] }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={p.grilla} vertical={false} />
        <XAxis dataKey="etiqueta" {...eje(p.texto)} interval={6} />
        <YAxis yAxisId="altas" allowDecimals={false} {...eje(p.texto)} />
        <YAxis yAxisId="total" orientation="right" allowDecimals={false} {...eje(p.texto)} />
        <Tooltip {...estiloTooltip(p)} />
        <Bar yAxisId="altas" dataKey="altas" name="Altas" fill={p.principal} radius={[6, 6, 0, 0]} maxBarSize={18} />
        <Line yAxisId="total" dataKey="acumulado" name="Cuentas" stroke={p.secundario} strokeWidth={2.5} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontales: activación, uso de funciones, último ingreso. */
export function GraficoBarras({
  datos,
  alto,
  sufijo,
}: {
  datos: { nombre: string; valor: number; nota?: string }[];
  alto?: number;
  sufijo?: string;
}) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={alto ?? Math.max(160, datos.length * 38)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="nombre" width={160} {...eje(p.texto)} />
        <Tooltip {...estiloTooltip(p)} formatter={(v, _n, item) => [`${v}${sufijo ?? ""}${item.payload.nota ? ` · ${item.payload.nota}` : ""}`, "Cuentas"]} />
        <Bar
          dataKey="valor"
          fill={p.principal}
          radius={[0, 6, 6, 0]}
          maxBarSize={22}
          background={{ fill: p.tenue, radius: 6 }}
          label={{ position: "right", fill: p.texto, fontSize: 11, formatter: (v: unknown) => String(v) }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vuelos cargados por mes: horas (barras) y pilotos distintos (línea). */
export function GraficoVuelosPorMes({ datos }: { datos: { etiqueta: string; horas: number; vuelos: number; pilotos: number }[] }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={datos} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={p.grilla} vertical={false} />
        <XAxis dataKey="etiqueta" {...eje(p.texto)} />
        <YAxis yAxisId="horas" {...eje(p.texto)} />
        <YAxis yAxisId="pilotos" orientation="right" allowDecimals={false} {...eje(p.texto)} />
        <Tooltip {...estiloTooltip(p)} />
        <Bar yAxisId="horas" dataKey="horas" name="Horas" fill={p.principal} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Line yAxisId="pilotos" dataKey="pilotos" name="Pilotos" stroke={p.secundario} strokeWidth={2.5} type="monotone" dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Mails por día: lo que salió, lo que se abrió y lo que tuvo clic. */
export function GraficoMailsPorDia({ datos }: { datos: { etiqueta: string; enviados: number; abiertos: number; clics: number }[] }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={datos} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={p.grilla} vertical={false} />
        <XAxis dataKey="etiqueta" {...eje(p.texto)} interval={3} />
        <YAxis allowDecimals={false} {...eje(p.texto)} />
        <Tooltip {...estiloTooltip(p)} />
        <Bar dataKey="enviados" name="Enviados" fill={p.tenue} radius={[5, 5, 0, 0]} maxBarSize={14} />
        <Bar dataKey="abiertos" name="Abiertos" fill={p.principal} radius={[5, 5, 0, 0]} maxBarSize={14} />
        <Bar dataKey="clics" name="Con clic" fill={p.secundario} radius={[5, 5, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A qué hora se abren los mails, en hora argentina. */
export function GraficoHoras({ datos }: { datos: { etiqueta: string; aperturas: number }[] }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={p.grilla} vertical={false} />
        <XAxis dataKey="etiqueta" {...eje(p.texto)} interval={2} />
        <YAxis allowDecimals={false} {...eje(p.texto)} />
        <Tooltip {...estiloTooltip(p)} />
        <Bar dataKey="aperturas" name="Mails abiertos" fill={p.principal} radius={[5, 5, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Licencias, en anillo. */
export function GraficoLicencias({ datos }: { datos: { licencia: string; cuentas: number }[] }) {
  const p = usePaleta();
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="w-[180px] h-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...estiloTooltip(p)} />
            <Pie data={datos} dataKey="cuentas" nameKey="licencia" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
              {datos.map((_, i) => (
                <Cell key={i} fill={p.torta[i % p.torta.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 w-full">
        {datos.map((d, i) => (
          <li key={d.licencia} className="flex items-center gap-3 text-sm">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.torta[i % p.torta.length] }} />
            <span className="text-zinc-700 dark:text-zinc-300 flex-1">{d.licencia}</span>
            <span className="data font-bold text-zinc-900 dark:text-white">{d.cuentas}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
