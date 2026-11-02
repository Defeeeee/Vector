"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, Calendar, Plane, Route, Clock, ChevronRight, RefreshCw, Layers } from "lucide-react";
import { Aircraft } from "@/types";
import { bulkLogFlights } from "@/actions/flight";
import { useRouter } from "next/navigation";
import { comprimirImagen } from "@/lib/imagen-cliente";

/** Hasta cuántas fotos de hojas por vez: las mismas que acepta `/api/parse-logbook`. */
const MAX_FOTOS = 12;

interface LogbookImportClientProps {
  aircraftList: Aircraft[];
}

interface ParsedFlight {
  id: string; // client-side temp UUID
  date: string;
  aircraft_registration: string;
  aircraft_id: string; // linked hangar aircraft id
  route: string;
  duration: number;
  takeoff: string;
  landing: string;
  landings: number;
  purpose: string;
  pic_day_loc?: number;
  pic_day_tra?: number;
  pic_night_loc?: number;
  pic_night_tra?: number;
  sic_day_loc?: number;
  sic_day_tra?: number;
  sic_night_loc?: number;
  sic_night_tra?: number;
  imc_pil?: number;
  imc_cop?: number;
  capota?: number;
  sim_instructor?: number;
  sim_pil_en_inst?: number;
}

export default function LogbookImportClient({ aircraftList }: LogbookImportClientProps) {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // O fotos de las hojas del libro de papel (2.28.0), en lugar del PDF.
  const [fotos, setFotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedFlights, setParsedFlights] = useState<ParsedFlight[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  /**
   * Un PDF, o fotos de las hojas. Si viene un PDF, gana el PDF; si no, las fotos (hasta
   * `MAX_FOTOS`). Del teléfono, el selector ofrece la cámara y la galería.
   */
  const elegir = (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    const pdf = archivos.find((f) => f.type === "application/pdf");
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (pdf) {
      setFile(pdf);
      setFotos([]);
      setError(null);
    } else if (imagenes.length) {
      setFile(null);
      setFotos(imagenes.slice(0, MAX_FOTOS));
      setError(imagenes.length > MAX_FOTOS ? `Tomamos las primeras ${MAX_FOTOS} fotos: subí las demás después.` : null);
    } else {
      setError("Subí el libro en PDF, o fotos de las hojas.");
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    elegir(e.dataTransfer.files);
  };

  // Handle file input select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    elegir(e.target.files);
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Parse the PDF logbook using Gemini
  const handleUploadAndParse = async () => {
    if (!file && fotos.length === 0) return;

    setLoading(true);
    setError(null);
    setLoadingStep(file ? "Subiendo el PDF..." : "Preparando las fotos...");

    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      else {
        // Achicadas en el navegador: una foto de teléfono pesa 4–8 MB. A 2400 px la letra a
        // mano se sigue leyendo, y la ubicación GPS no sale del teléfono (el canvas no copia el EXIF).
        for (const [k, f] of fotos.entries()) {
          setLoadingStep(`Preparando la foto ${k + 1} de ${fotos.length}...`);
          formData.append("fotos", await comprimirImagen(f, 2400, 0.85));
        }
      }

      setLoadingStep(file ? "Leyendo las páginas del libro..." : `Leyendo ${fotos.length === 1 ? "la hoja" : `las ${fotos.length} hojas`}...`);
      const res = await fetch("/api/parse-logbook", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "No se pudo leer el libro. Probá de nuevo.");
      }

      setLoadingStep("Estructurando lista de vuelos...");
      const data = await res.json();
      
      if (!data.flights || !Array.isArray(data.flights)) {
        throw new Error("No se encontraron registros de vuelos en el formato esperado.");
      }

      // Map parsed aircraft registrations to existing hangar aircraft IDs
      const mapped: ParsedFlight[] = data.flights.map((f: any, idx: number) => {
        const regClean = (f.aircraft_registration || "").trim().toUpperCase();
        // Try finding matching aircraft in the pilot's hangar list
        const match = aircraftList.find(ac => 
          ac.registration.trim().toUpperCase() === regClean ||
          ac.registration.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") === regClean.replace(/[^A-Z0-9]/g, "")
        );

        return {
          id: `flight-temp-${idx}-${Date.now()}`,
          date: f.date || "",
          aircraft_registration: f.aircraft_registration || "",
          aircraft_id: match ? match.id : "", // pre-select if matched, otherwise let user pick
          route: f.route || "",
          duration: typeof f.duration === "number" ? f.duration : parseFloat(f.duration) || 0,
          takeoff: f.takeoff || "",
          landing: f.landing || "",
          landings: typeof f.landings === "number" ? f.landings : parseInt(f.landings, 10) || 1,
          purpose: f.purpose || "VP",
          pic_day_loc: f.pic_day_loc || undefined,
          pic_day_tra: f.pic_day_tra || undefined,
          pic_night_loc: f.pic_night_loc || undefined,
          pic_night_tra: f.pic_night_tra || undefined,
          sic_day_loc: f.sic_day_loc || undefined,
          sic_day_tra: f.sic_day_tra || undefined,
          sic_night_loc: f.sic_night_loc || undefined,
          sic_night_tra: f.sic_night_tra || undefined,
          imc_pil: f.imc_pil || undefined,
          imc_cop: f.imc_cop || undefined,
          capota: f.capota || undefined,
          sim_instructor: f.sim_instructor || undefined,
          sim_pil_en_inst: f.sim_pil_en_inst || undefined
        };
      });

      setParsedFlights(mapped);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocurrió un error inesperado al analizar el libro de vuelo.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Update a single flight field in state
  const handleUpdateField = (id: string, field: keyof ParsedFlight, value: any) => {
    setParsedFlights(prev =>
      prev.map(f => {
        if (f.id === id) {
          const updated = { ...f, [field]: value };
          // If aircraft is changed from select dropdown, update registration reference text
          if (field === "aircraft_id") {
            const selectedAc = aircraftList.find(ac => ac.id === value);
            if (selectedAc) {
              updated.aircraft_registration = selectedAc.registration;
            }
          }
          return updated;
        }
        return f;
      })
    );
  };

  // Remove a flight draft from review list
  const handleRemoveFlight = (id: string) => {
    setParsedFlights(prev => prev.filter(f => f.id !== id));
  };

  // Submit reviewed flights to database via bulk server action
  const handleConfirmImport = async () => {
    const unlinkedFlight = parsedFlights.find(f => !f.aircraft_id);
    if (unlinkedFlight) {
      setError(`El vuelo con ruta '${unlinkedFlight.route}' no tiene un avión asociado. Por favor selecciona un avión del hangar.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await bulkLogFlights(parsedFlights);
      if (res.error) {
        throw new Error(res.error);
      }
      router.push("/dashboard/history");
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al registrar los vuelos en la bitácora.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Errors Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-5 rounded-2xl flex items-start space-x-3 text-xs font-bold leading-relaxed">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Upload and file selection */}
      {parsedFlights.length === 0 && !loading && (
        <div 
          onDragEnter={handleDrag} 
          onDragLeave={handleDrag} 
          onDragOver={handleDrag} 
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-[2rem] p-10 md:p-16 text-center transition-all ${
            dragActive 
              ? "border-zinc-950 bg-zinc-50 dark:border-white dark:bg-white/5" 
              : "border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 bg-white dark:bg-[#111111]"
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,application/pdf,image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="max-w-md mx-auto space-y-6 flex flex-col items-center">
            <div className="w-16 h-16 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl flex items-center justify-center text-zinc-400 dark:text-zinc-500">
              <Upload className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Tu libro en PDF, o fotos de las hojas
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
                Desde el teléfono, sacale una foto a cada hoja, de frente y con buena luz (hasta {MAX_FOTOS} por vez). O arrastrá el PDF escaneado acá.
              </p>
            </div>

            {file ? (
              <div className="flex items-center space-x-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-5 py-3.5 rounded-xl w-full justify-center">
                <FileText className="w-5 h-5 text-zinc-400" />
                <span className="text-xs font-mono font-bold truncate text-zinc-900 dark:text-white">{file.name}</span>
                <span className="text-[10px] font-mono text-zinc-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            ) : fotos.length > 0 ? (
              <div className="flex items-center space-x-3 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-5 py-3.5 rounded-xl w-full justify-center">
                <Layers className="w-5 h-5 text-zinc-400" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                  {fotos.length === 1 ? "1 foto" : `${fotos.length} fotos`} de hojas
                </span>
              </div>
            ) : null}

            <div className="flex gap-4 w-full">
              <button
                type="button"
                onClick={onButtonClick}
                className="flex-1 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm py-4 rounded-2xl transition-all active:scale-[0.98]"
              >
                {file || fotos.length ? "Cambiar" : "Elegir PDF o fotos"}
              </button>

              {(file || fotos.length > 0) && (
                <button
                  type="button"
                  onClick={handleUploadAndParse}
                  className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 font-semibold text-sm py-4 rounded-2xl transition-all active:scale-[0.98]"
                >
                  {file ? "Leer el PDF" : fotos.length === 1 ? "Leer la hoja" : "Leer las hojas"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading analysis states */}
      {loading && (
        <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] p-10 md:p-16 flex flex-col items-center justify-center space-y-6 text-center shadow-cal dark:shadow-none min-h-[300px]">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Procesando libro de vuelo
            </h4>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {loadingStep}
            </p>
          </div>
          <div className="w-full max-w-xs h-1.5 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-zinc-900 dark:bg-white animate-pulse w-3/4 rounded-full" />
          </div>
        </div>
      )}

      {/* STEP 2: Review and edit list of flights */}
      {parsedFlights.length > 0 && !loading && (
        <div className="space-y-6">
          
          {/* Header Action Summary Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] p-6 shadow-sm gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shadow-sm">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-none">
                  Vuelos extraídos ({parsedFlights.length})
                </h4>
                <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 leading-none">
                  Revisa los datos y asocia las aeronaves desconocidas
                </p>
              </div>
            </div>

            <div className="flex gap-3 w-full md:w-auto self-stretch md:self-auto">
              <button
                type="button"
                onClick={() => {
                  setParsedFlights([]);
                  setFile(null);
                  setFotos([]);
                  setError(null);
                }}
                className="flex-1 md:flex-none border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-all active:scale-[0.98]"
              >
                Volver a subir
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmImport}
                className="flex-1 md:flex-none bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 disabled:pointer-events-none font-semibold text-sm px-8 py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar e importar</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Large review table wrapper */}
          <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-[2rem] overflow-hidden shadow-cal dark:shadow-none">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-black/20 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Calendar className="w-3.5 h-3.5" /><span>Fecha</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Plane className="w-3.5 h-3.5" /><span>Aeronave (Matrícula)</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Route className="w-3.5 h-3.5" /><span>Ruta</span></span></th>
                    <th className="px-6 py-4.5"><span className="flex items-center space-x-1.5"><Clock className="w-3.5 h-3.5" /><span>Horario (DEP/ARR)</span></span></th>
                    <th className="px-6 py-4.5 text-center">Landings</th>
                    <th className="px-6 py-4.5">Total Hs</th>
                    <th className="px-6 py-4.5">Finalidad</th>
                    <th className="px-6 py-4.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5 text-xs">
                  {parsedFlights.map((flight) => {
                    const hasUnmatchedAc = !flight.aircraft_id;
                    
                    return (
                      <tr 
                        key={flight.id} 
                        className={`hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-colors ${
                          hasUnmatchedAc ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.01]" : ""
                        }`}
                      >
                        {/* Date field */}
                        <td className="px-6 py-4">
                          <input 
                            type="date" 
                            value={flight.date}
                            onChange={(e) => handleUpdateField(flight.id, "date", e.target.value)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-32 outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Aircraft selector */}
                        <td className="px-6 py-4 space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <select
                              value={flight.aircraft_id}
                              onChange={(e) => handleUpdateField(flight.id, "aircraft_id", e.target.value)}
                              className={`bg-white dark:bg-[#151515] border ${
                                hasUnmatchedAc 
                                  ? "border-amber-500 focus:border-amber-600 focus:dark:border-amber-500/50" 
                                  : "border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30"
                              } rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none text-zinc-800 dark:text-zinc-200 w-44`}
                            >
                              <option value="" disabled className="text-zinc-400">Seleccionar avión...</option>
                              {aircraftList.map((ac) => (
                                <option key={ac.id} value={ac.id}>
                                  {ac.registration} ({ac.icao})
                                </option>
                              ))}
                            </select>
                            {hasUnmatchedAc && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" title="Aeronave no vinculada" />
                            )}
                          </div>
                          <p className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 uppercase font-black pl-1">
                            Lector: <span className="font-bold text-zinc-600 dark:text-zinc-300">{flight.aircraft_registration || "N/A"}</span>
                          </p>
                        </td>

                        {/* Route field */}
                        <td className="px-6 py-4">
                          <input 
                            type="text" 
                            value={flight.route}
                            onChange={(e) => handleUpdateField(flight.id, "route", e.target.value)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-28 outline-none text-zinc-800 dark:text-zinc-200 uppercase font-display"
                          />
                        </td>

                        {/* Takeoff & Landing times */}
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1.5 font-mono">
                            <input 
                              type="text" 
                              placeholder="HH:MM"
                              value={flight.takeoff}
                              onChange={(e) => handleUpdateField(flight.id, "takeoff", e.target.value)}
                              className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200"
                            />
                            <span className="text-zinc-400">/</span>
                            <input 
                              type="text" 
                              placeholder="HH:MM"
                              value={flight.landing}
                              onChange={(e) => handleUpdateField(flight.id, "landing", e.target.value)}
                              className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200"
                            />
                          </div>
                        </td>

                        {/* Landings count */}
                        <td className="px-6 py-4 text-center">
                          <input 
                            type="number" 
                            min="1"
                            value={flight.landings}
                            onChange={(e) => handleUpdateField(flight.id, "landings", parseInt(e.target.value, 10) || 1)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-1.5 py-1.5 text-xs font-bold w-12 text-center outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Duration hours */}
                        <td className="px-6 py-4">
                          <input 
                            type="number" 
                            step="0.1"
                            min="0.1"
                            value={flight.duration}
                            onChange={(e) => handleUpdateField(flight.id, "duration", parseFloat(e.target.value) || 0)}
                            className="bg-transparent border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold w-14 text-center outline-none text-zinc-800 dark:text-zinc-200 font-mono"
                          />
                        </td>

                        {/* Purpose select */}
                        <td className="px-6 py-4">
                          <select
                            value={flight.purpose}
                            onChange={(e) => handleUpdateField(flight.id, "purpose", e.target.value)}
                            className="bg-white dark:bg-[#151515] border border-zinc-200 dark:border-white/10 focus:border-zinc-400 focus:dark:border-white/30 rounded-lg px-2 py-1.5 text-xs font-bold outline-none text-zinc-800 dark:text-zinc-200 w-20"
                          >
                            <option value="VP">VP</option>
                            <option value="ENT">ENT</option>
                            <option value="INST">INST</option>
                            <option value="EXA">EXA</option>
                          </select>
                        </td>

                        {/* Remove button */}
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFlight(flight.id)}
                            className="p-2 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                            title="Eliminar del borrador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
