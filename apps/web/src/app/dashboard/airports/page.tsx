import { apiFetch } from "@/lib/api";
import { Aircraft, Flight } from "@/types";
import { redirect } from "next/navigation";
import PageHeader from "@/components/dashboard/PageHeader";
import AirportsClient, { AirportHistory } from "@/components/dashboard/AirportsClient";
import { splitRoute } from "@/lib/summary";
import { soloVolados } from "@/lib/simulador";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Lo volado, sin las sesiones de simulador.
 *
 * El filtro no es cosmético. La ruta de un simulador dice `LOCAL`, que no es un
 * aeródromo: sin sacarla, esta pantalla lo listaría como un destino con visitas, cero
 * horas y cero aterrizajes, y quedaría ahí para siempre. Es el mismo aeródromo
 * fantasma contra el que el formulario de vuelo valida los códigos de cuatro letras.
 */
async function getDashboardData(): Promise<{ flights: Flight[]; jeppesenAccess: boolean }> {
  const response = await apiFetch("/dashboard");

  if (response.status === 401) {
    console.log("AirportsPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  if (!response.ok) return { flights: [], jeppesenAccess: false };

  const data = await response.json();
  return {
    flights: soloVolados((data.flights || []) as Flight[], (data.aircraft || []) as Aircraft[]),
    jeppesenAccess: Boolean(data.profile?.jeppesen_access),
  };
}

/**
 * What the pilot has actually flown at each aerodrome.
 *
 * Computed here rather than in the client for two reasons: the flight list never
 * has to cross the wire twice, and the "last visit" date gets formatted on the
 * server — the repo has already paid for two hydration bugs from formatting
 * dates in a client component.
 */
function buildHistory(flights: Flight[]): Record<string, AirportHistory> {
  const acc: Record<string, AirportHistory & { lastIso: string }> = {};

  const touch = (icao: string, f: Flight, role: "origin" | "destination") => {
    if (!icao || icao === "???") return;
    const cur =
      acc[icao] ??
      (acc[icao] = {
        visits: 0, hours: 0, landings: 0,
        lastVisit: null, lastIso: "", asOrigin: 0, asDestination: 0,
      });

    // A local circuit has the same code on both ends. Counting it twice would
    // report double the visits for exactly the aerodrome a pilot flies most.
    const [o, d] = splitRoute(f.route);
    const sameBothEnds = o === d;
    if (role === "origin" || !sameBothEnds) {
      cur.visits += 1;
      cur.hours += f.duration || 0;
      cur.landings += f.landings || 0;
      if (f.date > cur.lastIso) cur.lastIso = f.date;
    }
    if (role === "origin") cur.asOrigin += 1;
    else cur.asDestination += 1;
  };

  for (const f of flights) {
    const [origin, destination] = splitRoute(f.route);
    touch(origin, f, "origin");
    touch(destination, f, "destination");
  }

  const out: Record<string, AirportHistory> = {};
  for (const [icao, v] of Object.entries(acc)) {
    const [y, m, d] = v.lastIso.split("-");
    out[icao] = {
      visits: v.visits,
      hours: v.hours,
      landings: v.landings,
      asOrigin: v.asOrigin,
      asDestination: v.asDestination,
      lastVisit: v.lastIso ? `${d} ${MONTHS[Number(m) - 1]} ${y}` : null,
    };
  }
  return out;
}

export default async function AirportsPage({ searchParams }: { searchParams: Promise<{ icao?: string }> }) {
  const [{ flights, jeppesenAccess }, { icao }] = await Promise.all([getDashboardData(), searchParams]);
  const history = buildHistory(flights);

  // Abre en el que pidió el buscador (`?icao=`) y, si no, en el que el piloto más usa:
  // casi siempre su aeródromo de base.
  const pedido = icao?.trim().toUpperCase();
  const initialIcao =
    (pedido && /^[A-Z0-9]{3,4}$/.test(pedido) ? pedido : null) ??
    Object.entries(history).sort((a, b) => b[1].visits - a[1].visits)[0]?.[0] ??
    null;

  return (
    <div className="space-y-8 md:space-y-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        eyebrow="Ficha, clima y tu historial en cada aeródromo"
        title="Aeropuertos"
      />
      <AirportsClient history={history} initialIcao={initialIcao} jeppesenAccess={jeppesenAccess} />
    </div>
  );
}
