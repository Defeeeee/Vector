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
  armarPanelCad,
  estaEnVector,
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
import { crearEnElCad, leerDelCad, type TransporteCad } from "@/lib/enlace-cad";

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
      return { ok: true, datos: { ...datos, devueltos: c.desmarcados ?? 0 } };
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
