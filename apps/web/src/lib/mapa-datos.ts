import { allAirports, canalesDeLlamada } from "@/lib/airports";
import { espaciosAereos, torreDe } from "@/lib/espacios-aereos-servidor";
import { bandaDeCorredor } from "@/lib/corredores-vfr";
import { allRadioayudas } from "@/lib/radioayudas";

/**
 * Las capas fijas del Mapa, armadas una vez: aeródromos, radioayudas, espacios aéreos y FIR, cada uno
 * con quién se habla. Las sirven `/api/mapa` y el paquete para volar sin señal
 * (`/api/sin-senal/datos`): **una sola función**, para que lo que el Mapa dibuja sin red sea
 * exactamente lo que dibuja con red. Sólo servidor: lee del disco.
 */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function armarMapa() {
  const { espacios, descartados, firs, vfr } = espaciosAereos();
  const canales = canalesDeLlamada();
  const aerodromos = allAirports()
    // Sin los helipuertos (Federico, 2026-11-03): un avión no aterriza ahí y llenan el mapa.
    .filter((a) => a.country === "AR" && typeof a.lat === "number" && typeof a.lon === "number")
    .filter((a) => a.size !== "H" && a.madhel?.kind !== "HEL")
    // Para la salida y la llegada (3.1.2): si es controlado, su canal de llamada si no lo es, y
    // la torre del AIP si la tiene.
    .map((a) => [
      a.icao,
      a.local ?? "",
      a.label || a.name,
      r4(a.lat!),
      r4(a.lon!),
      a.size,
      a.madhel?.controlled ?? null,
      (a.local && canales.get(a.local)) || null,
      torreDe(a.icao, "ATZ"),
    ]);
  const radioayudas = allRadioayudas()
    .filter((r) => r.lat < -20 && r.lat > -56 && r.lon < -52 && r.lon > -75)
    .map((r) => [r.ident, r.tipo, r.nombre, r4(r.lat), r4(r.lon), r.khz ?? null]);
  return {
      aerodromos,
      radioayudas,
      espacios: espacios.map((e) => ({ ...e, poligono: e.poligono.map(([la, lo]) => [r4(la), r4(lo)]) })),
      descartados: descartados.map((d) => d.nombre),
      // Los corredores y sectores VFR debajo de la TMA Baires (ENR 3.3): clase G.
      vfr: {
        // Con la franja ya armada: su ancho depende de si cada tramo está en una CTR.
        corredores: vfr.corredores.map((c) => ({
          ...c,
          eje: c.eje.map((p) => ({ lat: r4(p.lat), lon: r4(p.lon) })),
          banda: bandaDeCorredor(c, espacios.filter((e) => e.tipo === "CTR").map((e) => e.poligono)).map(([la, lo]) => [r4(la), r4(lo)]),
        })),
        sectores: vfr.sectores.map((s) => ({ ...s, poligono: s.poligono.map(([la, lo]) => [r4(la), r4(lo)]) })),
      },
      // Las FIR: el polígono (con sus rodeos por afuera del país) para saber dónde estás, y
      // los bordes y la línea entre sectores para dibujar.
      firs: firs.map((f) => ({
        ...f,
        poligono: f.poligono.map(([la, lo]) => [r4(la), r4(lo)]),
        bordes: f.bordes.map((b) => b.map(([la, lo]) => [r4(la), r4(lo)])),
        lineaSectores: f.lineaSectores?.map(([la, lo]) => [r4(la), r4(lo)]) ?? null,
      })),
    };
}
