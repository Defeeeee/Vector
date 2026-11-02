import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { necesitaRenovar } from "@/lib/sesion";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.flightlog.fdiaznem.com.ar";

/** Los mismos atributos que `setSession` en `src/actions/auth.ts`. */
function opcionesCookie() {
  const esProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: esProd,
    sameSite: "lax" as const,
    path: "/",
    /*
      En producción la cookie es del dominio raíz para que valga en todos los
      subdominios. Si acá la escribiéramos sin `domain`, el navegador crearía una
      cookie **distinta** —host-only— que taparía a la buena, y el usuario quedaría con
      dos sesiones desincronizadas: una que se renueva y otra que no. Tiene que
      coincidir con `setSession` atributo por atributo.
    */
    domain: esProd ? ".fdiaznem.com.ar" : undefined,
  };
}

type Par = { access_token: string; refresh_token: string };

/**
 * `"red"` distingue "no pudimos preguntar" de "el token está muerto", y esa
 * distinción es la diferencia entre esperar y desloguear a alguien que estaba bien.
 */
async function renovar(refreshToken: string): Promise<Par | "muerto" | "red"> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("proxy: no se pudo contactar al servidor de auth:", error);
    return "red";
  }

  if (!respuesta.ok) {
    // El backend contesta 401 cuando el refresh token venció, ya se usó o fue
    // revocado. Cualquier otro código es un problema del servidor, no de la sesión:
    // tratarlo como sesión muerta desloguearía a todo el mundo ante un deploy roto.
    console.error(`proxy: refresh rechazado con ${respuesta.status}`);
    return respuesta.status === 401 ? "muerto" : "red";
  }

  try {
    const datos = await respuesta.json();
    if (!datos?.access_token || !datos?.refresh_token) return "muerto";
    return { access_token: datos.access_token, refresh_token: datos.refresh_token };
  } catch {
    return "red";
  }
}

/**
 * El único lugar de la app donde se puede renovar la sesión.
 *
 * **No es una preferencia, es una restricción de Next**, y `src/lib/api.ts` la
 * documenta desde hace meses: una cookie no se puede escribir durante el render de
 * un server component. El proxy sí puede, vía `NextResponse.cookies`.
 *
 * ## Qué estaba roto
 *
 * El `access_token` de Supabase **vive una hora**. La cookie `session_token` vive
 * **veinticuatro**. En el medio había veintitrés horas en las que este mismo archivo
 * veía la cookie, dejaba pasar, y todas las páginas pedían con un JWT vencido: 401 y
 * logout. La sesión no moría a las 24 h — moría a la hora, y de una forma que
 * parecía un bug de datos.
 *
 * El `refresh_token` se guardaba en una cookie de 30 días desde hacía meses **sin que
 * existiera una sola línea, ni acá ni en el backend, que lo canjeara.**
 *
 * ## Las dos mitades del arreglo
 *
 * 1. `response.cookies.set(...)` — para el navegador, o sea las navegaciones que
 *    vengan después.
 * 2. `request.cookies.set(...)` + `NextResponse.next({ request: { headers } })` —
 *    para **este** render. Sin esto la página que se está por dibujar seguiría
 *    leyendo el token viejo de `cookies()` y haría todas sus llamadas con el JWT
 *    vencido: la renovación funcionaría y el usuario vería un error igual, una vez
 *    por hora. `RequestCookies.set` reescribe la cabecera `cookie` del request, que
 *    es lo que hace que las dos líneas se conecten.
 *
 * ## La carrera
 *
 * Los refresh token de Supabase son de un solo uso. Dos navegaciones simultáneas con
 * el token vencido canjean las dos. GoTrue tolera reusar el mismo token durante ~10 s
 * y en esa ventana devuelve la misma sesión, así que el caso real —dos pestañas, o
 * los prefetch de Next disparando juntos— sale bien. Fuera de esa ventana no hay
 * simultaneidad que valga.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth/callback")) {
    return NextResponse.next();
  }

  // El logout tiene que poder correr siempre, incluso —sobre todo— con la sesión rota.
  if (pathname.startsWith("/api/auth/logout")) {
    return NextResponse.next();
  }

  let token = request.cookies.get("session_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  const hayQueRenovar = necesitaRenovar(token, refreshToken);

  let par: Par | null = null;
  let sesionMuerta = false;

  if (hayQueRenovar) {
    const resultado = await renovar(refreshToken!);
    if (resultado === "muerto") {
      sesionMuerta = true;
      token = undefined;
    } else if (resultado === "red") {
      // Se sigue con lo que haya. Si el token está vencido las páginas van a fallar,
      // pero fallar es recuperable y desloguear por un problema de red no lo es:
      // borrar el refresh token obliga a escribir la contraseña de nuevo.
      console.error("proxy: renovación pospuesta por falta de respuesta");
    } else {
      par = resultado;
      token = resultado.access_token;
      // Para el render que está por empezar. Ver el comentario de arriba.
      request.cookies.set("session_token", resultado.access_token);
      request.cookies.set("refresh_token", resultado.refresh_token);
    }
  }

  const opciones = opcionesCookie();

  /** Deja las cookies nuevas en cualquier respuesta que salga de acá. */
  const conCookies = (respuesta: NextResponse) => {
    if (par) {
      respuesta.cookies.set("session_token", par.access_token, { ...opciones, maxAge: 60 * 60 * 24 });
      respuesta.cookies.set("refresh_token", par.refresh_token, {
        ...opciones,
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    if (sesionMuerta) {
      // Si no se borran, cada navegación vuelve a intentar canjear un token que ya
      // sabemos muerto: un request extra por página, para siempre.
      respuesta.cookies.set("session_token", "", { ...opciones, maxAge: 0 });
      respuesta.cookies.set("refresh_token", "", { ...opciones, maxAge: 0 });
    }
    return respuesta;
  };

  const aDondeVa = (destino: string) => {
    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host") || "vector.fdiaznem.com.ar";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return new URL(destino, `${proto}://${host}`);
  };

  const isDashboardPage = pathname.startsWith("/dashboard");

  if (isDashboardPage && !token) {
    const url = aDondeVa("/");
    url.searchParams.set("expired", "true");
    return conCookies(NextResponse.redirect(url));
  }

  if (pathname === "/" && token) {
    return conCookies(NextResponse.redirect(aDondeVa("/dashboard")));
  }

  return conCookies(NextResponse.next({ request: { headers: request.headers } }));
}

export const config = {
  /*
    `/u/:path*` es el perfil público. No se protege —se abre sin cuenta—, pero sí se
    renueva la sesión de quien la tenga: sin eso, con el token vencido, el perfil lo
    vería como anónimo y el botón le diría "Creá tu cuenta" a un piloto logueado.

  */
  // `/q/…` y la hoja de pegatinas, para que la sesión llegue renovada: el QR se escanea con
  // el teléfono, quizás horas después de la última entrada, y sin renovar el admin no se
  // reconoce y no puede asignar la pegatina.
  matcher: ["/", "/dashboard/:path*", "/u/:path*", "/q/:path*", "/api/admin/:path*"],
};
