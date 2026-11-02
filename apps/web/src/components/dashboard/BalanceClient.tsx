"use client";

import { useState, useTransition } from "react";
import { Profile, Aircraft, FlightPack, Transaction, Flight } from "@/types";
import { toggleTrackingMode, depositBalance, updateAircraftCost, deleteTransactionAction } from "@/actions/balance";
import {
  Wallet, Coins,
  Plane, Package, Check, X, Edit2, Loader2, Plus,
  ChevronDown, ChevronUp, Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/dashboard/PageHeader";

interface BalanceClientProps {
  profile: Profile | null;
  aircraft: Aircraft[];
  packs: FlightPack[];
  initialTransactions: Transaction[];
  initialBalance: number;
  flights: Flight[];
}

export default function BalanceClient({
  profile,
  aircraft,
  packs,
  initialTransactions,
  initialBalance,
  flights,
}: BalanceClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDesc, setTopUpDesc] = useState("");
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const [topUpType, setTopUpType] = useState<"deposit" | "charge">("deposit");
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  
  // Rate Editing state
  const [editingAircraftId, setEditingAircraftId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState("");

  const trackingMode = profile?.tracking_mode || "packs";

  const handleToggleMode = (mode: "packs" | "balance") => {
    if (mode === trackingMode) return;
    startTransition(async () => {
      try {
        await toggleTrackingMode(profile?.id || "", mode);
      } catch (err: any) {
        alert(err.message || "Error al cambiar el modo");
      }
    });
  };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor ingresa un monto válido mayor a cero");
      return;
    }
    
    const finalAmount = topUpType === "deposit" ? amount : -amount;
    
    startTransition(async () => {
      try {
        await depositBalance(finalAmount, topUpDesc);
        setIsTopUpOpen(false);
        setTopUpAmount("");
        setTopUpDesc("");
      } catch (err: any) {
        alert(err.message || "Error al procesar la transacción");
      }
    });
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBalance = parseFloat(overrideAmount);
    if (isNaN(targetBalance)) {
      alert("Por favor ingresa un monto válido");
      return;
    }
    const difference = targetBalance - initialBalance;
    if (difference === 0) {
      setIsOverrideOpen(false);
      return;
    }
    
    startTransition(async () => {
      try {
        await depositBalance(difference, "Ajuste manual de saldo");
        setIsOverrideOpen(false);
        setOverrideAmount("");
      } catch (err: any) {
        alert(err.message || "Error al ajustar el saldo");
      }
    });
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este movimiento? Esto recalculará tu saldo.")) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteTransactionAction(id);
      } catch (err: any) {
        alert(err.message || "Error al eliminar movimiento");
      }
    });
  };

  const handleSaveRate = (aircraftId: string) => {
    const cost = parseFloat(editingCost);
    if (isNaN(cost) || cost < 0) {
      alert("Por favor ingresa un costo válido");
      return;
    }

    startTransition(async () => {
      try {
        await updateAircraftCost(aircraftId, cost);
        setEditingAircraftId(null);
        setEditingCost("");
      } catch (err: any) {
        alert(err.message || "Error al actualizar tarifa");
      }
    });
  };

  const balanceString = initialBalance.toLocaleString("es-AR", { 
    minimumFractionDigits: Math.abs(initialBalance) >= 1000000 ? 0 : 2,
    maximumFractionDigits: Math.abs(initialBalance) >= 1000000 ? 0 : 2
  });
  const balanceFontSize = balanceString.length > 12 
    ? "text-2xl md:text-3xl" 
    : balanceString.length > 8 
      ? "text-3xl md:text-4xl" 
      : "text-4xl md:text-5xl";

  return (
    <div className="space-y-8 md:space-y-12">
      {/* Mode Switcher Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <PageHeader eyebrow="Gestión financiera" title="Balance">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 pt-1">
            Administrá tus consumos de vuelo, saldos y packs de horas
          </p>
        </PageHeader>

        {/* Premium Tab Selector */}
        <div className="bg-zinc-100 dark:bg-white/5 p-1 rounded-2xl flex items-center border border-zinc-200 dark:border-white/10 relative w-full md:w-auto overflow-hidden self-start md:self-center">
          <button
            onClick={() => handleToggleMode("packs")}
            disabled={isPending}
            className="flex-1 md:flex-none relative px-6 py-3 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 z-10 transition-colors duration-300 disabled:opacity-50"
          >
            {trackingMode === "packs" && (
              <motion.div
                layoutId="nav-pill-bg"
                className="absolute inset-0 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-xl shadow-sm"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span className={`relative z-10 ${trackingMode === "packs" ? "text-aviation-blue-dark dark:text-aviation-cyan" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
              Packs de horas
            </span>
          </button>

          <button
            onClick={() => handleToggleMode("balance")}
            disabled={isPending}
            className="flex-1 md:flex-none relative px-6 py-3 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 z-10 transition-colors duration-300 disabled:opacity-50"
          >
            {trackingMode === "balance" && (
              <motion.div
                layoutId="nav-pill-bg"
                className="absolute inset-0 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-xl shadow-sm"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span className={`relative z-10 ${trackingMode === "balance" ? "text-aviation-blue-dark dark:text-aviation-cyan" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
              Saldo en cuenta ($)
            </span>
          </button>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center justify-center space-x-2 text-zinc-500 text-sm font-medium px-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-900 dark:text-white" />
          <span>Sincronizando estado...</span>
        </div>
      )}

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
        
        {/* Left / Center Area: Shows either Packs or Balance Transaction Log */}
        <div className="lg:col-span-2 space-y-8 md:space-y-10">
          
          {trackingMode === "packs" ? (
            <section className="space-y-6">
              <div className="flex items-center space-x-3 px-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center shadow-md">
                  <Package className="w-4 h-4 text-white dark:text-zinc-900" />
                </div>
                <h3 className="text-lg md:text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Packs activos</h3>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {packs.length > 0 ? (
                  packs.map((pack) => {
                    const isNegative = pack.remaining_hours < 0;
                    const progress = Math.max(0, Math.min((pack.remaining_hours / pack.total_hours) * 100, 100));
                    return (
                      <div 
                        key={pack.id} 
                        className="bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-3xl p-6 md:p-8 hover:shadow-md dark:hover:bg-white/[0.04] transition-all flex flex-col justify-between space-y-6"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                              Creado el {new Date(pack.created_at).toLocaleDateString("es-AR")}
                            </span>
                            <h4 className="text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight mt-1">
                              {pack.name}
                            </h4>
                          </div>
                          <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${pack.is_active ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'}`}>
                            {pack.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Horas restantes</span>
                            <span className={`text-2xl font-bold font-display ${isNegative ? 'text-red-600 dark:text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                              {pack.remaining_hours.toFixed(1)} <span className="text-xs font-bold text-zinc-400">/ {pack.total_hours.toFixed(1)} hs</span>
                            </span>
                          </div>
                          
                          <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 1 }}
                              className="h-full bg-aviation-blue dark:bg-aviation-cyan rounded-full"
                            />
                          </div>
                        </div>

                        <div className="border-t border-zinc-100 dark:border-white/5 pt-4 flex flex-col space-y-4">
                          <div>
                            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block mb-2">Aeronaves habilitadas</span>
                            <div className="flex flex-wrap gap-2">
                              {pack.aircraft_ids.map((aid) => {
                                const acft = aircraft.find(a => a.id === aid);
                                return (
                                  <span key={aid} className="text-xs font-medium bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/5 shadow-sm">
                                    {acft ? `${acft.registration} (${acft.icao})` : "Aeronave"}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* Consumptions History */}
                          {(() => {
                            const packFlights = flights.filter(f => 
                              f.aircraft_id && 
                              pack.aircraft_ids.includes(f.aircraft_id) && 
                              new Date(f.takeoff) >= new Date(pack.start_date)
                            ).sort((a, b) => new Date(b.takeoff).getTime() - new Date(a.takeoff).getTime());

                            const isExpanded = expandedPackId === pack.id;

                            return (
                              <div className="pt-2 border-t border-zinc-100/50 dark:border-white/5 flex flex-col w-full">
                                <button
                                  onClick={() => setExpandedPackId(isExpanded ? null : pack.id)}
                                  className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white flex items-center space-x-2 transition-colors self-start"
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  <span>Historial de consumo</span>
                                  <span className="bg-zinc-100 dark:bg-white/5 px-2 py-0.5 rounded-full text-[11px] text-zinc-400">
                                    {packFlights.length} {packFlights.length === 1 ? "vuelo" : "vuelos"}
                                  </span>
                                </button>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                      animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                      className="overflow-hidden space-y-2 w-full"
                                    >
                                      {packFlights.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                          {packFlights.map((f) => {
                                            const acft = aircraft.find(a => a.id === f.aircraft_id);
                                            return (
                                              <div key={f.id} className="flex justify-between items-center text-xs py-2 border-b border-zinc-100/50 dark:border-white/5 last:border-b-0">
                                                <div className="flex flex-col">
                                                  <span className="font-bold text-zinc-900 dark:text-white uppercase">{f.route}</span>
                                                  <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                                                    {new Date(f.date + 'T00:00:00').toLocaleDateString("es-AR")} • {acft?.registration}
                                                  </span>
                                                </div>
                                                <span className="font-bold text-zinc-500 dark:text-zinc-400 font-display">
                                                  -{f.duration.toFixed(1)} hs
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 text-center py-4">
                                          No hay vuelos registrados para este pack.
                                        </p>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })()}

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white dark:bg-white/[0.02] p-10 rounded-[2rem] text-center border border-dashed border-zinc-200 dark:border-white/10">
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">No hay packs de horas registrados aún.</p>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="space-y-8">
              
              {/* Account Balance Card */}
              <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-cal dark:shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all">
                <div className="flex items-center space-x-6">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-[1.25rem] bg-aviation-blue/10 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-aviation-blue-dark dark:text-aviation-cyan shadow-sm flex-shrink-0">
                    <Wallet className="w-7 h-7" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500 block leading-none">Saldo disponible</span>
                    <div className="flex items-center space-x-2">
                      <h3 className={`${balanceFontSize} font-display font-bold text-zinc-900 dark:text-white tracking-tighter leading-none pt-1`}>
                        $ {balanceString}
                      </h3>
                      <button
                        onClick={() => {
                          setOverrideAmount(String(initialBalance));
                          setIsOverrideOpen(true);
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                        title="Ajustar saldo directamente"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsTopUpOpen(true)}
                  className="w-full md:w-auto bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-8 py-4.5 rounded-xl shadow-cal-highlight dark:shadow-none hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center space-x-2"
                >
                  <Coins className="w-4 h-4" />
                  <span>Cargar saldo</span>
                </button>
              </div>

              {/* Transactions Ledger — receipt-tape style, not a card list */}
              <div className="space-y-6">
                <div className="flex items-center space-x-3 px-2">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center shadow-md">
                    <Coins className="w-4 h-4 text-white dark:text-zinc-900" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Historial de movimientos</h3>
                </div>

                <div className="max-w-lg mx-auto md:mx-0">
                  <ReceiptEdge />
                  <div className="bg-white dark:bg-[#111111] shadow-cal dark:shadow-none">
                    <div className="px-6 md:px-8 pt-6 pb-4 text-center border-b border-dashed border-zinc-300 dark:border-white/15">
                      <p className="font-mono text-[11px] tracking-[0.3em] text-zinc-400 dark:text-zinc-500">VECTOR AVIATION</p>
                      <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">Comprobante de movimientos</p>
                    </div>

                    {initialTransactions.length > 0 ? (
                      <div className="px-6 md:px-8 divide-y divide-dashed divide-zinc-200 dark:divide-white/10">
                        {(() => {
                          let running = initialBalance;
                          return initialTransactions.map((tx) => {
                            const isDeposit = tx.type === "deposit";
                            const balanceAfter = running;
                            running -= tx.amount;
                            return (
                              <div key={tx.id} className="group py-3.5 font-mono">
                                <div className="flex items-baseline justify-between gap-3">
                                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{tx.description}</span>
                                  <span className={`flex-shrink-0 text-sm font-bold ${isDeposit ? 'text-green-600 dark:text-green-500' : 'text-zinc-900 dark:text-white'}`}>
                                    {isDeposit ? "+" : "-"}$ {Math.abs(tx.amount).toLocaleString("es-AR", {
                                      minimumFractionDigits: Math.abs(tx.amount) >= 100000 ? 0 : 2,
                                      maximumFractionDigits: Math.abs(tx.amount) >= 100000 ? 0 : 2
                                    })}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 mt-1">
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                                    {new Date(tx.created_at).toLocaleString("es-AR")}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">saldo $ {balanceAfter.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                                    <button
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      disabled={isPending}
                                      className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                      title="Eliminar registro"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="px-6 md:px-8 py-10 text-center">
                        <p className="text-zinc-400 dark:text-zinc-600 font-mono text-xs">No hay movimientos registrados aún.</p>
                      </div>
                    )}

                    <div className="px-6 md:px-8 py-4 border-t-2 border-zinc-900 dark:border-white flex items-center justify-between font-mono">
                      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Saldo actual</span>
                      <span className="text-base font-bold text-zinc-900 dark:text-white">$ {balanceString}</span>
                    </div>
                  </div>
                  <ReceiptEdge flip />
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Right Sidebar: Aircraft Rate Configuration */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3 px-2">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center shadow-md">
              <Plane className="w-4 h-4 text-white dark:text-zinc-900" />
            </div>
            <h3 className="text-lg md:text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Costos aeronaves</h3>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[2rem] p-6 space-y-4 shadow-sm">
            {aircraft.length > 0 ? (
              aircraft.map((ac) => {
                const isEditing = editingAircraftId === ac.id;
                return (
                  <div 
                    key={ac.id} 
                    className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.01] border border-zinc-100 dark:border-white/5 flex flex-col space-y-3 hover:border-zinc-300 dark:hover:border-white/10 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase">
                          {ac.registration}
                        </h4>
                        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-0.5 block">
                          {ac.type} ({ac.icao})
                        </span>
                      </div>
                      
                      {trackingMode === "balance" && !isEditing && (
                        <button
                          onClick={() => {
                            setEditingAircraftId(ac.id);
                            setEditingCost(String(ac.cost_per_hour || 0));
                          }}
                          className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col pt-2 border-t border-zinc-200/50 dark:border-white/5 space-y-2">
                      {trackingMode === "balance" ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">Tarifa por hora</span>
                            
                            {isEditing ? (
                              <div className="flex items-center space-x-2">
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editingCost}
                                    onChange={(e) => setEditingCost(e.target.value)}
                                    className="bg-white dark:bg-black/40 border border-zinc-300 dark:border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs font-bold text-zinc-900 dark:text-white w-24 outline-none focus:border-zinc-900 dark:focus:border-white/50"
                                  />
                                </div>
                                <button
                                  onClick={() => handleSaveRate(ac.id)}
                                  disabled={isPending}
                                  className="p-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:scale-105 transition-transform"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingAircraftId(null)}
                                  className="p-1.5 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm font-bold text-zinc-950 dark:text-white font-display">
                                $ {(ac.cost_per_hour || 0).toLocaleString("es-AR", { minimumFractionDigits: 1 })} <span className="text-[10px] text-zinc-400">/hs</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-white/5">
                            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">Horas estimadas</span>
                            {ac.cost_per_hour && ac.cost_per_hour > 0 ? (
                              (() => {
                                const estHours = initialBalance / ac.cost_per_hour;
                                const isEstNegative = estHours < 0;
                                return (
                                  <span className={`text-sm font-bold font-display ${isEstNegative ? 'text-red-600 dark:text-red-500' : 'text-zinc-950 dark:text-white'}`}>
                                    {estHours.toFixed(1)} <span className="text-[10px] text-zinc-400">hs</span>
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 font-display">—</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">Horas disponibles</span>
                          {(() => {
                            const totalRemainingHoursForAc = packs
                              .filter(p => p.is_active && p.aircraft_ids.includes(ac.id))
                              .reduce((sum, p) => sum + p.remaining_hours, 0);
                            const hasNegative = totalRemainingHoursForAc < 0;

                            return (
                              <span className={`text-sm font-bold font-display ${hasNegative ? 'text-red-600 dark:text-red-500' : 'text-zinc-950 dark:text-white'}`}>
                                {totalRemainingHoursForAc.toFixed(1)} <span className="text-[10px] text-zinc-400">hs</span>
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm font-medium py-4">No hay aeronaves cargadas</p>
            )}
          </div>
        </section>

      </div>

      {/* Top-up Modal */}
      <AnimatePresence>
        {isTopUpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTopUpOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] w-full max-w-md p-6 md:p-8 shadow-2xl relative z-10 space-y-6"
            >
              <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-4">
                <h4 className="text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">
                  {topUpType === "deposit" ? "Cargar saldo" : "Retirar saldo"}
                </h4>
                <button
                  onClick={() => setIsTopUpOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleTopUpSubmit} className="space-y-4">
                {/* Movement Type Pill Toggle */}
                <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTopUpType("deposit")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${
                      topUpType === "deposit"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    Cargar (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopUpType("charge")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${
                      topUpType === "charge"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    Retirar (-)
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block">
                    {topUpType === "deposit" ? "Monto a cargar ($)" : "Monto a retirar ($)"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      required
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm font-bold text-zinc-900 dark:text-white w-full outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block">Concepto / Descripción</label>
                  <input
                    type="text"
                    placeholder={topUpType === "deposit" ? "Ej. Transferencia Banco" : "Ej. Ajuste manual de saldo"}
                    value={topUpDesc}
                    onChange={(e) => setTopUpDesc(e.target.value)}
                    className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 dark:text-white w-full outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-4 rounded-xl shadow-cal-highlight dark:shadow-none hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 pt-4"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{topUpType === "deposit" ? "Confirmar carga" : "Confirmar retiro"}</span>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Balance Override Modal */}
      <AnimatePresence>
        {isOverrideOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOverrideOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] w-full max-w-md p-6 md:p-8 shadow-2xl relative z-10 space-y-6"
            >
              <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-4">
                <h4 className="text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">
                  Ajustar saldo actual
                </h4>
                <button
                  onClick={() => setIsOverrideOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleOverrideSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block">
                    Nuevo saldo en cuenta ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      required
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                      className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm font-bold text-zinc-900 dark:text-white w-full outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all"
                    />
                  </div>
                  <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-2">
                    * Se creará una transacción de ajuste para compensar la diferencia automáticamente.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-4 rounded-xl shadow-cal-highlight dark:shadow-none hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 pt-4"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Confirmar ajuste</span>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Serrated top/bottom edge that makes the transactions panel read as a torn receipt. */
function ReceiptEdge({ flip = false }: { flip?: boolean }) {
  const teeth = Array.from({ length: 24 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 240 10"
      preserveAspectRatio="none"
      className={`w-full h-2.5 text-white dark:text-[#111111] ${flip ? "rotate-180" : ""}`}
    >
      <polygon
        points={teeth.map((i) => `${i * 10},10 ${i * 10 + 5},0 ${i * 10 + 10},10`).join(" ")}
        fill="currentColor"
      />
    </svg>
  );
}
