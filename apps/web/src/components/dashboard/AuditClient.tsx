"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, BellOff, CheckCircle2, Copy, EyeOff, Loader2, Plane, RefreshCw, Scale, ShieldAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { AuditFinding, AuditRuleType, AuditSummary, Flight } from "@/types";
import { recalculateAudit, suppressFinding, unsuppressFinding } from "@/actions/audit";

const RULE_META: Record<AuditRuleType, { label: string; icon: typeof Copy; hint: string }> = {
  overlap: {
    label: "Superposición",
    icon: Scale,
    hint: "Dos vuelos que comparten horario. Uno de los dos tiene los tiempos mal cargados.",
  },
  duplicate: {
    label: "Duplicado",
    icon: Copy,
    hint: "El mismo vuelo cargado más de una vez, normalmente por una importación repetida.",
  },
  unregistered_aircraft: {
    label: "Aeronave sin registrar",
    icon: Plane,
    hint: "El vuelo apunta a una matrícula que no está en el Hangar.",
  },
  inconsistent_total: {
    label: "Total inconsistente",
    icon: AlertTriangle,
    hint: "El desglose PIC/SIC no coincide con la duración del vuelo.",
  },
};

type Tab = "open" | "critical" | "warning" | "suppressed";

export default function AuditClient({
  summary,
  findings,
  flights,
  lastRunLabel,
}: {
  summary: AuditSummary;
  findings: AuditFinding[];
  flights: Flight[];
  /**
   * Pre-formatted on the server on purpose.
   *
   * Formatting the timestamp here instead would run `toLocaleString` twice —
   * once in Node during SSR and once in the browser — and the two ICU builds
   * disagree on the space before "p. m.", which React reports as a hydration
   * mismatch and re-renders the whole tree over.
   */
  lastRunLabel?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flightsById = useMemo(() => new Map(flights.map((f) => [f.id, f])), [flights]);

  const visible = useMemo(() => {
    const open = findings.filter((f) => !f.suppressed);
    if (tab === "open") return open;
    if (tab === "critical") return open.filter((f) => f.severity === "critical");
    if (tab === "warning") return open.filter((f) => f.severity === "warning");
    return findings.filter((f) => f.suppressed);
  }, [findings, tab]);

  const run = (id: string, action: () => Promise<{ error?: string; success?: boolean }>) => {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      setBusyId(null);
    });
  };

  const clean = summary.open_total === 0;
  const lastRun = lastRunLabel;

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Críticas" value={summary.critical} tone="critical" icon={ShieldAlert} active={tab === "critical"} onClick={() => setTab("critical")} />
        <StatCard label="Advertencias" value={summary.warning} tone="warning" icon={AlertTriangle} active={tab === "warning"} onClick={() => setTab("warning")} />
        <StatCard label="Suprimidas" value={summary.suppressed} tone="muted" icon={EyeOff} active={tab === "suppressed"} onClick={() => setTab("suppressed")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TabButton active={tab === "open"} onClick={() => setTab("open")}>
            Abiertas ({summary.open_total})
          </TabButton>
          <TabButton active={tab === "suppressed"} onClick={() => setTab("suppressed")}>
            Suprimidas ({summary.suppressed})
          </TabButton>
        </div>

        <div className="flex items-center gap-3">
          {lastRun && (
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Último análisis: {lastRun}</span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run("recalc", recalculateAudit)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {pending && busyId === "recalc" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Reanalizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState clean={clean} tab={tab} hasFindings={findings.length > 0} />
      ) : (
        <div className="space-y-3">
          {visible.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              flight={finding.flight_id ? flightsById.get(finding.flight_id) : undefined}
              busy={pending && busyId === finding.id}
              onSuppress={() => run(finding.id, () => suppressFinding(finding.id))}
              onRestore={() => run(finding.id, () => unsuppressFinding(finding.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A counter that also says *what kind* of problem it counts.
 *
 * The icon carries the severity on its own, so the three cards stay
 * distinguishable at a glance instead of reading as three identical numbers —
 * and it keeps working for anyone who can't separate the red from the amber.
 * Muted whenever the count is zero: a red shield over a "0" reads as alarm
 * where there is none.
 */
function StatCard({
  label,
  value,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "muted";
  icon: typeof ShieldAlert;
  active: boolean;
  onClick: () => void;
}) {
  const lit = tone !== "muted" && value > 0;

  const valueClasses = {
    critical: lit ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white",
    warning: lit ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-white",
    muted: "text-zinc-400 dark:text-zinc-500",
  }[tone];

  const badgeClasses = lit
    ? {
        critical: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
        warning: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
        muted: "",
      }[tone]
    : "bg-zinc-100 dark:bg-white/5 text-zinc-400 dark:text-zinc-500";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left bg-white dark:bg-white/[0.02] p-6 rounded-[2rem] border shadow-cal dark:shadow-none transition-all ${
        active
          ? "border-zinc-900 dark:border-white"
          : "border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${badgeClasses}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      </div>
      <p className={`mt-3 text-4xl font-bold data leading-none ${valueClasses}`}>{value}</p>
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-xs font-bold border transition-colors ${
        active
          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
          : "bg-white dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:text-zinc-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function FindingCard({
  finding,
  flight,
  busy,
  onSuppress,
  onRestore,
}: {
  finding: AuditFinding;
  flight?: Flight;
  busy: boolean;
  onSuppress: () => void;
  onRestore: () => void;
}) {
  const meta = RULE_META[finding.rule_type];
  const Icon = meta?.icon ?? AlertTriangle;
  const critical = finding.severity === "critical";

  return (
    <div
      className={`bg-white dark:bg-white/[0.02] rounded-[2rem] border shadow-cal dark:shadow-none p-5 md:p-6 transition-all ${
        finding.suppressed
          ? "border-zinc-200 dark:border-white/10 opacity-60"
          : critical
            ? "border-red-200 dark:border-red-500/20"
            : "border-amber-200 dark:border-amber-500/20"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${
            finding.suppressed
              ? "bg-zinc-100 dark:bg-white/5 text-zinc-400 dark:text-zinc-500"
              : critical
                ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-zinc-900 dark:text-white">{meta?.label ?? finding.rule_type}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                critical
                  ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400"
                  : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
              }`}
            >
              {critical ? "Crítica" : "Advertencia"}
            </span>
            {finding.suppressed && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400">
                Suprimida
              </span>
            )}
          </div>

          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 leading-relaxed">{finding.message}</p>

          {flight && (
            <Link
              href="/dashboard/history"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-aviation-blue dark:text-aviation-cyan hover:opacity-70 transition-opacity"
            >
              Ver en la bitácora · {flight.route} · {flight.duration?.toFixed(1)} h
            </Link>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={finding.suppressed ? onRestore : onSuppress}
          title={finding.suppressed ? "Volver a mostrar" : "Silenciar este hallazgo"}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : finding.suppressed ? (
            <Undo2 className="w-3.5 h-3.5" />
          ) : (
            <BellOff className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{finding.suppressed ? "Restaurar" : "Silenciar"}</span>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ clean, tab, hasFindings }: { clean: boolean; tab: Tab; hasFindings: boolean }) {
  if (tab === "suppressed") {
    return (
      <Panel title="No hay hallazgos suprimidos">
        Cuando silencies uno porque el vuelo está bien cargado, va a aparecer acá.
      </Panel>
    );
  }

  if (clean && !hasFindings) {
    return (
      <div className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-emerald-200 dark:border-emerald-500/20 shadow-cal dark:shadow-none p-10 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold font-display text-zinc-900 dark:text-white">
          El libro cierra sin observaciones
        </h3>
        <p className="mt-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
          Ninguna regla encontró superposiciones, duplicados, aeronaves sin registrar ni totales que
          no cierren. Si nunca corriste el análisis, tocá <strong>Reanalizar</strong>.
        </p>
      </div>
    );
  }

  return <Panel title="Nada en esta categoría">Probá con otra pestaña o reanalizá el libro.</Panel>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-dashed border-zinc-200 dark:border-white/10 p-10 text-center">
      <h3 className="text-base font-bold text-zinc-900 dark:text-white">{title}</h3>
      <p className="mt-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">{children}</p>
    </div>
  );
}
