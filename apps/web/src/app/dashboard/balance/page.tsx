import { apiFetch } from "@/lib/api";
import { Aircraft, Profile, FlightPack, Transaction, Flight } from "@/types";
import BalanceClient from "@/components/dashboard/BalanceClient";
import BackfillCobros from "@/components/dashboard/BackfillCobros";
import PrecioHoraChart from "@/components/dashboard/PrecioHoraChart";
import { costosPorVuelo, precioPorMes } from "@/lib/costos";
import { previewBackfillCobros } from "@/actions/balance";
import { redirect } from "next/navigation";

async function getBalanceData() {
  const response = await apiFetch("/dashboard");

  if (response.status === 401) {
    console.log("BalancePage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  if (!response.ok) {
    return { 
      profile: null, 
      aircraft: [], 
      packs: [], 
      transactions: [], 
      balance: 0,
      flights: []
    };
  }

  const data = await response.json();
  return {
    profile: (data.profile || null) as Profile | null,
    aircraft: (data.aircraft || []) as Aircraft[],
    packs: (data.packs || []) as FlightPack[],
    transactions: (data.transactions || []) as Transaction[],
    balance: (data.balance || 0) as number,
    flights: (data.flights || []) as Flight[]
  };
}

export default async function BalancePage() {
  const [{ profile, aircraft, packs, transactions, balance, flights }, backfill] =
    await Promise.all([getBalanceData(), previewBackfillCobros()]);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Arriba del saldo a propósito: es una corrección de lo que el resto de la
          pantalla muestra, así que verla después sería enterarse tarde. */}
      {backfill.aplicable && (
        <BackfillCobros vuelos={backfill.vuelos} total={backfill.total} />
      )}

      {/* El precio histórico de la hora, del propio registro de cobros. Se dibuja
          solo cuando hay al menos dos meses con datos. */}
      <PrecioHoraChart serie={precioPorMes(flights, costosPorVuelo(transactions))} />

    <BalanceClient
      profile={profile}
      aircraft={aircraft}
      packs={packs}
      initialTransactions={transactions}
      initialBalance={balance}
      flights={flights}
    />
    </div>
  );
}
