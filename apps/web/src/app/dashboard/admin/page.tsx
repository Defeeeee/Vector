import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/dashboard/PageHeader";
import { GraficoAltas, GraficoBarras, GraficoHoras, GraficoLicencias, GraficoMailsPorDia, GraficoVuelosPorMes } from "@/components/admin/GraficosLazy";
import {
  duracion, haceCuanto, momento, nombreDeMail, numero, pct, porcentaje, seriesDeMails, seriesDelPanel,
  type EstadisticasAdmin, type MailsAdmin,
} from "@/lib/admin";

/**
 * El panel de administración. **No es una pantalla de la app**: no está en la barra,
 * ni en Novedades, ni linkeado desde ningún lado. Se llega escribiendo la URL, y el
 * backend (`GET /admin/estadisticas`) contesta 404 a cualquiera que no esté en
 * `ADMINS_RED`, así que para un piloto esta ruta no existe.
 *
 * Mirar no escribe nada (invariante 15). Por defecto no cuenta a los admins: con
 * Federico adentro, casi todos los vuelos serían suyos. `?todos=1` los suma.
 */
export const metadata: Metadata = { title: "Panel · Vector", robots: { index: false, follow: false } };

const tarjeta = "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8";

const NOMBRES_TABLAS: Record<string, string> = {
  perfiles: "perfiles", aviones: "aviones", documentos: "documentos", vuelos: "vuelos", arrobas: "@",
  publicaciones: "publicaciones", seguimientos: "seguimientos", aplausos: "aplausos", comentarios: "comentarios",
  push: "avisos push", transacciones: "saldo", packs: "packs", programados: "vuelos programados",
  metricas: "métricas propias", auditoria: "auditoría", reportes: "reportes", chats_whatsapp: "chats de WhatsApp",
  mail_envios: "mails enviados", mail_eventos: "aperturas y clics de mails",
};

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className={`${tarjeta} !p-5 md:!p-6`}>
      <p className="eyebrow">{titulo}</p>
      <p className="data text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mt-2 leading-none">{valor}</p>
      {nota && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{nota}</p>}
    </div>
  );
}

