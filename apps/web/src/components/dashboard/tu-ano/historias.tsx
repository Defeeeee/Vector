import type { ReactNode } from "react";
import Link from "next/link";
import { formatearNumero, VUELTA_AL_MUNDO_NM, type TuAno } from "@/lib/tu-ano";
import ExportarImagen from "./ExportarImagen";
import { Aparece, BarrasPorMes, Contador, FRASE, MapaDePuntos, NUMERO, Rotulo } from "./piezas";

/**
 * Las historias de "Tu año en vuelo": cada una una idea, con su fondo y su acento. **Cada
 * frase sale de los números**: si el dato no está, la historia no se arma.
 */

export interface Historia {
  id: string;
  fondo: string;
  acento: string;
  /** Con auto-avance. La del cierre se queda hasta que el piloto la cierre. */
  auto: boolean;
  contenido: ReactNode;
}

const NOCHE = "#0b0d10";
const degrade = (a: string, b: string, angulo = 165) => `linear-gradient(${angulo}deg, ${NOCHE} 0%, ${a} 62%, ${b} 100%)`;
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const horasTxt = (h: number) => formatearNumero(h, 1);

function Pantalla({ rotulo, acento, children, pie }: { rotulo: string; acento: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <div className="flex flex-col h-full px-[8cqw] pt-[24cqw] pb-[10cqw]">
      <Aparece>
        <Rotulo color={acento}>{rotulo}</Rotulo>
      </Aparece>
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-[6cqw]">{children}</div>
      {pie && <Aparece retraso={1.1}>{pie}</Aparece>}
    </div>
  );
}

