import Link from "next/link";
import { headers } from "next/headers";
import { Bookmark, ChevronDown, ExternalLink, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import PasoExtension from "@/components/dashboard/cad/ExtensionCad";
import ConexionCad, { ActualizarCad, DesconectarCad } from "@/components/dashboard/cad/ConexionCad";
import PanelCad from "@/components/dashboard/cad/PanelCad";
import ConElCad from "@/components/dashboard/cad/ConElCad";
import SegunNavegador from "@/components/dashboard/cad/SegunNavegador";
import PasoMarcador from "@/components/dashboard/MarcadorCad";
import { estadoConexionCad } from "@/actions/cad-vector";
import { vuelosParaElCad } from "@/lib/cad-servidor";
import { TRAER_DEL_CAD, type BorradorCad } from "@/lib/cad";
import { navegadorParaCad, type NavegadorCad } from "@/lib/extension-cad";

export const dynamic = "force-dynamic";

const vuelos = (n: number) => (n === 1 ? "1 vuelo" : `${n} vuelos`);
const horas = (n: number) => n.toFixed(1);

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-4">
      <span className="data grid place-items-center w-8 h-8 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-bold text-zinc-500 dark:text-zinc-400">
        {n}
      </span>
      <div className="space-y-3 pt-1 min-w-0">
        <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">{titulo}</h3>
        {children}
      </div>
    </li>
  );
}

function Fila({ b, corregir }: { b: BorradorCad; corregir?: boolean }) {
  return (
    <li className="flex items-start gap-4 px-4 md:px-5 py-3">
      <span className="data text-xs text-zinc-500 dark:text-zinc-400 pt-0.5 w-20 shrink-0">{b.fecha}</span>
      <div className="min-w-0 flex-1">
        <p className="data text-sm font-bold text-zinc-900 dark:text-white truncate">{b.ruta || "Sin ruta"}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {[b.matricula, `${horas(b.horas)} h`, b.finalidad.toLowerCase()].filter(Boolean).join(", ")}
        </p>
        {corregir && <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{b.problema}</p>}
      </div>
      {corregir && (
        <Link
          href={`/dashboard/history?editar=${encodeURIComponent(b.vectorId)}`}
          className="shrink-0 text-xs font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline underline-offset-2 pt-0.5"
        >
          Corregir
        </Link>
      )}
    </li>
  );
}

/**
 * Los pasos con la pestaña del CAD, con la sesión del piloto. En Chrome se propone la
 * extensión (con el marcador a un toque); en Safari y Firefox, que no la cargan, sólo el
 * marcador.
 */
function PasosMarcador({ nav }: { nav: "extension" | "marcador" }) {
  return (
    <>
    <ol className="space-y-8">
      {nav === "extension" ? (
        <Paso n={1} titulo="Instalá la extensión de Vector">
          <PasoExtension />
        </Paso>
      ) : (
        <Paso n={1} titulo="Agregá el marcador de Vector">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
            El marcador conecta tu pestaña del CAD con Vector: lo tocás en el CAD y se abre esta pantalla, lista para pasar tus vuelos. En Safari,
            mostrá la barra de favoritos con <span className="font-mono text-[13px]">⇧⌘B</span> antes de arrastrarlo.
          </p>
          <PasoMarcador />
        </Paso>
      )}
      <Paso n={2} titulo='Entrá al CAD y abrí "Registro horas vuelo"'>
        <a
          href="https://cad.anac.gob.ar/portalApp/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
        >
          Abrir el CAD <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </Paso>
      <Paso n={3} titulo="Volvé a Vector y elegí qué cargar">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
          {nav === "extension"
            ? "Con la extensión, esta pantalla se conecta sola con el CAD; con el marcador, tocalo en el CAD y se abre Vector."
            : "Tocá el marcador en el CAD y se abre Vector."}{" "}
          Ves el panel con tus vuelos: los que faltan, los que ya están y los que hay que corregir. A cada vuelo le
          ponés su autoridad certificante y su nombre; Vector te propone la última que usaste para esa finalidad. Antes de cargar podés ver
          exactamente lo que se manda.
        </p>
        {TRAER_DEL_CAD && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
          ¿Ya declaraste vuelos en el CAD que no están en Vector? En la pestaña <b className="font-semibold text-zinc-900 dark:text-white">Traer a Vector</b>{" "}
          los pasás a tu bitácora, con el desglose del libro. No se descuentan de tu saldo. Si cargaste los totales de tu libro, traé sólo los
          posteriores a esa hoja, para no contar dos veces las mismas horas.
        </p>
        )}
      </Paso>
      <Paso n={4} titulo="Hacé la declaración jurada en el CAD">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
          Los vuelos quedan &quot;Pendiente de DDJJ&quot;. La declaración la hacés vos, en &quot;DDJJ de Horas de vuelo&quot;: revisalos antes,
          porque lo que se declara ahí es una declaración jurada.
        </p>
      </Paso>
    </ol>

    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-prose">
      Vector no ve tu contraseña de ANAC: carga desde tu sesión del CAD, en tu navegador.
    </p>
    </>
  );
}

