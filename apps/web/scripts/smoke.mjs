#!/usr/bin/env node
/**
 * Smoke test contra un build de producción real.
 *
 *   npm run build && npm run smoke
 *
 * Levanta `next start`, espera a que atienda, y pega a un puñado de rutas
 * comprobando que ninguna devuelva 5xx. No reemplaza tests: comprueba que la
 * aplicación **arranca y sirve**, que es la clase de falla que `tsc` no ve.
 *
 * ## Qué cubre y qué no
 *
 * Cubre las rutas públicas y las de API que no piden sesión. Ahí un 5xx es
 * siempre un bug.
 *
 * **El interior del dashboard sólo se cubre con credenciales.** Sin sesión el
 * proxy redirige antes de que la página corra, así que únicamente se comprueba
 * que la redirección ocurra — no que la página renderice. Un crash como el de
 * `/dashboard/log-flight` (`logbooks.find is not a function`, agosto 2026) no se
 * ve desde ahí.
 *
 * Con `SMOKE_EMAIL` y `SMOKE_PASSWORD` en el entorno, la segunda tanda entra con
 * una sesión real y comprueba que cada pantalla del dashboard **renderice**. Sin
 * esas variables se omite y el smoke sigue pasando: los secrets no se exponen a
 * los PR desde forks, y un PR externo no debería dar rojo por una credencial que
 * no puede tener.
 *
 * **Es de sólo lectura, a propósito.** El build apunta al backend de producción
 * —no hay uno de test—, así que esto se loguea contra la base real. Comprobar el
 * alta de vuelos exigiría escribir ahí en cada push y después limpiar; esa
 * verificación se hace a mano.
 */

import { spawn } from "node:child_process";

const PORT = process.env.SMOKE_PORT || "3010";
const BASE = `http://127.0.0.1:${PORT}`;

