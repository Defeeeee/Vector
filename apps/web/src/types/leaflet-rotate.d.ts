/**
 * Los tipos de `leaflet-rotate` (no trae): lo que Vector usa. El plugin extiende `L.Map` al
 * importarse (`MapaLeaflet.tsx`).
 */
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    rotateControl?: boolean;
  }
  interface Map {
    /** Rota el mapa: el norte queda a `grados` en el sentido de las agujas del reloj. */
    setBearing(grados: number): void;
    getBearing(): number;
  }
}

declare module "leaflet-rotate";