/** En el teléfono no hay extensiones ni barra de favoritos: el CAD se pasa desde la compu. */
function EnLaCompu({ corregir }: { corregir: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 md:p-6">
      <span className="grid place-items-center w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white shrink-0">
        <Laptop className="w-5 h-5 text-white dark:text-zinc-900" aria-hidden="true" />
      </span>
      <div className="space-y-2 min-w-0">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Pasá tus vuelos desde la compu</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
          Vector carga los vuelos desde tu pestaña del CAD, con una extensión o un marcador, y en el teléfono no se puede ninguna de las dos. En la
          compu, entrá a Vector y andá a <b className="font-semibold text-zinc-900 dark:text-white">Bitácora → Vuelos → Pasar al CAD</b>.
        </p>
        {corregir && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">Desde acá sí podés corregir los vuelos que lo necesitan, abajo.</p>
        )}
      </div>
    </div>
  );
}

/** Los pasos para este navegador: extensión, marcador o "desde la compu" (`navegadorParaCad`). */
function PasosCad({ inicial, corregir }: { inicial: NavegadorCad; corregir: boolean }) {
  return (
    <SegunNavegador
      inicial={inicial}
      extension={<PasosMarcador nav="extension" />}
      marcador={<PasosMarcador nav="marcador" />}
      compu={<EnLaCompu corregir={corregir} />}
    />
  );
}

const LISTA = "divide-y divide-zinc-100 dark:divide-white/5 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden";

/**
 * "Pasar al CAD": los pasos para cargar los vuelos de Vector en el CAD de ANAC desde el
 * navegador del piloto (`lib/cad.ts`, `lib/enlace-cad.ts`). Cuelga de Bitácora → Vuelos.
 *
 * Arriba, en una frase y una barra, cuánto falta. Después los pasos, con el marcador como
 * lo único destacado, y abajo los vuelos: primero los que hay que corregir, que son los
 * únicos que piden algo.
 */