function Bloque({ titulo, nota, children, className = "" }: { titulo: string; nota?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${tarjeta} ${className}`}>
      <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">{titulo}</h3>
      {nota && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{nota}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Si({ valor }: { valor: boolean }) {
  return valor ? <Check className="w-4 h-4 text-emerald-500 mx-auto" strokeWidth={3} /> : <Minus className="w-4 h-4 text-zinc-300 dark:text-zinc-700 mx-auto" />;
}

function Ranking({ filas, vacio }: { filas: { nombre: string; valor: number }[]; vacio: string }) {
  if (!filas.length) return <p className="text-sm text-zinc-500">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor));
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.nombre} className="text-sm">
          <div className="flex justify-between mb-1">
            <span className="data font-bold text-zinc-900 dark:text-white">{f.nombre}</span>
            <span className="data text-zinc-500">{f.valor}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-aviation-blue dark:bg-aviation-cyan" style={{ width: `${(100 * f.valor) / max}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Los mails: cuántos salieron, cuántos se abrieron y qué links se tocaron
 * (`lib/mail-seguimiento.ts`). Todo se cuenta por mail enviado, no por evento, y la nota
 * de arriba dice qué tan en serio tomar cada número.
 */
function Mails({ m, generado }: { m: MailsAdmin; generado: string }) {
  const t = m.totales;
  const series = seriesDeMails(m);
  return (
    <>
      <div className="pt-6">
        <h2 className="text-2xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">Mails</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-3xl">
          Medido por Vector, por mail enviado. <strong>Abierto</strong> es que el correo pidió la imagen del mail pasado el primer minuto, o que alguien tocó un
          link.{" "}
          <strong>Al instante</strong> es que la pidió en el primer minuto y nunca más: puede ser el correo revisando el mail al recibirlo, o
          alguien que lo abrió enseguida. En Gmail, además, si la imagen ya se bajó al instante, abrirlo más tarde no se nota. Por eso es un estado
          aparte y no se suma a ninguno de los dos lados. <strong>El clic es lo más confiable</strong>: pasa siempre por Vector.
        </p>
      </div>

      {t.enviados === 0 ? (
        <p className={`${tarjeta} text-sm text-zinc-600 dark:text-zinc-300`}>Todavía no salió ningún mail con seguimiento.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Dato titulo="Enviados" valor={numero(t.enviados)} nota={`a ${m.pilotos.con_mails} ${m.pilotos.con_mails === 1 ? "piloto" : "pilotos"}`} />
            <Dato titulo="Abiertos" valor={pct(t.tasa_apertura)} nota={`${t.abiertos} de ${t.enviados} mails, con certeza`} />
            <Dato titulo="Con clic" valor={pct(t.tasa_clic)} nota={`${t.con_clic} mails · ${pct(t.clic_sobre_abiertos)} de los abiertos`} />
            <Dato titulo="Hasta abrirlo" valor={duracion(t.minutos_hasta_abrir)} nota="la mediana, desde el envío" />
            <Dato titulo="Abrieron alguno" valor={numero(m.pilotos.abrieron_alguno)} nota={`${porcentaje(m.pilotos.abrieron_alguno, m.pilotos.con_mails)} de los pilotos con mails`} />
            <Dato titulo="Hicieron clic" valor={numero(m.pilotos.hicieron_clic)} nota={`${porcentaje(m.pilotos.hicieron_clic, m.pilotos.con_mails)} de los pilotos con mails`} />
            <Dato titulo="Al instante" valor={numero(t.al_instante ?? 0)} nota={`mails con señal sólo en el primer minuto · con ellos, ${porcentaje(t.abiertos + (t.al_instante ?? 0), t.enviados)}`} />
            <Dato titulo="Sin señales" valor={numero(t.sin_senales ?? 0)} nota={`mails · ${m.pilotos.nunca_abrieron} ${m.pilotos.nunca_abrieron === 1 ? "piloto" : "pilotos"} sin ninguna: spam, o imágenes bloqueadas`} />
          </div>

          <Bloque titulo="Por mail" nota="Cada tanda por separado, de la más nueva a la más vieja.">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[940px]">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="font-medium pb-2 px-2">Mail</th>
                    <th className="font-medium pb-2 px-2 text-right">Enviados</th>
                    <th className="font-medium pb-2 px-2 text-right">Abiertos</th>
                    <th className="font-medium pb-2 px-2 text-right">Con clic</th>
                    <th className="font-medium pb-2 px-2 text-right">Hasta abrirlo</th>
                    <th className="font-medium pb-2 px-2 text-right">Al instante</th>
                    <th className="font-medium pb-2 px-2">Link más tocado</th>
                    <th className="font-medium pb-2 px-2 text-right">Último envío</th>
                  </tr>
                </thead>
                <tbody>
                  {m.campanas.map((c) => (
                    <tr key={`${c.tipo}|${c.clave ?? ""}`} className="border-t border-zinc-100 dark:border-white/5">
                      <td className="py-2.5 px-2 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{nombreDeMail(c.tipo, c.clave)}</td>
                      <td className="py-2.5 px-2 data text-right font-bold text-zinc-900 dark:text-white">{c.enviados}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap text-right text-zinc-700 dark:text-zinc-300">{c.abiertos} · {pct(c.tasa_apertura)}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap text-right text-zinc-700 dark:text-zinc-300">{c.con_clic} · {pct(c.tasa_clic)}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap text-right text-zinc-600 dark:text-zinc-400">{duracion(c.minutos_hasta_abrir)}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap text-right text-zinc-500">{c.al_instante ?? 0}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap text-zinc-600 dark:text-zinc-400">{c.destinos[0] ? `${c.destinos[0].destino} (${c.destinos[0].clics})` : "—"}</td>
                      <td className="py-2.5 px-2 text-right text-zinc-500 whitespace-nowrap">{haceCuanto(c.ultimo_envio, generado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloque>

          <Bloque titulo="Mails por día" nota="Últimos 30 días, en hora argentina. Cada mail abierto o con clic se cuenta el día de la primera vez.">
            <GraficoMailsPorDia datos={series.porDia} />
          </Bloque>

          <div className="grid lg:grid-cols-3 gap-6">
            <Bloque titulo="A qué hora los abren" nota="La primera apertura de cada mail, en hora argentina." className="lg:col-span-2">
              <GraficoHoras datos={series.porHora} />
            </Bloque>
            <Bloque titulo="Cuánto tardan en abrirlo" nota="Desde el envío.">
              <Ranking filas={m.hasta_abrir.map((h) => ({ nombre: h.tramo, valor: h.mails }))} vacio="Todavía no se abrió ninguno." />
            </Bloque>
          </div>

          <Bloque titulo="Qué links tocan" nota="A dónde iba cada link, sin datos de la dirección: la pantalla de Vector o el sitio de afuera. Cada link cuenta una vez por mail.">
            <Ranking filas={m.destinos.map((d) => ({ nombre: d.destino, valor: d.clics }))} vacio="Todavía nadie tocó un link." />
          </Bloque>

          <Bloque titulo="Últimos mails" nota="Sin direcciones de mail: cada cuenta se muestra por su @, si lo creó.">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="font-medium pb-2 px-2">Enviado</th>
                    <th className="font-medium pb-2 px-2">Mail</th>
                    <th className="font-medium pb-2 px-2">Cuenta</th>
                    <th className="font-medium pb-2 px-2">Abierto</th>
                    <th className="font-medium pb-2 px-2 text-right">Clics</th>
                    <th className="font-medium pb-2 px-2">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {m.ultimos.map((u, i) => (
                    <tr key={i} className="border-t border-zinc-100 dark:border-white/5">
                      <td className="py-2.5 px-2 data text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{momento(u.enviado) ?? "—"}</td>
                      <td className="py-2.5 px-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{nombreDeMail(u.tipo, u.clave)}</td>
                      <td className="py-2.5 px-2">{u.arroba ? <span className="font-semibold text-zinc-900 dark:text-white">@{u.arroba}</span> : <span className="text-zinc-400">sin @</span>}</td>
                      <td className="py-2.5 px-2 data whitespace-nowrap">
                        {u.abierto ? (
                          <span className="text-emerald-600 dark:text-emerald-400">{momento(u.abierto)}</span>
                        ) : u.al_instante ? (
                          <span className="text-amber-600 dark:text-amber-400">al instante</span>
                        ) : (
                          <span className="text-zinc-400">sin señales</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 data text-right font-bold text-zinc-900 dark:text-white">{u.clics}</td>
                      <td className="py-2.5 px-2 data text-zinc-500">{u.destinos.length ? u.destinos.join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloque>
        </>
      )}
    </>
  );
}

export default async function PanelAdmin({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const { todos } = await searchParams;
  const incluirAdmins = todos === "1";
  const res = await apiFetch(`/admin/estadisticas${incluirAdmins ? "?incluir_admins=true" : ""}`);

  if (res.status === 401) redirect("/api/auth/logout?redirect=/?expired=true");
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Administración" title="Panel" />
        <p className={`${tarjeta} text-sm text-zinc-600 dark:text-zinc-300`}>No se pudieron leer las estadísticas (HTTP {res.status}). Probá de nuevo en un rato.</p>
      </div>
    );
  }

  const e: EstadisticasAdmin = await res.json();
  const t = e.totales;
  const series = seriesDelPanel(e);

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        eyebrow="Administración"
        title="Panel"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin/pegatinas"
              className="text-sm font-semibold px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
            >
              Pegatinas con QR
            </Link>
            <Link
              href={incluirAdmins ? "/dashboard/admin" : "/dashboard/admin?todos=1"}
              className="text-sm font-semibold px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
            >
              {incluirAdmins ? "Sin contarme" : "Contarme también"}
            </Link>
          </div>
        }
      >
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Actualizado {momento(e.generado)} ·{" "}
          {incluirAdmins ? "con todas las cuentas" : `sin contar ${e.admins_excluidos === 1 ? "tu cuenta" : `${e.admins_excluidos} cuentas de admin`}`}
        </p>
      </PageHeader>

      {e.no_disponible.length > 0 && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-700 dark:text-amber-300">
          No se pudo leer: {e.no_disponible.map((n) => NOMBRES_TABLAS[n] ?? n).join(", ")}. Esos números pueden estar en cero sin serlo.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Dato titulo="Cuentas" valor={numero(t.cuentas)} nota={`+${t.altas_7d} en 7 días · +${t.altas_30d} en 30`} />
        <Dato titulo="Altas hoy" valor={numero(t.altas_hoy)} nota="en hora argentina" />
        <Dato titulo="Activos 7 días" valor={numero(t.activos_7d)} nota={`${porcentaje(t.activos_7d, t.cuentas)} de las cuentas`} />
        <Dato titulo="Activos 30 días" valor={numero(t.activos_30d)} nota={`${porcentaje(t.activos_30d, t.cuentas)} de las cuentas`} />
        <Dato titulo="Con vuelos" valor={numero(t.con_vuelos)} nota={`${porcentaje(t.con_vuelos, t.cuentas)} cargó al menos uno`} />
        <Dato titulo="Vuelos" valor={numero(t.vuelos)} nota={`${t.vuelos_30d} con fecha en los últimos 30 días`} />
        <Dato titulo="Horas en libros" valor={numero(t.horas, 1)} nota="la suma de todos los vuelos" />
        <Dato titulo="WhatsApp" valor={numero(t.con_whatsapp)} nota={`${t.chats_whatsapp} chats con el copiloto`} />
      </div>

      <Bloque titulo="Altas por día" nota="Últimos 60 días. La línea son las cuentas que había al terminar cada día.">
        <GraficoAltas datos={series.altas} />
      </Bloque>

      <div className="grid lg:grid-cols-2 gap-6">
        <Bloque titulo="Activación" nota="Cada paso se cuenta por separado: no es un embudo.">
          <GraficoBarras datos={e.activacion.map((a) => ({ nombre: a.paso, valor: a.cuentas, nota: `${String(a.pct).replace(".", ",")} %` }))} />
        </Bloque>
        <Bloque titulo="Último ingreso" nota="Cuándo entró cada cuenta por última vez.">
          <GraficoBarras datos={e.ultimo_ingreso.map((u) => ({ nombre: u.tramo, valor: u.cuentas }))} />
        </Bloque>
      </div>

      <Bloque titulo="Uso de cada función" nota="Cuentas que la usaron al menos una vez.">
        <GraficoBarras datos={e.uso_funciones.map((u) => ({ nombre: u.funcion, valor: u.cuentas, nota: `${String(u.pct).replace(".", ",")} %` }))} />
      </Bloque>

      <Bloque titulo="Vuelos por mes" nota="Por fecha de vuelo: un libro importado aparece en los meses en que se voló. Barras: horas · línea: pilotos distintos.">
        <GraficoVuelosPorMes datos={series.vuelosPorMes} />
      </Bloque>

      <div className="grid lg:grid-cols-3 gap-6">
        <Bloque titulo="Licencias">
          <GraficoLicencias datos={e.licencias} />
        </Bloque>
        <Bloque titulo="Aeródromos más volados">
          <Ranking filas={e.top_aerodromos.map((a) => ({ nombre: a.codigo, valor: a.vuelos }))} vacio="Todavía no hay vuelos." />
        </Bloque>
        <Bloque titulo="Aeronaves más voladas">
          <Ranking filas={e.top_aeronaves.map((a) => ({ nombre: a.tipo, valor: a.vuelos }))} vacio="Todavía no hay vuelos." />
        </Bloque>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Bloque titulo="La red">
          <div className="grid grid-cols-3 gap-4">
            {[["@ creados", t.con_arroba], ["Publicaciones", t.publicaciones], ["Seguimientos", t.seguimientos], ["Aplausos", t.aplausos], ["Comentarios", t.comentarios], ["Avisos push", t.con_push]].map(([n, v]) => (
              <div key={n as string}>
                <p className="eyebrow">{n}</p>
                <p className="data text-2xl font-bold text-zinc-900 dark:text-white mt-1">{v}</p>
              </div>
            ))}
          </div>
          {t.reportes > 0 && <p className="mt-5 text-sm text-amber-600 dark:text-amber-400">{t.reportes} reporte{t.reportes === 1 ? "" : "s"} para revisar (tabla reportes).</p>}
        </Bloque>
        <Bloque titulo="Cohortes por semana de alta" nota="De los que entraron cada semana, cuántos ya cargaron un avión y un vuelo.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 dark:text-zinc-400">
                <th className="font-medium pb-2">Semana</th>
                <th className="font-medium pb-2 text-right">Altas</th>
                <th className="font-medium pb-2 text-right">Avión</th>
                <th className="font-medium pb-2 text-right">Vuelo</th>
              </tr>
            </thead>
            <tbody className="data">
              {series.cohortes.map((c) => (
                <tr key={c.semana} className="border-t border-zinc-100 dark:border-white/5">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300">{c.etiqueta.replace("semana del ", "")}</td>
                  <td className="py-2 text-right font-bold text-zinc-900 dark:text-white">{c.altas}</td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{c.altas ? `${c.con_avion} · ${porcentaje(c.con_avion, c.altas)}` : "—"}</td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{c.altas ? `${c.con_vuelo} · ${porcentaje(c.con_vuelo, c.altas)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </div>

      <Bloque titulo="Últimas altas" nota="Sin mails ni nombres: cada cuenta se muestra por su @, si lo creó.">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-zinc-500 dark:text-zinc-400">
                <th className="font-medium pb-2 px-2">Alta</th>
                <th className="font-medium pb-2 px-2">Cuenta</th>
                <th className="font-medium pb-2 px-2">Licencia</th>
                <th className="font-medium pb-2 px-2 text-center">Avión</th>
                <th className="font-medium pb-2 px-2 text-center">CMA</th>
                <th className="font-medium pb-2 px-2 text-center">WhatsApp</th>
                <th className="font-medium pb-2 px-2 text-right">Vuelos</th>
                <th className="font-medium pb-2 px-2 text-right">Último ingreso</th>
              </tr>
            </thead>
            <tbody>
              {e.ultimas_altas.map((u, i) => (
                <tr key={i} className="border-t border-zinc-100 dark:border-white/5">
                  <td className="py-2.5 px-2 data text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{momento(u.alta) ?? "—"}</td>
                  <td className="py-2.5 px-2">{u.arroba ? <span className="font-semibold text-zinc-900 dark:text-white">@{u.arroba}</span> : <span className="text-zinc-400">sin @</span>}</td>
                  <td className="py-2.5 px-2 data text-zinc-700 dark:text-zinc-300">{u.licencia ?? "—"}</td>
                  <td className="py-2.5 px-2"><Si valor={u.avion} /></td>
                  <td className="py-2.5 px-2"><Si valor={u.cma} /></td>
                  <td className="py-2.5 px-2"><Si valor={u.whatsapp} /></td>
                  <td className="py-2.5 px-2 data text-right font-bold text-zinc-900 dark:text-white">{u.vuelos}</td>
                  <td className="py-2.5 px-2 text-right text-zinc-500 whitespace-nowrap">{haceCuanto(u.ultimo_ingreso, e.generado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>

      {e.mails && <Mails m={e.mails} generado={e.generado} />}
    </div>
  );
}
