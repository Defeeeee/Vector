import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import CompartirTuVuelo, { type ActivoParaMostrar } from "@/components/dashboard/compartir/CompartirTuVuelo";
import { leerSeguimientosActivos } from "@/actions/seguimiento";
import { fechaArgentina, horaDeArgentina } from "@/lib/compartir-sin-plan";
import { ROTULO_DE_ORIGEN, rotuloDeSalida, trayectoDeActivo } from "@/lib/seguimientos-activos";
import type { Aircraft } from "@/types";

export const metadata = { title: "Compartir tu vuelo | Vector" };

/**
 * **Compartir tu vuelo** (3.41.0, migración 055 del backend): los links que le mandás a tu familia, y
 * uno nuevo para un vuelo **sin plan**: origen, destino y horarios, sin ruta. Cuelga del Mapa.
 *
 * - Lo que se está compartiendo se lee sin cache: se crea y se termina desde esta misma pantalla.
 * - Las fechas se escriben acá, en el server (invariante 1): el cliente recibe el texto ya armado y
 *   "hoy" resuelto (`hoy`), nunca el reloj del navegador.
 * - `?origen=SADM&destino=SAZS` precarga el formulario (lo manda el Mapa con la ruta cargada).
 * - Una lectura que falla no es "no compartís nada" (invariante 2): se dice que no se pudo leer.
 */

const unParametro = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const codigo = (v: string) => (/^[A-Za-z0-9]{3,4}$/.test(v.trim()) ? v.trim().toUpperCase() : "");

export default async function CompartirPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const ahoraIso = new Date().toISOString();
  const [avionesRes, activos] = await Promise.all([apiFetch("/aircraft", { cache: "no-store" }), leerSeguimientosActivos()]);
  if (avionesRes.status === 401) redirect("/api/auth/logout?redirect=/login?expirada=1");
  // Sin simuladores: no vuelan.
  const aviones: Aircraft[] = avionesRes.ok ? ((await avionesRes.json().catch(() => [])) as Aircraft[]).filter((a) => !a.is_simulator) : [];

  const lista: ActivoParaMostrar[] | null = activos
    ? activos.map((s) => ({
        ...s,
        trayecto: trayectoDeActivo(s),
        origenTexto: ROTULO_DE_ORIGEN[s.origen],
        salidaTexto: rotuloDeSalida(s, ahoraIso),
        salidaFecha: s.salidaPrevista ? fechaArgentina(s.salidaPrevista) : null,
        salidaHora: s.salidaPrevista ? horaDeArgentina(s.salidaPrevista) : null,
      }))
    : null;

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="space-y-4">
        <Link href="/dashboard/mapa" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Mapa
        </Link>
        <PageHeader eyebrow="Para que tu familia sepa cuándo llegás" title="Compartir tu vuelo" />
      </div>
      <CompartirTuVuelo
        aviones={aviones}
        activos={lista}
        hoy={fechaArgentina(ahoraIso) ?? ""}
        ahoraIso={ahoraIso}
        origenInicial={codigo(unParametro(params.origen))}
        destinoInicial={codigo(unParametro(params.destino))}
      />
    </div>
  );
}