/** `expect` es lo que se considera aceptable. Un 5xx nunca lo es. */
const ROUTES = [
  { path: "/", expect: (s) => s === 200 },
  // Lo público que tiene que encontrar un buscador: las guías, el sitemap y el robots,
  // y las vistas previas que se ven al compartir un link (satori con las fuentes del
  // disco: si falta un .ttf, recién falla acá).
  { path: "/guias", expect: (s) => s === 200 },
  { path: "/guias/horas-centesimales", expect: (s) => s === 200 },
  { path: "/guias/libro-de-vuelo", expect: (s) => s === 200 },
  { path: "/guias/cad-anac-registro-de-horas", expect: (s) => s === 200 },
  { path: "/guias/requisitos-pca", expect: (s) => s === 200 },
  { path: "/guias/experiencia-reciente", expect: (s) => s === 200 },
  { path: "/guias/no-existe", expect: (s) => s === 404 },
  { path: "/robots.txt", expect: (s) => s === 200 },
  { path: "/sitemap.xml", expect: (s) => s === 200 },
  { path: "/opengraph-image", expect: (s) => s === 200 },
  { path: "/guias/requisitos-pca/opengraph-image", expect: (s) => s === 200 },
  { path: "/login", expect: (s) => s === 200 },
  { path: "/register", expect: (s) => s === 200 },
  { path: "/recover", expect: (s) => s === 200 },
  { path: "/legal/privacidad", expect: (s) => s === 200 },
  { path: "/legal/terminos", expect: (s) => s === 200 },
  // La baja del resumen del mes: sin link firmado dice que no es válido, y sin POST no
  // da de baja a nadie: los filtros de correo abren los links de los mails con GET.
  // Las imágenes de los mails (`npm run build:correo`): los clientes de correo las piden
  // por URL, y sin ellas todos los mails se ven rotos.
  { path: "/hotlink-ok/correo/logo.png", expect: (s) => s === 200 },
  { path: "/hotlink-ok/correo/mic.png", expect: (s) => s === 200 },
  // La carpeta vieja se queda: los mails ya enviados apuntan ahí.
  { path: "/correo/logo.png", expect: (s) => s === 200 },
  { path: "/mail/baja", expect: (s) => s === 200 },
  { path: "/api/mail/baja", expect: (s) => s === 405 },
  { path: "/no-existe-esta-ruta", expect: (s) => s === 404 },
  /*
    La PWA. El manifest se genera desde `src/app/manifest.ts`, así que un campo mal
    escrito lo agarra `tsc`; lo que esto agarra es que la ruta exista y que
    `start_url` siga apuntando al dashboard — con `/` la app instalada arrancaría en
    un redirect condicional que sin red no ocurre.

    `sw.js` no lo produce Next sino `scripts/build-sw.mjs` después del build. Si
    alguien corre `next build` a secas, acá se ve: el archivo no está.
  */
  {
    path: "/manifest.webmanifest",
    expect: (s) => s === 200,
    json: (b) => b.start_url === "/dashboard" && b.icons?.length >= 3,
  },
  { path: "/sw.js", expect: (s) => s === 200 },
  { path: "/icono-192.png", expect: (s) => s === 200 },
  { path: "/icono-512-maskable.png", expect: (s) => s === 200 },
  /*
    La pantalla de respaldo va **fuera** de `/dashboard` a propósito: adentro pasaría
    por el matcher del proxy y exigiría sesión, que es lo único que no se puede
    verificar cuando no hay red. Si alguien la mueve, acá aparece como un 307.
  */
  { path: "/sin-conexion", expect: (s) => s === 200 },
  /*
    El catálogo de a bordo. Que esté al día lo comprueba `resolucion-puntos.test.ts`;
    esto comprueba lo otro: que **se sirva**. Sin él, el planificador sin señal no
    resuelve un solo punto, y es la clase de archivo que se cae de un build sin que
    nada más se rompa.
  */
  {
    path: "/catalogo-aeronautico.json",
    expect: (s) => s === 200,
    json: (b) => b.esquema === 1 && b.aerodromos?.length > 500 && b.aerovias?.length === 220,
  },
  // El directorio de aeródromos se sirve sin sesión y lee los TSV del disco:
  // si el build no los copió, esto lo agarra.
  { path: "/api/airports/search?q=SADM", expect: (s) => s === 200, json: (b) => b.results?.[0]?.icao === "SADM" },
  { path: "/api/airports/search?q=GEZ", expect: (s) => s === 200, json: (b) => b.results?.[0]?.icao === "SRDR" },
  // Los puntos del planificador leen dos TSV más —radioayudas y pistas— y hacen
  // trigonometría con ellos. Un punto por radial que devuelve `null` acá significa que
  // `navaids.tsv` no llegó al build, y en la pantalla se vería como "no lo reconocemos"
  // sin ninguna otra pista.
  { path: "/api/puntos?q=SADM", expect: (s) => s === 200, json: (b) => b.punto?.clase === "aerodromo" },
  {
    path: "/api/puntos?q=BAR%2F045%2F25",
    expect: (s) => s === 200,
    // 25 NM en el radial 045 de Bariloche. Se comprueban las coordenadas y no sólo que
    // haya punto: un corrimiento de columnas en el TSV daría un punto igual de válido y
    // a cien millas de donde va.
    json: (b) =>
      b.punto?.clase === "radial" &&
      Math.abs(b.punto.lat - -40.8897) < 0.001 &&
      Math.abs(b.punto.lon - -70.7482) < 0.001,
  },
  { path: "/api/puntos?q=S34.68%2FW58.64", expect: (s) => s === 200, json: (b) => b.punto?.lat === -34.68 },
  // Un punto de aerovía del AIP. Lee un TSV más, así que si el build no lo copió, acá se ve.
  // El selector de aerovías: qué sale de un punto y hasta dónde llega.
  {
    path: "/api/aerovias?punto=BCA",
    expect: (s) => s === 200,
    json: (b) => b.aerovias?.some((a) => a.designador === "W67" && a.salidas.includes("OSA")),
  },
  // Y el tramo ya resuelto, que es lo que la planilla consume.
  {
    path: "/api/puntos?q=W67&desde=BCA&hasta=OSA",
    expect: (s) => s === 200,
    json: (b) => b.punto?.clase === "aerovia" && b.punto.tramo?.map((p) => p.codigo).join(",") === "AKNOS,OGLER",
  },
  {
    path: "/api/puntos?q=DORVO",
    expect: (s) => s === 200,
    json: (b) => b.punto?.clase === "fix" && Math.abs(b.punto.lat - -34.71611) < 0.0001,
  },
  // Sin sesión el middleware tiene que redirigir, no explotar.
  // Las capas del Mapa (3.0.0): leen el texto del AIP y arman los espacios aéreos. Si el
  // build no copió `src/data/aip/`, no hay TMA Baires.
  {
    path: "/api/mapa",
    expect: (s) => s === 200,
    // La TMA Baires va en dos sectores por nivel: "TMA BAIRES (I)" y "(II)".
    json: (b) => b.espacios?.some((e) => e.nombre === "TMA BAIRES (I)") && b.aerodromos?.length > 500,
  },
  { path: "/dashboard", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/mapa", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/log-flight", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/airports", expect: (s) => s === 307 || s === 302 },
  // Las pantallas que se sacaron o mudaron en la 3.12.0 redirigen (`next.config.js`).
  { path: "/dashboard/calendario", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/planificador", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/clima", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/mapa/planilla", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/pilotos", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/pilotos/actividad", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/pilotos/fede.dn", expect: (s) => s === 307 || s === 302 },
  // El perfil público se abre sin cuenta. Un @ que no existe tiene que dar 404 y no
  // 500: el que recibe un link roto por WhatsApp tiene que ver "no existe", no un
  // error de servidor. Un @ con formato inválido, lo mismo.
  { path: "/u/no.existe.smoke", expect: (s) => s === 404 },
  { path: "/u/%40%40", expect: (s) => s === 404 },
  { path: "/dashboard/novedades", expect: (s) => s === 307 || s === 302 },
  { path: "/dashboard/admin", expect: (s) => s === 307 || s === 302 },
  // La tarjeta compartible sale de la sesión del piloto. Que sin sesión conteste
  // 401 es lo que comprueba que la comprobación de auth sigue ahí: es una imagen
  // con horas de vuelo de una persona, y "simplificar" ese chequeo la publicaría.
  { path: "/api/share-card", expect: (s) => s === 401 },
  // La imagen del recorrido de un vuelo (2.37.0): lo mismo, sale de la sesión.
  { path: "/api/recorrido/00000000-0000-4000-8000-000000000000", expect: (s) => s === 401 },
  // Lo que gasta la cuota de Gemini del proyecto no se toca sin sesión. Hasta el
  // 2026-09-23 el importador de PDF lo hacía: cualquiera podía gastarla.
  { path: "/api/parse-logbook", method: "POST", expect: (s) => s === 401 },
  /*
    El seguimiento de los mails (`lib/mail-seguimiento.ts`). La imagen de apertura
    contesta siempre, con firma o sin ella. Y la redirección de los clics **no puede ser
    una redirección abierta**: sin una firma válida no va al sitio que le pasan.
  */
  { path: "/api/mail/a", expect: (s) => s === 200 },
  {
    path: "/api/mail/c?e=0b7f6a3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b&u=https%3A%2F%2Fmalo.example%2Fphishing&f=inventada",
    expect: (s) => s === 302,
    location: (l) => !l.includes("malo.example"),
  },
  { path: "/api/cron/novedades?clave=smoke", method: "POST", expect: (s) => s === 401 || s === 503 },
  // Un POST sin la firma del mail no da de baja a nadie.
  { path: "/api/mail/baja?u=x&t=y", method: "POST", expect: (s) => s === 400 },
  { path: "/api/chat", method: "POST", body: JSON.stringify({ message: "hola" }), expect: (s) => s === 401 },
  // El libro de vuelo en PDF es la bitácora entera de una persona.
  { path: "/api/bitacora/libro-anac", expect: (s) => s === 401 },
];

/**
 * Con sesión, estas tienen que **renderizar**, no redirigir. Todas son GET y
 * ninguna escribe: el backend es el de producción. Por eso ninguna pantalla puede
 * escribir al dibujarse (la Actividad marca lo visto desde el navegador, no acá).
 *
 * Un string espera 200; un objeto, el código que dice.
 */
const AUTH_ROUTES = [
  "/dashboard",
  // La que se rompió en producción con los tipos en verde.
  "/dashboard/log-flight",
  "/dashboard/history",
  "/dashboard/summary",
  "/dashboard/settings",
  "/dashboard/history/auditoria",
  "/dashboard/balance",
  "/dashboard/airports",
  "/dashboard/tools",
  "/dashboard/mapa/planilla",
  "/dashboard/mapa",
  // La red: la Red, sus pestañas, Publicar (que lee los vuelos) y un perfil que no
  // existe, que adentro de la app también tiene que ser 404 y no 500.
  "/dashboard/pilotos",
  "/dashboard/pilotos/buscar",
  "/dashboard/pilotos/actividad",
  "/dashboard/pilotos/publicar",
  { path: "/dashboard/pilotos/no.existe.smoke", status: 404 },
  "/dashboard/novedades",
  // El panel de administración: la cuenta del smoke no es admin, así que tiene que ser
  // 404 y no 500 ni, sobre todo, 200.
  { path: "/dashboard/admin", status: 404 },
  // Un `.ttf` faltante o mal nombrado pasa `tsc` y pasa `next build`: la ruta tira
  // 500 recién cuando alguien pide la imagen. Esto es lo único automático que lo
  // agarra antes de producción.
  "/api/share-card?tiles=pic,noche",
  // El libro en PDF: pdf-lib y el dibujo de la hoja sólo corren al pedirlo. Sin vuelos
  // igual contesta, con una hoja en blanco.
  "/api/bitacora/libro-anac",
];

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.flightlog.fdiaznem.com.ar";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Token de la cuenta de prueba, o `null` si no hay credenciales configuradas.
 *
 * Se pide directo al backend de auth en vez de simular el formulario: la server
 * action de login hace exactamente esto y después guarda el token en la cookie
 * `session_token`, que es lo único que mira `src/proxy.ts`.
 */
async function login() {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) return null;

  const res = await fetch(`${AUTH_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    // Si las credenciales están puestas y no andan, es un fallo: la alternativa
    // es que la cobertura desaparezca en silencio y nadie se entere.
    throw new Error(
      `login de la cuenta de prueba falló (HTTP ${res.status}). ` +
      `Revisá SMOKE_EMAIL/SMOKE_PASSWORD contra ${AUTH_URL}.`
    );
  }
  return body.access_token;
}

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // todavía no atiende
    }
    await sleep(500);
  }
  throw new Error(`El server no atendió en ${timeoutMs / 1000}s`);
}

const server = spawn("node_modules/.bin/next", ["start", "-p", PORT], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production" },
});

let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let failures = 0;

try {
  await waitForServer();

  for (const route of ROUTES) {
    let status = 0;
    let detail = "";
    try {
      const res = await fetch(BASE + route.path, {
        redirect: "manual",
        method: route.method ?? "GET",
        ...(route.body ? { body: route.body, headers: { "Content-Type": "application/json" } } : {}),
      });
      status = res.status;
      if (route.location && !route.location(res.headers.get("location") ?? "")) {
        detail = ` — redirige a donde no debe (${res.headers.get("location")})`;
      }
      if (route.json) {
        const body = await res.json();
        if (!route.json(body)) detail = ` — el cuerpo no tiene la forma esperada`;
      }
    } catch (err) {
      detail = ` — ${err.message}`;
    }

    const ok = route.expect(status) && !detail;
    if (!ok) failures++;
    const metodo = route.method && route.method !== "GET" ? `${route.method} ` : "";
    console.log(`${ok ? "✓" : "✗"} ${String(status).padEnd(3)} ${metodo}${route.path}${detail}`);
  }

  const token = await login();

  if (!token) {
    console.log(
      "\n· Dashboard omitido: sin SMOKE_EMAIL/SMOKE_PASSWORD.\n" +
      "  Las pantallas con sesión no se comprobaron."
    );
  } else {
    console.log("\n--- con sesión ---");
    for (const ruta of AUTH_ROUTES) {
      const path = typeof ruta === "string" ? ruta : ruta.path;
      const esperado = typeof ruta === "string" ? 200 : ruta.status;
      let status = 0;
      let detail = "";
      try {
        const res = await fetch(BASE + path, {
          redirect: "manual",
          headers: { Cookie: `session_token=${token}` },
        });
        status = res.status;
        // Un 307 acá no es "todavía no atiende": es que la sesión no se aceptó,
        // y entonces esta tanda no está comprobando nada. Conviene decirlo.
        if (status === 307 || status === 302) {
          detail = " — redirigió al login: la sesión no fue aceptada";
        }
      } catch (err) {
        detail = ` — ${err.message}`;
      }

      const ok = status === esperado && !detail;
      if (!ok) failures++;
      console.log(`${ok ? "✓" : "✗"} ${String(status).padEnd(3)} ${path}${detail}`);
    }
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  failures++;
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(300);
  try { server.kill("SIGKILL"); } catch {}
}

if (failures) {
  console.error(`\n${failures} ruta(s) fallaron.\n--- salida del server ---\n${serverLog.slice(-3000)}`);
  process.exit(1);
}
const conSesion = process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD;
console.log(
  `\n${ROUTES.length + (conSesion ? AUTH_ROUTES.length : 0)} rutas OK` +
  `${conSesion ? " (incluye el dashboard con sesión)" : " — dashboard sin comprobar"}.`
);
process.exit(0);
