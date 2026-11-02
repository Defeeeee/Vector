"use client";

import { Profile } from "@/types";
import { updateProfile, regenerateApiKey } from "@/actions/profile";
import { User, Shield, Calendar, CreditCard, Save, Loader2, Compass } from "lucide-react";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AYUDA_NUMERO, mostrarWhatsapp, normalizarWhatsapp } from "@/lib/whatsapp-numero";
import { OPCIONES_LICENCIA, esAlumno } from "@/lib/licencias";

interface ProfileFormProps {
  profile: Profile | null;
  /**
   * Expiry of the CMA document, for the ID card preview only.
   *
   * The medical is no longer a column on the profile — it's a row in
   * `documents` like every other expiry, edited in the Vencimientos section of
   * this same page. The card still shows it because it's the one date a pilot
   * checks constantly.
   */
  cmaExpiry?: string | null;
}

export default function ProfileForm({ profile, cmaExpiry }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_phone ? mostrarWhatsapp(profile.whatsapp_phone) : "");
  const numero = normalizarWhatsapp(whatsapp);
  const [licencia, setLicencia] = useState(profile?.license_type && profile.license_type !== "-" ? profile.license_type : "");
  const eraAlumno = esAlumno(profile?.license_type);
  const alumno = esAlumno(licencia);
  // La fecha de la PPA se pide sólo a quien deja de ser alumno, o a quien ya la tiene
  // cargada (para corregirla). Al resto no le aparece: para quien nunca fue alumno en
  // Vector no hay fecha, y cuentan todos sus vuelos.
  const pideFechaPpa = (eraAlumno && !alumno) || (!!profile?.fecha_ppa && !alumno);

  async function handleRegenerateKey() {
    if (!confirm("¿Estás seguro de que querés regenerar tu token de acceso? El token anterior dejará de funcionar inmediatamente.")) {
      return;
    }
    setIsRegenerating(true);
    try {
      await regenerateApiKey();
    } catch (e) {
      alert("Error al regenerar el token");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    setSuccess(false);
    setError(null);
    startTransition(async () => {
      try {
        const r = await updateProfile(formData);
        if (r?.error) {
          setError(r.error);
          return;
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (e) {
        console.error(e);
        setError("No se pudo guardar el perfil. Probá de nuevo.");
      }
    });
  }

  const initials = `${profile?.first_name?.charAt(0) || ""}${profile?.last_name?.charAt(0) || ""}` || "--";
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const cmaLabel = cmaExpiry
    ? new Date(cmaExpiry + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  return (
    <form action={handleSubmit} className="space-y-8">
      {/* Pilot ID card — live preview of the profile being edited below */}
      <div className="relative overflow-hidden rounded-[2rem] bg-zinc-900 dark:bg-[#0a0a0a] border border-zinc-800 dark:border-white/10 p-6 md:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-aviation-blue/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />
        <div className="relative z-10 flex items-center gap-4 md:gap-5">
          <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-xl md:text-2xl font-bold font-display text-white flex-shrink-0 uppercase">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="eyebrow eyebrow-invert">Licencia de piloto</p>
            <h3 className="text-xl md:text-3xl font-bold font-display text-white tracking-tight truncate">{fullName || "Piloto sin nombre"}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-zinc-400">
              <span>Licencia <strong className="text-white">{profile?.license_type || "—"}</strong></span>
              <span className="hidden sm:inline text-zinc-600">·</span>
              <span>CMA vence <strong className="text-white">{cmaLabel}</strong></span>
            </div>
          </div>
          <Compass className="w-7 h-7 md:w-8 md:h-8 text-white/10 flex-shrink-0 hidden sm:block" />
        </div>
      </div>

      <input type="hidden" name="id" defaultValue={profile?.id || ""} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EditField label="Nombre">
          <input name="first_name" defaultValue={profile?.first_name || ""} placeholder="Nombre del piloto" required className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
        </EditField>

        <EditField label="Apellido">
          <input name="last_name" defaultValue={profile?.last_name || ""} placeholder="Apellido del piloto" required className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
        </EditField>

        <EditField label="Licencia (ANAC)">
          <input name="license_type" list="opciones-licencia" value={licencia} onChange={(e) => setLicencia(e.target.value.toUpperCase())} placeholder="ALUMNO, PPA, PCA, TLA..." className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all uppercase placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
          <datalist id="opciones-licencia">
            {OPCIONES_LICENCIA.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </datalist>
        </EditField>

        {pideFechaPpa && (
          <EditField label="¿Cuándo rendiste la PPA?">
            <input
              name="fecha_ppa"
              type="date"
              required
              defaultValue={profile?.fecha_ppa?.slice(0, 10) || ""}
              className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all [color-scheme:light] dark:[color-scheme:dark]"
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
              Los vuelos de antes quedan como de alumno: no cuentan para la PCA ni van al libro de vuelo.
            </p>
          </EditField>
        )}

        {/* El número de licencia y el legajo van en el encabezado de cada hoja del libro
            en PDF, como en el libro de papel. Opcionales: sin ellos, el casillero
            queda en blanco para completar a mano. */}
        {!alumno && <>
        <EditField label="Nº de licencia">
          <input name="licencia_numero" defaultValue={profile?.licencia_numero || ""} placeholder="Opcional" maxLength={30} className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
        </EditField>

        <EditField label="Legajo (ANAC)">
          <input name="legajo" defaultValue={profile?.legajo || ""} placeholder="Opcional" maxLength={30} className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Los dos van en el encabezado del libro de vuelo en PDF.
          </p>
        </EditField>
        </>}

        {/* The label used to read "WhatsApp (para Copiloto IA)", which is very
            likely why 9 of 10 profiles have it empty: a pilot who does not use
            the AI copilot skips it, not knowing the same number is what gates
            the document expiry alerts. Naming both uses is the cheapest half of
            fixing that. */}
        <EditField label="WhatsApp">
          <input name="whatsapp_phone" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="Ej: 11 2345 6789" className="w-full bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
          {/* Cómo va a quedar guardado, mientras se escribe: el copiloto sólo reconoce
              la forma 549 + área + número, y el 2026-09-24 un piloto la escribió sin el
              549 y no entendía por qué no le contestaba. */}
          {whatsapp.trim() && (
            <p className={`text-[11px] mt-2 font-semibold ${numero.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {numero.ok ? `Se guarda como ${mostrarWhatsapp(numero.numero)}` : numero.error}
            </p>
          )}
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Se usa para el copiloto por WhatsApp y para avisarte de los
            vencimientos. {AYUDA_NUMERO} <strong className="text-zinc-700 dark:text-zinc-300">Sin número no hay avisos.</strong>
          </p>
        </EditField>

        <div className="md:col-span-2 p-6 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10 rounded-[1.5rem] space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Token de acceso API (iOS Shortcuts)</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 leading-relaxed">Usá este token único para automatizar el inicio y fin de tus vuelos mediante un Shortcut de iOS.</p>
            </div>
            <Shield className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              readOnly 
              type="text" 
              value={profile?.api_key || "No disponible. Guarda tu perfil primero."} 
              className="flex-1 bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300 outline-none select-all shadow-sm" 
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (profile?.api_key) {
                    navigator.clipboard.writeText(profile.api_key);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-6 py-3.5 rounded-xl transition-all active:scale-[0.95] flex-shrink-0"
              >
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
              <button
                type="button"
                onClick={handleRegenerateKey}
                disabled={isRegenerating}
                className="bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-semibold text-sm px-6 py-3.5 rounded-xl transition-all disabled:opacity-50 flex-shrink-0"
              >
                {isRegenerating ? "Generando..." : "Regenerar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-8 border-t border-zinc-200 dark:border-white/10 gap-6">
        <div className="flex items-center space-x-2">
          {success && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center space-x-2 text-green-600">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold dark:text-green-500">Sincronizado</span>
            </motion.div>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
        </div>
        
        <button 
          disabled={isPending}
          type="submit" 
          className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 px-12 rounded-full shadow-cal-highlight dark:shadow-none transition-all active:scale-[0.95] flex items-center space-x-3 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Guardar perfil</span>
        </button>
      </div>
    </form>
  );
}

function EditField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-3 group">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors">{label}</label>
      {children}
    </div>
  );
}
