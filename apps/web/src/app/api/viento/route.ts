import { NextRequest, NextResponse } from "next/server";
import { SITIO_URL } from "@/lib/sitio";
import {
  camposHourlyViento,
  leerRespuestaOpenMeteo,
  validarPedidoViento,
  vientoEnPunto,
} from "@/lib/viento-ruta";

/**
 * POST /api/viento — { puntos: [{ lat, lon, hora }], altitudFt }
 *
 * El viento pronosticado en cada punto (la mitad de cada tramo de la planilla de
 * navegación), a la hora en que se pasa por ahí y a la altitud de crucero. Devuelve, en
 * el mismo orden, `{ direccion, velocidad, horaModelo, niveles }` o `null` donde no se
 * sabe (invariante 2). La cuenta está en `lib/viento-ruta.ts`.
 *
 * Con `altitudesFt: number[]` en lugar de `altitudFt` (la tabla de vientos en altura del
 * plan de vuelo), cada punto trae un arreglo con ese mismo resultado para cada altitud,
 * en el orden pedido. Es el mismo pedido a Open-Meteo: las alturas salen de la misma
 * respuesta.
 *
 * Un solo pedido a Open-Meteo con todas las coordenadas. Se redondea lo que va en la URL
 * (dos decimales, ~1 km, y las horas enteras) para que dos pilotos con la misma ruta
 * compartan el caché de `revalidate`, y se pide sólo la ventana de horas que hace falta.
 *
 * **Open-Meteo gratis es para uso no comercial**: si Vector cobra, hay que pasar a su plan
 * de pago (con clave) o a otra fuente. Cambia sólo este archivo.
 */
const HORA_MS = 3600_000;
const USER_AGENT = `Vector (${SITIO_URL})`;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);

export async function POST(req: NextRequest) {
  if (!req.cookies.get("session_token")) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido ilegible" }, { status: 400 });
  }
  const pedido = validarPedidoViento(cuerpo);
  if ("error" in pedido) return NextResponse.json({ error: pedido.error }, { status: 400 });
  const { puntos, altitudFt, altitudesFt } = pedido;

  const horas = puntos.map((p) => p.horaMs);
  // Con 3 h de margen a cada lado: es lo que `horaMasCercana` tolera.
  const desde = Math.floor((Math.min(...horas) - 3 * HORA_MS) / HORA_MS) * HORA_MS;
  const hasta = Math.ceil((Math.max(...horas) + 3 * HORA_MS) / HORA_MS) * HORA_MS;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${puntos.map((p) => p.lat.toFixed(2)).join(",")}` +
    `&longitude=${puntos.map((p) => p.lon.toFixed(2)).join(",")}` +
    `&hourly=${camposHourlyViento()}&wind_speed_unit=kn&timezone=UTC` +
    `&start_hour=${iso(desde)}&end_hour=${iso(hasta)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // El modelo se actualiza cada pocas horas: media hora alcanza.
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "El servicio de pronóstico no respondió" }, { status: 502 });
    }
    const lugares = leerRespuestaOpenMeteo(await res.json(), puntos.length);
    const en = (k: number, horaMs: number, altitud: number) => {
      const r = vientoEnPunto(lugares[k], horaMs, altitud);
      if (!r) return null;
      return {
        direccion: r.viento.direccion,
        velocidad: r.viento.velocidad,
        horaModelo: r.horaModeloMs,
        niveles: r.nivelesHPa,
      };
    };
    if (altitudesFt) {
      const resultado = puntos.map((p, k) => altitudesFt.map((a) => en(k, p.horaMs, a)));
      return NextResponse.json({ puntos: resultado, altitudesFt, modelo: "Open-Meteo" });
    }
    const resultado = puntos.map((p, k) => en(k, p.horaMs, altitudFt!));
    return NextResponse.json({ puntos: resultado, modelo: "Open-Meteo" });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar el servicio de pronóstico" }, { status: 502 });
  }
}
