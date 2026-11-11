/**
 * De dónde saca el panel de "Pasar al CAD" (`PanelCad.tsx`) lo que hay en el CAD:
 *
 * - `fuenteServidor`: el backend, con la cuenta de ANAC guardada (modo "desde Vector",
 *   apagado desde el 2026-10-29: ANAC bloqueaba las IPs del servidor).
 * - `fuenteEnlace`: la pestaña del CAD del piloto, por la extensión o el marcador
 *   (`lib/enlace-cad.ts`, 2.36.0). Los pedidos salen de su navegador, con su sesión.
 *
 * La lógica de cada vuelo es la misma en las dos (`armarPanelCad`, `filaParaTraer`,
 * `armarVueloParaElCad`).
 */
import { marcarEnElCad } from "@/actions/cad";
import {
  armarVueloParaElCad,
  cargarEnCad,
  conciliarConElCad,
  datosDeVectorParaElCad,
  leerParaTraer,
  modeloDeSimulador,
  prepararPanelCad,
} from "@/actions/cad-vector";
import {
  anomaliasConElCad,
  armarPanelCad,
  diferenciasConElCad,
  estaEnVector,
  firmaDeRevision,
  paraLeerEnDetalle,
  type AnomaliaCad,
  type BorradorCad,
  type DiferenciaCad,
  type RevisionGuardada,
  filaParaTraer,
  yaEstaEnElCad,
  type AutoridadCad,
  type DatosPanelCad,
  type FilaTraida,
  type ItemCad,
  type ListasCad,
  type MemoriaAutoridades,
  type VueloEnElCad,
} from "@/lib/cad";
import { cambiarAutoridadEnElCad, crearEnElCad, leerDelCad, type TransporteCad } from "@/lib/enlace-cad";
import { compararVersion, VERSION_MINIMA_AUTORIDAD } from "@/lib/extension-cad";

type Leido<T> = { ok: true; datos: T } | { ok: false; error: string; reconectar?: boolean };

export interface ItemParaCargar {
  vectorId: string;
  ids: { finalidadID: string; origenID: string; destinoID: string };
  autoridad: AutoridadCad;
  simulador?: unknown;
}

export interface FuenteCad {
  preparar(memoria: MemoriaAutoridades | null): Promise<Leido<DatosPanelCad>>;
  cargar(item: ItemParaCargar): Promise<{ ok: boolean; mensaje: string; cadId?: number }>;
  modelo(simId: number): Promise<{ modeloId: number | null; modelo: string | null }>;
  leerParaTraer(): Promise<Leido<FilaTraida[]>>;
  /**
   * Cambia la autoridad de un vuelo pendiente de DDJJ en el CAD (3.18.0). Sólo con el puente
   * (extensión 1.2.0 o marcador): "Desde Vector" no lo tiene.
   */
  cambiarAutoridad?(cadId: number, autoridad: { id: string; nombre: string }): Promise<{ ok: boolean; mensaje: string }>;
}

export const fuenteServidor: FuenteCad = {
  preparar: prepararPanelCad,
  cargar: cargarEnCad,
  modelo: modeloDeSimulador,
  leerParaTraer,
};

/** La página de vuelos del CAD: los últimos 1000, como el formulario. */
const PAGINA_DE_VUELOS = {
  descripcion: "",
  tipoTrip: "TM",
  sortField: "fechaSalida",
  sortDirection: "DESC",
  rowsPerPage: "1000",
  pageNumber: "1",
  mostrarIngresados: "true",
  solicitudFoliadoId: "null",
};

/**
 * Lo que ya se revisó en detalle de cada vuelo, en este navegador: así cada vuelo se le pide a
 * ANAC una sola vez, y otra sólo si cambió o pasó un mes (`paraLeerEnDetalle`). Si no hay
 * almacenamiento, se revisa como la primera vez, con el mismo tope.
 */
const CLAVE_REVISIONES = "vector-cad-revisiones";
function leerRevisiones(): Record<string, RevisionGuardada> {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_REVISIONES) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, RevisionGuardada>) : {};
  } catch {
    return {};
  }
}
/** Que el vuelo se vuelva a leer en la próxima conexión (después de cambiarlo en el CAD). */
function olvidarRevision(cadId: number) {
  const r = leerRevisiones();
  delete r[String(cadId)];
  guardarRevisiones(r);
}
function guardarRevisiones(r: Record<string, RevisionGuardada>) {
  try {
    localStorage.setItem(CLAVE_REVISIONES, JSON.stringify(r));
  } catch {
    /* sin almacenamiento, la próxima conexión vuelve a revisar */
  }
}

