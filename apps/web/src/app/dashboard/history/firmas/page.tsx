import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import ExportarBitacora from "@/components/dashboard/ExportarBitacora";
import { Parte } from "@/components/dashboard/firmas/comun";
import TuFirma from "@/components/dashboard/firmas/TuFirma";
import Personas from "@/components/dashboard/firmas/Personas";
import Dorsos from "@/components/dashboard/firmas/Dorsos";
import Constancias from "@/components/dashboard/firmas/Constancias";
import { cantidadDeHojas, sellosPorHoja, vuelosDeUnLibro } from "@/lib/libro-anac";
import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { firmaGuardada } from "@/lib/plan-de-vuelo-servidor";
import type { ConstanciaVuelo, DorsoHoja, FirmaCertificante, SugerenciaCertificante } from "@/lib/firmas-libro";
import type { Aircraft, Flight, Logbook, Profile } from "@/types";

export const metadata = { title: "Firmas del libro | Vector" };

/**
 * Las firmas del libro en PDF (3.36.0): cuelga de Vuelos, como la Auditoría y Pasar al CAD,
 * porque es parte del libro. Hasta la 3.35.0 vivía al medio del Hangar, en un solo componente de
 * 1.200 líneas; ahora son cuatro partes en el orden de la hoja: tu firma, quienes certifican, el
 * dorso y las constancias del frente. **Todo sólo sirve para tu PDF**: no se publica.
 *
 * Todo se pide sin cache: se carga y se cambia desde esta misma pantalla.
 */
const FRESCO = { cache: "no-store" } as const;

const PARTES = [
  { id: "tu-firma", titulo: "Tu firma" },
  { id: "certifican", titulo: "Quienes certifican" },
  { id: "dorso", titulo: "Dorso de cada hoja" },
  { id: "constancias", titulo: "Constancias" },
];

async function leer<T>(res: Response, porDefecto: T): Promise<T> {
  return res.ok ? ((await res.json().catch(() => porDefecto)) as T) : porDefecto;
}

export default async function FirmasPage() {
  const [perfilRes, avionesRes, librosRes, vuelosRes, firmasRes, dorsosRes, sugerenciasRes, constanciasRes, firmaTitular] = await Promise.all([
    apiFetch("/profiles"),
    apiFetch("/aircraft"),
    apiFetch("/logbooks"),
    apiFetch("/flights"),
    apiFetch("/firmas/certificantes", FRESCO),
    apiFetch("/firmas/dorsos", FRESCO),
    // Los nombres de vuelos sin certificante que son de una persona guardada (migración 048).
    apiFetch("/firmas/certificantes/sugerencias", FRESCO),
    apiFetch("/firmas/constancias", FRESCO),
    firmaGuardada(),
  ]);
  if (perfilRes.status === 401 || vuelosRes.status === 401) redirect("/api/auth/logout?redirect=/login?expirada=1");

  const perfil = (await leer<Profile[]>(perfilRes, []))[0] ?? null;
  // El alumno piloto no lleva libro de vuelo (`lib/licencias.ts`): no hay firmas que cargar.
  if (esAlumno(perfil?.license_type)) redirect("/dashboard/history");

  const aviones = await leer<Aircraft[]>(avionesRes, []);
  const libros = await leer<Logbook[]>(librosRes, []);
  const vuelos = await leer<Flight[]>(vuelosRes, []);
  const firmas = await leer<FirmaCertificante[]>(firmasRes, []);
  const dorsos = await leer<DorsoHoja[]>(dorsosRes, []);
  const sugerencias = await leer<SugerenciaCertificante[]>(sugerenciasRes, []);
  const constancias = await leer<ConstanciaVuelo[]>(constanciasRes, []);

  // Las hojas, numeradas igual que el PDF (el dorso se carga hoja por hoja), y los sellos con que
  // se certificaron los vuelos de cada una («Usar los de los vuelos de esta hoja»).
  const vuelosDelPdf = vuelosDesdeLaPpa(vuelos, perfil?.fecha_ppa);
  const hojasPorLibro = Object.fromEntries(libros.map((l) => [l.id, cantidadDeHojas(vuelosDeUnLibro(vuelosDelPdf, libros, l), aviones, l)]));
  const sellosDeLasHojas = Object.fromEntries(libros.map((l) => [l.id, sellosPorHoja(vuelosDeUnLibro(vuelosDelPdf, libros, l), aviones, l)]));
  const vuelosOrdenados = [...vuelos].sort((a, b) => new Date(b.takeoff).getTime() - new Date(a.takeoff).getTime());

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="space-y-4">
        <Link href="/dashboard/history" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Vuelos
        </Link>
        <PageHeader
          eyebrow="Las firmas y sellos de tu libro en PDF"
          title="Firmas del libro"
          action={<ExportarBitacora flights={vuelosOrdenados} aircraft={aviones} libros={libros} alumno={false} />}
        >
          <nav aria-label="Partes" className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
            {PARTES.map((p) => (
              <a key={p.id} href={`#${p.id}`} className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 hover:text-aviation-cyan min-h-8 inline-flex items-center">
                {p.titulo}
              </a>
            ))}
          </nav>
        </PageHeader>
      </div>

      <Parte id="tu-firma" titulo="Tu firma" explicacion="La de titular del libro: va al pie de cada hoja con «Con mi firma de titular». Es la misma que firma tus planes de vuelo.">
        <TuFirma inicial={firmaTitular} />
      </Parte>

      <Parte
        id="certifican"
        titulo="Quienes certifican"
        explicacion={
          <>
            Tus instructores y quien certifica tus vuelos. De cada persona, <strong className="text-zinc-900 dark:text-white">su firma</strong> (el trazo solo, para la celda
            «Certificaciones» de sus vuelos) y <strong className="text-zinc-900 dark:text-white">sus sellos</strong> (la firma con sello, para el dorso).
          </>
        }
      >
        <Personas firmas={firmas} sugerencias={sugerencias} vuelos={vuelosDelPdf} aviones={aviones} />
      </Parte>

      <Parte
        id="dorso"
        titulo="Dorso de cada hoja"
        explicacion="Lo que va atrás de cada hoja, en una página aparte para imprimir a doble faz: fotos de las firmas, sellos de tus certificantes y los textos que firman. Salen a tamaño real, 7 × 3,5 cm cada una, desde arriba a la izquierda. Una hoja sin nada sale en blanco, para que la doble faz no se corra."
      >
        {libros.length ? (
          <Dorsos dorsos={dorsos} libros={libros.map((l) => ({ id: l.id, name: l.name }))} hojasPorLibro={hojasPorLibro} firmas={firmas} sellosPorHoja={sellosDeLasHojas} />
        ) : (
          <p className="text-sm text-zinc-500">Primero creá tu libro en el Hangar.</p>
        )}
      </Parte>

      <Parte
        id="constancias"
        titulo="Constancias en el frente"
        explicacion="La foto del sello que una autoridad estampó en el frente de la hoja, como el de ANAC en tu examen. Va sobre las columnas de discriminación, desde el renglón de ese vuelo. Tiene que ser la foto del sello real: Vector no dibuja sellos."
      >
        <Constancias constancias={constancias} vuelos={vuelosDelPdf} />
      </Parte>
    </div>
  );
}
