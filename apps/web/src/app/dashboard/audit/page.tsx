import { apiFetch } from "@/lib/api";
import { AuditFinding, AuditSummary, Flight } from "@/types";
import PageHeader from "@/components/dashboard/PageHeader";
import AuditClient from "@/components/dashboard/AuditClient";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Auditoría | Vector",
};

async function getAuditData() {
  const [summaryRes, findingsRes, flightsRes] = await Promise.all([
    apiFetch("/audit/summary"),
    // Suppressed findings come down too — the page has a tab for them, and
    // fetching them separately on demand would mean a second round trip for a
    // list that is at most a handful of rows.
    apiFetch("/audit/findings?include_suppressed=true"),
    apiFetch("/flights"),
  ]);

  if (summaryRes.status === 401 || findingsRes.status === 401) {
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  const summary: AuditSummary = summaryRes.ok
    ? await summaryRes.json()
    : { critical: 0, warning: 0, suppressed: 0, open_total: 0, by_rule: {} };
  const findings: AuditFinding[] = findingsRes.ok ? await findingsRes.json() : [];
  const flights: Flight[] = flightsRes.ok ? await flightsRes.json() : [];

  return { summary, findings, flights };
}

export default async function AuditPage() {
  const { summary, findings, flights } = await getAuditData();

  // Formatted here rather than in the client component: Node's and Chrome's ICU
  // data disagree on the spacing around "p. m.", which shows up as a hydration
  // mismatch if both sides format the same timestamp independently.
  const lastRunLabel = summary.last_recalculated_at
    ? new Date(summary.last_recalculated_at).toLocaleString("es-AR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <PageHeader eyebrow="Consistencia del libro de vuelo" title="Auditoría" />
      <AuditClient summary={summary} findings={findings} flights={flights} lastRunLabel={lastRunLabel} />
    </div>
  );
}