/**
 * En cada conexión (Federico, 2026-11-04): los vuelos marcados como pasados contra lo que dice
 * el CAD. Lo de la lista (horarios, matrícula, lugares, tiempo) se compara siempre, sin pedir
 * nada más; el detalle (aterrizajes, día y noche, finalidad, cargo, tipo) se pide de a dos y
 * sólo para los que hace falta.
 */
async function revisarContraElCad(
  t: TransporteCad,
  marcados: (BorradorCad & { cadId: number })[],
  enElCad: VueloEnElCad[],
  finalidades: ItemCad[]
): Promise<AnomaliaCad[]> {
  const guardadas = leerRevisiones();
  const ahora = new Date();
  const ids = paraLeerEnDetalle(marcados, enElCad, guardadas, ahora);
  const detalles = new Map<number, Record<string, unknown>>();
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, ids.length) }, async () => {
      while (siguiente < ids.length) {
        const id = ids[siguiente++];
        const d = await leerDelCad<Record<string, unknown>>(t, "Get", { id: String(id) });
        const detalle = d.ok ? ((d.datos as { data?: Record<string, unknown> })?.data ?? d.datos) : null;
        if (detalle && typeof detalle === "object") detalles.set(id, detalle);
      }
    })
  );
  const anteriores = new Map<number, DiferenciaCad[]>(Object.entries(guardadas).map(([k, v]) => [Number(k), v.diferencias ?? []]));
  const anomalias = anomaliasConElCad(marcados, enElCad, detalles, anteriores, finalidades);

  // Se recuerda lo leído hoy; lo que ya no está marcado se olvida.
  const porId = new Map(enElCad.map((v) => [Number(v.vueloTripulanteID), v]));
  const nuevas: Record<string, RevisionGuardada> = {};
  for (const b of marcados) {
    const k = String(b.cadId);
    const detalle = detalles.get(b.cadId);
    if (detalle) {
      const fila = porId.get(b.cadId) as unknown as Record<string, unknown>;
      nuevas[k] = { firma: firmaDeRevision(b, porId.get(b.cadId)), cuando: ahora.toISOString(), diferencias: diferenciasConElCad(b, fila, detalle, finalidades) };
    } else if (guardadas[k]) nuevas[k] = guardadas[k];
  }
  guardarRevisiones(nuevas);
  return anomalias;
}