export function historiasDe(t: TuAno, anios: number[]): Historia[] {
  if (t.vuelos === 0) {
    return [
      {
        id: "vacio",
        fondo: degrade("#0c1a26", "#0e3a52"),
        acento: "#38bdf8",
        auto: false,
        contenido: (
          <Pantalla rotulo={`Tu ${t.anio} en vuelo`} acento="#38bdf8">
            <Aparece retraso={0.2}>
              <h2 className="font-display font-extrabold text-[13cqw] leading-[0.95] tracking-[-0.05em] text-white text-balance">
                Todavía no hay vuelos en {t.anio}
              </h2>
            </Aparece>
            <Aparece retraso={0.5}>
              <p className={FRASE}>Cuando cargues el primero, acá vas a ver cómo se te fue el año.</p>
            </Aparece>
          </Pantalla>
        ),
      },
    ];
  }

  const h: Historia[] = [];

  // 1. Portada ---------------------------------------------------------------
  h.push({
    id: "portada",
    fondo: `radial-gradient(circle at 80% 8%, rgba(56,189,248,0.38), rgba(11,13,16,0) 55%), linear-gradient(180deg, ${NOCHE} 0%, #0c1a26 100%)`,
    acento: "#38bdf8",
    auto: true,
    contenido: (
      <Pantalla
        rotulo="Vector · resumen del año"
        acento="#38bdf8"
        pie={
          anios.length > 1 ? (
            <div data-no-tap className="flex flex-wrap gap-2">
              {anios.map((a) => (
                <Link
                  key={a}
                  href={`/dashboard/summary/tu-ano?anio=${a}`}
                  aria-current={a === t.anio ? "page" : undefined}
                  className={`inline-flex items-center min-h-11 px-4 rounded-full font-mono text-[13px] font-semibold border ${
                    a === t.anio ? "bg-aviation-cyan text-noche border-aviation-cyan" : "border-white/20 text-white/75"
                  }`}
                >
                  {a}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      >
        <Aparece retraso={0.2}>
          <h2 className="font-display font-extrabold text-[21cqw] leading-[0.88] tracking-[-0.07em] text-white">
            Tu <span style={{ color: "#38bdf8" }}>{t.anio}</span>
            <br />
            en vuelo
          </h2>
        </Aparece>
        <Aparece retraso={0.6}>
          <p className={FRASE}>Tocá para avanzar. Mantené apretado para frenar.</p>
        </Aparece>
      </Pantalla>
    ),
  });

  // 2. Horas -----------------------------------------------------------------
  const acH = "#38bdf8";
  h.push({
    id: "horas",
    fondo: degrade("#082f49", "#0c4a6e"),
    acento: acH,
    auto: true,
    contenido: (
      <Pantalla rotulo="Horas en el aire" acento={acH}>
        <div className="flex items-baseline gap-[2cqw]">
          <Contador valor={t.horas} decimales={1} className={`${NUMERO} text-[34cqw] text-white`} />
          <span className="font-display font-extrabold text-[9cqw] tracking-[-0.03em]" style={{ color: acH }}>h</span>
        </div>
        <Aparece retraso={0.9}>
          <p className={FRASE}>
            {t.horas >= 24
              ? `Son ${formatearNumero(t.horas / 24, 1)} días enteros sin bajarte del avión, repartidos en ${t.dias} ${t.dias === 1 ? "día" : "días"} con vuelo.`
              : `Son ${formatearNumero(Math.round(t.horas * 60))} minutos de cielo, en ${t.dias} ${t.dias === 1 ? "día" : "días"} con vuelo.`}
          </p>
        </Aparece>
      </Pantalla>
    ),
  });

  // 3. Vuelos y aterrizajes --------------------------------------------------
  const acV = "#a5b4fc";
  h.push({
    id: "vuelos",
    fondo: degrade("#1e1b4b", "#312e81"),
    acento: acV,
    auto: true,
    contenido: (
      <Pantalla rotulo="Vuelos y aterrizajes" acento={acV}>
        <div className="flex items-end gap-[6cqw]">
          <div>
            <Contador valor={t.vuelos} className={`${NUMERO} text-[30cqw] text-white block`} />
            <p className="font-mono text-[3.4cqw] uppercase tracking-[0.16em] mt-[1.5cqw]" style={{ color: acV }}>{t.vuelos === 1 ? "vuelo" : "vuelos"}</p>
          </div>
          <div className="pb-[1cqw]">
            <Contador valor={t.aterrizajes} retraso={0.5} className={`${NUMERO} text-[17cqw] text-white/90 block`} />
            <p className="font-mono text-[3.4cqw] uppercase tracking-[0.16em] mt-[1.5cqw]" style={{ color: acV }}>{t.aterrizajes === 1 ? "aterrizaje" : "aterrizajes"}</p>
          </div>
        </div>
        <Aparece retraso={1}>
          <p className={FRASE}>
            {t.aterrizajes > t.vuelos
              ? `${formatearNumero(t.aterrizajes)} aterrizajes en ${formatearNumero(t.vuelos)} ${t.vuelos === 1 ? "vuelo" : "vuelos"}: algún circuito hubo.`
              : `${formatearNumero(t.aterrizajes)} ${t.aterrizajes === 1 ? "aterrizaje" : "aterrizajes"} anotados en el año.`}
          </p>
        </Aparece>
      </Pantalla>
    ),
  });

  // 4. Aeródromos ------------------------------------------------------------
  if (t.aerodromos > 0) {
    const acA = "#5eead4";
    h.push({
      id: "aerodromos",
      fondo: degrade("#052e2b", "#0f4f4a"),
      acento: acA,
      auto: true,
      contenido: (
        <Pantalla rotulo="Aeródromos" acento={acA}>
          <div className="flex items-baseline gap-[3cqw]">
            <Contador valor={t.aerodromos} className={`${NUMERO} text-[28cqw] text-white`} />
            <span className="font-display font-bold text-[6.5cqw] tracking-[-0.02em] text-white/80">{t.aerodromos === 1 ? "lugar" : "lugares"}</span>
          </div>
          {t.mapa.puntos.length > 0 && <MapaDePuntos mapa={t.mapa} base={t.base?.codigo ?? null} acento={acA} />}
          {t.base && (
            <Aparece retraso={1.1}>
              <p className={FRASE}>
                Tu base fue {t.base.nombre} ({t.base.codigo}), con {t.base.visitas} {t.base.visitas === 1 ? "aparición" : "apariciones"} en tus rutas.
              </p>
            </Aparece>
          )}
        </Pantalla>
      ),
    });
  }

  // 5. Distancia -------------------------------------------------------------
  if (t.distanciaNm > 0) {
    const acD = "#fdba74";
    const vueltas = t.distanciaNm / VUELTA_AL_MUNDO_NM;
    h.push({
      id: "distancia",
      fondo: degrade("#431407", "#9a3412"),
      acento: acD,
      auto: true,
      contenido: (
        <Pantalla rotulo="Distancia recorrida" acento={acD} pie={<p className="text-[3.4cqw] text-white/55">Aproximada: suma los tramos de la ruta que escribiste, sin contar desvíos ni circuitos.</p>}>
          <div className="flex items-baseline gap-[2cqw]">
            <Contador valor={t.distanciaNm} className={`${NUMERO} text-[27cqw] text-white`} />
            <span className="font-display font-extrabold text-[8cqw] tracking-[-0.03em]" style={{ color: acD }}>NM</span>
          </div>
          <Aparece retraso={0.9}>
            <p className={FRASE}>
              {vueltas >= 1
                ? `Eso es ${formatearNumero(vueltas, 1)} vueltas al mundo por el ecuador.`
                : `Eso es el ${formatearNumero(Math.max(1, Math.round(vueltas * 100)))}% de una vuelta al mundo por el ecuador.`}
            </p>
          </Aparece>
        </Pantalla>
      ),
    });
  }

  // 6. El vuelo más largo ----------------------------------------------------
  if (t.masLargo) {
    const acL = "#f9a8d4";
    h.push({
      id: "largo",
      fondo: degrade("#3b0a2a", "#831843"),
      acento: acL,
      auto: true,
      contenido: (
        <Pantalla rotulo="Tu vuelo más largo" acento={acL}>
          <div className="flex items-baseline gap-[2cqw]">
            <Contador valor={t.masLargo.horas} decimales={1} className={`${NUMERO} text-[32cqw] text-white`} />
            <span className="font-display font-extrabold text-[9cqw] tracking-[-0.03em]" style={{ color: acL }}>h</span>
          </div>
          <Aparece retraso={0.8}>
            <p className="font-display font-extrabold text-[8.5cqw] leading-[1] tracking-[-0.04em] text-white text-balance">
              {t.masLargo.local ? `Local en ${t.masLargo.ruta}` : t.masLargo.ruta}
            </p>
          </Aparece>
          <Aparece retraso={1}>
            <p className={FRASE}>
              {t.masLargo.fecha ? `Fue el ${t.masLargo.fecha}.` : ""} {t.masLargo.local ? "Un vuelo local, sin salir de la zona del aeródromo." : "El que más tiempo te tuvo en el aire este año."}
            </p>
          </Aparece>
        </Pantalla>
      ),
    });
  }

  // 7. Tu mes ----------------------------------------------------------------
  if (t.mesTop) {
    const acM = "#bef264";
    const pct = Math.round((t.mesTop.horas / t.horas) * 100);
    h.push({
      id: "mes",
      fondo: degrade("#1a2e05", "#365314"),
      acento: acM,
      auto: true,
      contenido: (
        <Pantalla rotulo="Tu mes" acento={acM}>
          <Aparece retraso={0.15}>
            <h2 className="font-display font-extrabold text-[22cqw] leading-[0.9] tracking-[-0.07em] text-white">{mayuscula(t.mesTop.nombre)}</h2>
          </Aparece>
          <BarrasPorMes horasPorMes={t.horasPorMes} acento={acM} />
          <Aparece retraso={1.2}>
            <p className={FRASE}>
              En {t.mesTop.nombre} volaste {horasTxt(t.mesTop.horas)} h, el {pct}% de todo tu año.
            </p>
          </Aparece>
        </Pantalla>
      ),
    });
  }

  // 8. Tu estilo: el momento del día ----------------------------------------
  if (t.momento) {
    const acE = "#67e8f9";
    h.push({
      id: "estilo",
      fondo: degrade("#0c1a26", "#164e63"),
      acento: acE,
      auto: true,
      contenido: (
        <Pantalla rotulo="Tu estilo" acento={acE}>
          {t.momento && (
            <Aparece retraso={0.2}>
              <p className="font-mono text-[3.4cqw] uppercase tracking-[0.16em] mb-[2cqw]" style={{ color: acE }}>Cuándo volás</p>
              <p className="font-display font-extrabold text-[13cqw] leading-[0.95] tracking-[-0.05em] text-white text-balance">
                Volás sobre todo {t.momento.nombre}
              </p>
              <p className={`${FRASE} mt-[2.5cqw]`}>
                {horasTxt(t.momento.horas)} h entre las {t.momento.rango}, hora argentina.
              </p>
            </Aparece>
          )}
        </Pantalla>
      ),
    });
  }

  // 8 bis. Tus aviones: los más volados, con matrícula (Federico, 2026-11-15) ---
  if (t.aviones.length) {
    const acA = "#fde047";
    const max = t.aviones[0].horas || 1;
    h.push({
      id: "aviones",
      fondo: degrade("#1a1605", "#3f3a0b"),
      acento: acA,
      auto: true,
      contenido: (
        <Pantalla
          rotulo={t.aviones.length === 1 ? "Tu avión del año" : "Tus aviones del año"}
          acento={acA}
          pie={<p className={FRASE}>{t.aviones.length === 1 ? `Todas tus horas del año en ${t.aviones[0].matricula}.` : `${t.aviones[0].matricula} se llevó la mayor parte: ${horasTxt(t.aviones[0].horas)} h.`}</p>}
        >
          {t.aviones.map((a, i) => (
            <Aparece key={a.matricula} retraso={0.2 + i * 0.35}>
              <p className={`font-display font-extrabold leading-[0.95] tracking-[-0.04em] text-white ${i === 0 ? "text-[15cqw]" : "text-[10cqw]"}`}>{a.matricula}</p>
              <p className="font-mono text-[3.4cqw] uppercase tracking-[0.12em] mt-[1.5cqw]" style={{ color: acA }}>
                {[a.tipo, `${horasTxt(a.horas)} h`, `${a.vuelos} ${a.vuelos === 1 ? "vuelo" : "vuelos"}`].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-[2cqw] h-[1.6cqw] rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (a.horas / max) * 100)}%`, backgroundColor: acA }} />
              </div>
            </Aparece>
          ))}
        </Pantalla>
      ),
    });
  }

  // 9. Noche e instrumentos --------------------------------------------------
  if (t.nocheHoras > 0 || t.ifrHoras > 0) {
    const acN = "#c4b5fd";
    h.push({
      id: "noche",
      fondo: degrade("#0f0a2a", "#1e1b4b"),
      acento: acN,
      auto: true,
      contenido: (
        <Pantalla rotulo={t.nocheHoras > 0 && t.ifrHoras > 0 ? "Noche e instrumentos" : t.nocheHoras > 0 ? "Vuelo nocturno" : "Instrumentos"} acento={acN}>
          {t.nocheHoras > 0 && (
            <div>
              <p className="font-mono text-[3.4cqw] uppercase tracking-[0.16em] mb-[1cqw]" style={{ color: acN }}>De noche</p>
              <div className="flex items-baseline gap-[2cqw]">
                <Contador valor={t.nocheHoras} decimales={1} className={`${NUMERO} text-[22cqw] text-white`} />
                <span className="font-display font-extrabold text-[7cqw]" style={{ color: acN }}>h</span>
              </div>
            </div>
          )}
          {t.ifrHoras > 0 && (
            <div>
              <p className="font-mono text-[3.4cqw] uppercase tracking-[0.16em] mb-[1cqw]" style={{ color: acN }}>Por instrumentos (IMC)</p>
              <div className="flex items-baseline gap-[2cqw]">
                <Contador valor={t.ifrHoras} decimales={1} retraso={0.5} className={`${NUMERO} text-[22cqw] text-white`} />
                <span className="font-display font-extrabold text-[7cqw]" style={{ color: acN }}>h</span>
              </div>
            </div>
          )}
          <Aparece retraso={1}>
            <p className={FRASE}>
              {t.nocheHoras > 0 && `${Math.round((t.nocheHoras / t.horas) * 100)}% de tus horas fueron de noche.`}{" "}
              {t.ifrHoras > 0 && `${Math.round((t.ifrHoras / t.horas) * 100)}% fueron en instrumentos.`}
            </p>
          </Aparece>
        </Pantalla>
      ),
    });
  }

  // 10. Hitos ------------------------------------------------------------------
  if (t.hitos.horas || t.hitos.ppa) {
    const acT = "#fde047";
    h.push({
      id: "hitos",
      fondo: degrade("#3a2a05", "#854d0e"),
      acento: acT,
      auto: true,
      contenido: (
        <Pantalla rotulo="Hitos del año" acento={acT}>
          {t.hitos.horas && (
            <Aparece retraso={0.2}>
              <p className="font-display font-extrabold text-[9cqw] leading-none tracking-[-0.04em] text-white/80">Pasaste las</p>
              <p className={`${NUMERO} text-[30cqw] text-white`}>{formatearNumero(t.hitos.horas)}</p>
              <p className="font-display font-extrabold text-[9cqw] leading-none tracking-[-0.04em]" style={{ color: acT }}>horas de vuelo en total</p>
            </Aparece>
          )}
          {t.hitos.ppa && (
            <Aparece retraso={0.9}>
              <p className="font-display font-extrabold text-[12cqw] leading-[0.95] tracking-[-0.05em] text-white text-balance">
                Rendiste la PPA
              </p>
              <p className={`${FRASE} mt-[2cqw]`}>El {t.hitos.ppa.fecha}. De ahí en más, el cielo es tuyo.</p>
            </Aparece>
          )}
        </Pantalla>
      ),
    });
  }

  // 11. Contra el año anterior -------------------------------------------------
  if (t.comparacion) {
    const acC = "#6ee7b7";
    const c = t.comparacion;
    h.push({
      id: "comparacion",
      fondo: degrade("#07261f", "#065f46"),
      acento: acC,
      auto: true,
      contenido: (
        <Pantalla rotulo={`Contra ${c.anioAnterior}`} acento={acC}>
          {c.porcentaje === 0 ? (
            <Aparece retraso={0.2}>
              <h2 className="font-display font-extrabold text-[18cqw] leading-[0.92] tracking-[-0.06em] text-white">Igual que en {c.anioAnterior}</h2>
            </Aparece>
          ) : (
            <div className="flex items-baseline">
              <span className={`${NUMERO} text-[30cqw] text-white`}>{c.porcentaje > 0 ? "+" : "−"}</span>
              <Contador valor={Math.abs(c.porcentaje)} className={`${NUMERO} text-[30cqw] text-white`} />
              <span className="font-display font-extrabold text-[14cqw] tracking-[-0.04em]" style={{ color: acC }}>%</span>
            </div>
          )}
          <Aparece retraso={0.9}>
            <p className={FRASE}>
              {horasTxt(t.horas)} h este año contra {horasTxt(c.horasAnterior)} h en {c.anioAnterior}.{" "}
              {c.porcentaje > 0 ? "Más cielo que el año pasado." : c.porcentaje < 0 ? "Un año más tranquilo; el cielo espera." : ""}
            </p>
          </Aparece>
        </Pantalla>
      ),
    });
  }

  // 12. Cierre: exportar -------------------------------------------------------
  const acF = "#38bdf8";
  h.push({
    id: "cierre",
    fondo: `radial-gradient(circle at 20% 100%, rgba(56,189,248,0.3), rgba(11,13,16,0) 60%), linear-gradient(180deg, ${NOCHE} 0%, #0c1a26 100%)`,
    acento: acF,
    auto: false,
    contenido: (
      <div className="flex flex-col h-full px-[7cqw] pt-[22cqw] pb-[6cqw] gap-[3cqw]">
        <Aparece>
          <Rotulo color={acF}>Para compartir</Rotulo>
          <h2 className="font-display font-extrabold text-[10.5cqw] leading-[0.95] tracking-[-0.05em] text-white mt-[1.5cqw]">
            Tu {t.anio}, en una imagen
          </h2>
        </Aparece>
        <ExportarImagen anio={t.anio} acento={acF} />
        <p className="text-center text-[3cqw] text-white/45">No lleva matrícula ni tu apellido.</p>
      </div>
    ),
  });

  return h;
}
