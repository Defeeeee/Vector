import { describe, expect, it } from "vitest";
import { gpxDelTrack, leerTrack, nombreDelGpx, resumenTrack, sigueElTrack, sumarPunto, type PuntoTrack } from "./track-vuelo";

const l = (lat: number, lon: number, extra: Partial<{ altitudFt: number | null; gsKt: number | null; precisionM: number }> = {}) => ({
  lat,
  lon,
  altitudFt: 1000,
  gsKt: 90,
  precisionM: 10,
  ...extra,
});

describe("el track del vuelo", () => {
  it("ralea: cada 4 s como mucho y sólo si se movió", () => {
    let p: PuntoTrack[] = [];
    p = sumarPunto(p, l(-34.45, -58.59), 0);
    expect(p).toHaveLength(1);
    expect(sumarPunto(p, l(-34.46, -58.59), 2_000)).toBe(p); // muy pronto
    expect(sumarPunto(p, l(-34.45, -58.59), 10_000)).toBe(p); // quieto
    expect(sumarPunto(p, l(-34.45, -58.59), 61_000)).toHaveLength(2); // quieto, pero pasó un minuto
    expect(sumarPunto(p, l(-34.46, -58.59), 5_000)).toHaveLength(2);
  });

  it("si el reloj vuelve para atrás, sigue grabando", () => {
    const p = sumarPunto([], l(-34.45, -58.59), 100_000);
    expect(sumarPunto(p, l(-34.46, -58.59), 50_000)).toHaveLength(2);
  });

  it("descarta las lecturas con mucho error", () => {
    expect(sumarPunto([], l(-34.45, -58.59, { precisionM: 400 }), 0)).toEqual([]);
  });

  it("resume distancia, tiempo y altura máxima", () => {
    const p: PuntoTrack[] = [
      [0, -34.0, -58.0, 500, 0],
      [60_000, -34.5, -58.0, 3500, 100],
      [120_000, -35.0, -58.0, null, 100],
    ];
    const r = resumenTrack(p);
    expect(r.distanciaNm).toBeCloseTo(60, 0); // un grado de latitud ≈ 60 NM
    expect(r.minutos).toBe(2);
    expect(r.altitudMaxFt).toBe(3500);
  });

  it("sigue el mismo track si el último punto es de hace menos de 30 minutos", () => {
    const t = { inicio: 0, puntos: [[1_000_000, -34, -58, null, null]] as PuntoTrack[], ruta: "", terminado: null };
    expect(sigueElTrack(t, 1_000_000 + 29 * 60_000)).toBe(true);
    expect(sigueElTrack(t, 1_000_000 + 31 * 60_000)).toBe(false);
    expect(sigueElTrack(null, 0)).toBe(false);
  });

  it("lee lo guardado y descarta lo roto", () => {
    expect(leerTrack("{")).toBeNull();
    expect(leerTrack(JSON.stringify({ inicio: 1, puntos: [[1, 2, 3, null, null], ["x"]], ruta: "SADF SADM" }))).toEqual({
      inicio: 1,
      puntos: [[1, 2, 3, null, null]],
      ruta: "SADF SADM",
      terminado: null,
    });
  });

  it("baja GPX con las horas en UTC y la altura en metros", () => {
    const t = { inicio: Date.UTC(2026, 10, 10, 2, 0), puntos: [[Date.UTC(2026, 10, 10, 2, 0), -34.5, -58.6, 3281, 95]] as PuntoTrack[], ruta: "SADF SADM", terminado: null };
    const gpx = gpxDelTrack(t);
    expect(gpx).toContain('<trkpt lat="-34.500000" lon="-58.600000"><ele>1000.0</ele><time>2026-11-10T02:00:00.000Z</time></trkpt>');
    // A las 23 h del 9 en la Argentina: el archivo lleva la fecha argentina.
    expect(nombreDelGpx(t)).toBe("vuelo-2026-11-09-SADF-SADM.gpx");
  });
});