export function fuenteEnlace(t: TransporteCad): FuenteCad {
  // Las listas del CAD no cambian mientras la pantalla está abierta: se leen una vez.
  let listas: ListasCad | null = null;

  async function leerListas(): Promise<Leido<ListasCad>> {
    if (listas) return { ok: true, datos: listas };
    const [fin, aut, lug, sim] = await Promise.all([
      leerDelCad<ItemCad[]>(t, "GetFinalidadListItem", { tcp: "false" }),
      leerDelCad<ItemCad[]>(t, "GetAutoridadesListItem"),
      leerDelCad<ItemCad[]>(t, "GetLugarAterrizajeListItem", { tipoLugar: "AER", tipoVuelo: "2" }),
      leerDelCad<ItemCad[]>(t, "GetSimuladoresListItem"),
    ]);
    for (const r of [fin, aut, lug, sim]) if (!r.ok) return { ok: false, error: r.error };
    const d = (r: typeof fin) => (r.ok && Array.isArray(r.datos) ? r.datos : []);
    listas = { finalidades: d(fin), autoridades: d(aut), lugares: d(lug), simuladores: d(sim) };
    return { ok: true, datos: listas };
  }

  async function leerVuelos(): Promise<Leido<VueloEnElCad[]>> {
    const r = await leerDelCad<{ dataSource?: VueloEnElCad[] }>(t, "GetPagedList", PAGINA_DE_VUELOS);
    return r.ok ? { ok: true, datos: r.datos?.dataSource ?? [] } : { ok: false, error: r.error };
  }

  return {
    async preparar(memoria) {
      const [l, v] = await Promise.all([leerListas(), leerVuelos()]);
      if (!l.ok) return l;
      if (!v.ok) return v;
      // Primero Vector se pone de acuerdo con el CAD (estados, borrados allá, cargados a mano),
      // y después se arma el panel con lo que quedó: los borrados ya vuelven como por pasar.
      const c = await conciliarConElCad(v.datos);
      const vector = await datosDeVectorParaElCad();
      if (!vector) return { ok: false, error: "No pudimos leer tus vuelos de Vector. Probá de nuevo." };
      const datos = armarPanelCad(vector, [], l.datos, v.datos, memoria);
      const anomalias = await revisarContraElCad(t, vector.marcados, v.datos, l.datos.finalidades);
      return { ok: true, datos: { ...datos, devueltos: c.desmarcados ?? 0, anomalias } };
    },

    async cargar(item) {
      const armado = await armarVueloParaElCad(item);
      if (!armado.ok) return armado;
      const r = await crearEnElCad(t, armado.payload);
      if (!r.ok) return { ok: false, mensaje: r.sinCad ? r.error : `${r.error} Fijate en el CAD si quedó antes de mandarlo de nuevo.` };
      if (!r.datos.aceptado) return { ok: false, mensaje: r.datos.mensaje };
      // El id sale de la lista del CAD: el mismo criterio que para los que ya estaban.
      const v = await leerVuelos();
      const cadId = v.ok ? yaEstaEnElCad(armado.borrador, v.datos) : null;
      if (cadId) await marcarEnElCad([{ vectorId: armado.borrador.vectorId, cadId, autoridad: armado.autoridad }]);
      return { ok: true, mensaje: cadId ? "Cargado en el CAD" : "Cargado en el CAD (no pudimos anotarlo en Vector todavía)", cadId: cadId ?? undefined };
    },

    async cambiarAutoridad(cadId, autoridad) {
      // Una extensión anterior a la 1.2.0 no conoce el pedido y no contesta: se avisa antes.
      const instalada = document.documentElement.dataset.vectorCadExtension;
      if (t === "extension" && (!instalada || compararVersion(instalada, VERSION_MINIMA_AUTORIDAD) < 0))
        return { ok: false, mensaje: `Para cambiarla desde Vector, actualizá la extensión a la ${VERSION_MINIMA_AUTORIDAD} (está arriba, en esta pantalla).` };
      const r = await cambiarAutoridadEnElCad(t, cadId, autoridad);
      if (!r.ok) return { ok: false, mensaje: r.error };
      if (r.datos.aceptado) olvidarRevision(cadId);
      return { ok: r.datos.aceptado, mensaje: r.datos.mensaje };
    },

    async modelo(simId) {
      const r = await leerDelCad<ItemCad[]>(t, "GetModelosPorSimuladorListItem", { simId: String(simId) });
      const m = r.ok && Array.isArray(r.datos) ? r.datos[0] : undefined;
      return m ? { modeloId: Number(m.key) || null, modelo: m.value || null } : { modeloId: null, modelo: null };
    },

    async leerParaTraer() {
      const [l, v, vector] = await Promise.all([leerListas(), leerVuelos(), datosDeVectorParaElCad()]);
      if (!l.ok) return l;
      if (!v.ok) return v;
      if (!vector) return { ok: false, error: "No pudimos leer tus vuelos de Vector. Probá de nuevo." };
      const faltan = v.datos.filter((x) => !estaEnVector(x, vector.conocidos)).slice(0, 300);
      const filas: FilaTraida[] = new Array(faltan.length);
      let siguiente = 0;
      // De a cuatro, como hacía el backend: el CAD es del Estado y no hace falta apurarlo.
      await Promise.all(
        Array.from({ length: Math.min(4, faltan.length) }, async () => {
          while (siguiente < faltan.length) {
            const k = siguiente++;
            const d = await leerDelCad<Record<string, unknown>>(t, "Get", { id: String(Number(faltan[k].vueloTripulanteID)) });
            const detalle = d.ok ? ((d.datos as { data?: Record<string, unknown> })?.data ?? d.datos) : null;
            filas[k] = filaParaTraer(faltan[k], detalle, l.datos, vector);
          }
        })
      );
      return { ok: true, datos: filas };
    },
  };
}