export default async function PasarAlCadPage() {
  const [datos, conexion, h] = await Promise.all([vuelosParaElCad(), estadoConexionCad(), headers()]);
  const nav = navegadorParaCad(h.get("user-agent") ?? "");

  if (datos === null || datos.alumno) {
    return (
      <div className="space-y-8 pb-20 max-w-3xl">
        <PageHeader eyebrow="Bitácora" title="Pasar al CAD" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-prose">
          {datos === null
            ? "No pudimos leer tus vuelos. Probá de nuevo en un momento."
            : "El CAD es para pilotos con licencia. Como alumno, tus vuelos los certifica la escuela. Cuando rindas la PPA, desde acá los vas a poder pasar."}
        </p>
      </div>
    );
  }

  const conectado = !!conexion?.disponible && conexion.conectado && conexion.estado === "ok";
  const listos = datos.borradores.filter((b) => !b.problema);
  const revisar = datos.borradores.filter((b) => b.problema);
  const total = datos.pasados + datos.borradores.length;
  const omitidos = datos.omitidos.length;
  const horasListas = listos.reduce((t, b) => t + b.horas, 0);
  const pct = (n: number) => `${total ? (100 * n) / total : 0}%`;

  const frase =
    total === 0
      ? `Todavía no cargaste vuelos en Vector.${TRAER_DEL_CAD ? " Si ya los declaraste en el CAD, traelos a Vector desde acá." : ""}`
      : datos.borradores.length === 0
        ? `Tus ${vuelos(total)} ya están en el CAD.`
        : `Te faltan pasar ${vuelos(datos.borradores.length)} al CAD.${revisar.length ? ` Hay ${revisar.length} para corregir antes.` : ""}`;

  return (
    <div className="space-y-10 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-3xl">
      <PageHeader eyebrow="Bitácora" title="Pasar al CAD" />

      {/* Con la extensión o el marcador conectados, esto se cambia por el panel (2.36.0). */}
      <ConElCad activo={!conectado}>
      {!conectado && (
      <section className="space-y-3">
        <p className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white leading-snug max-w-prose">{frase}</p>
        {total > 0 && (
          <>
            <div
              className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/5"
              role="img"
              aria-label={`${datos.pasados} en el CAD, ${listos.length} listos, ${revisar.length} para corregir`}
            >
              <span className="bg-emerald-500" style={{ width: pct(datos.pasados) }} />
              <span className="bg-aviation-blue dark:bg-aviation-cyan" style={{ width: pct(listos.length) }} />
              <span className="bg-amber-400" style={{ width: pct(revisar.length) }} />
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <li className="inline-flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full bg-emerald-500" /> <span className="data font-bold text-zinc-900 dark:text-white">{datos.pasados}</span> en el CAD
              </li>
              <li className="inline-flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full bg-aviation-blue dark:bg-aviation-cyan" />{" "}
                <span className="data font-bold text-zinc-900 dark:text-white">{listos.length}</span> listos ({horas(horasListas)} h)
              </li>
              {revisar.length > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-full bg-amber-400" /> <span className="data font-bold text-zinc-900 dark:text-white">{revisar.length}</span> para corregir
                </li>
              )}
              {omitidos > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <span className="data font-bold text-zinc-900 dark:text-white">{omitidos}</span> fuera de la lista (ya foliados o ignorados; se deshace desde el panel)
                </li>
              )}
            </ul>
          </>
        )}
      </section>
      )}

      {conectado ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-5 py-4">
            <span className="relative grid place-items-center w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white shrink-0">
              <ShieldCheck className="w-5 h-5 text-white dark:text-zinc-900" aria-hidden="true" />
              <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-950 bg-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white">Conectado a tu CAD</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Como <span className="data font-semibold text-zinc-700 dark:text-zinc-300">{conexion!.usuario}</span>. Vector carga los vuelos; la declaración
                jurada la hacés vos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ActualizarCad />
              <DesconectarCad />
            </div>
          </div>
          <PanelCad />
          <details className="group space-y-8">
            <summary className="flex items-center gap-2 cursor-pointer list-none text-sm font-semibold text-zinc-500 dark:text-zinc-400 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="w-4 h-4 transition-transform -rotate-90 group-open:rotate-0" aria-hidden="true" />
              Prefiero el marcador, desde la compu
            </summary>
            <PasosCad inicial={nav} corregir={revisar.length > 0} />
          </details>
        </>
      ) : conexion?.disponible ? (
        <section className="space-y-4">
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">¿Cómo querés pasarlos?</h2>
          <div className="rounded-3xl border-2 border-zinc-900 dark:border-white/80 bg-white dark:bg-white/[0.02] p-5 md:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white shrink-0">
                <Smartphone className="w-5 h-5 text-white dark:text-zinc-900" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Desde Vector</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
                  Conectás tu cuenta de ANAC una vez y pasás los vuelos desde acá, también desde el teléfono. Vector guarda tu usuario y tu contraseña cifrados y
                  entra al CAD por vos sólo cuando lo pedís.
                </p>
              </div>
            </div>
            <ConexionCad rechazada={conexion.estado === "rechazada" ? conexion.error : null} usuarioAnterior={conexion.usuario} />
          </div>
          <details className="group rounded-3xl border border-zinc-200 dark:border-white/10 p-5 md:p-6 open:space-y-8">
            <summary className="flex items-start gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/10 shrink-0">
                <Bookmark className="w-5 h-5 text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
              </span>
              <span className="space-y-1 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-base font-bold text-zinc-900 dark:text-white">
                  Con el marcador
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    Más privado
                  </span>
                </span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-prose">
                  Tu contraseña nunca pasa por Vector: cargás desde tu sesión del CAD, en la compu, con un marcador en la barra de favoritos.
                </span>
              </span>
              <ChevronDown className="w-4 h-4 mt-1 text-zinc-400 transition-transform -rotate-90 group-open:rotate-0" aria-hidden="true" />
            </summary>
            <PasosCad inicial={nav} corregir={revisar.length > 0} />
          </details>
        </section>
      ) : (
        <PasosCad inicial={nav} corregir={revisar.length > 0} />
      )}

      {!conectado && revisar.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">Para corregir antes de pasar</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">El panel no los manda hasta que estén bien. Corregirlos abre el vuelo en la bitácora.</p>
          </div>
          <ul className={LISTA}>
            {revisar.map((b) => (
              <Fila key={b.vectorId} b={b} corregir />
            ))}
          </ul>
        </section>
      )}

      {!conectado && listos.length > 0 && (
        <details className="group space-y-3">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-[15px] font-bold text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
            <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform -rotate-90 group-open:rotate-0" aria-hidden="true" />
            Listos para pasar <span className="data text-sm font-medium text-zinc-500 dark:text-zinc-400">{listos.length}</span>
          </summary>
          <ul className={LISTA}>
            {listos.map((b) => (
              <Fila key={b.vectorId} b={b} />
            ))}
          </ul>
        </details>
      )}
      </ConElCad>
    </div>
  );
}
