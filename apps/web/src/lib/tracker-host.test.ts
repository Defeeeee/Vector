import { describe, expect, it } from "vitest";
import { decidirEnTracker, esEstaticoDelTracker, esHostLocal, esHostTracker, esRutaDeSeguir, esRutaDelTrackerEnLaWeb, hostDeLaWeb, origenDelTracker, requiereSesionTracker, urlDeSeguirEnElTracker } from "./tracker-host";

describe("esHostTracker", () => {
  it("reconoce el host del tracker, con o sin puerto, y el de pruebas", () => {
    expect(esHostTracker("tracker.vectoraero.ar")).toBe(true);
    expect(esHostTracker("Tracker.VectorAero.ar:443")).toBe(true);
    expect(esHostTracker("tracker.localhost:3001")).toBe(true);
    expect(esHostTracker("tracker.vectoraero.ar, vectoraero.ar")).toBe(true);
  });
  it("no confunde a la web ni a un host parecido", () => {
    expect(esHostTracker("vectoraero.ar")).toBe(false);
    expect(esHostTracker("www.vectoraero.ar")).toBe(false);
    expect(esHostTracker("mitracker.vectoraero.ar")).toBe(false);
    expect(esHostTracker("api.tracker.vectoraero.ar")).toBe(false);
    expect(esHostTracker("tracker.")).toBe(false);
    expect(esHostTracker(null)).toBe(false);
  });
});

describe("decidirEnTracker", () => {
  it("reescribe las pantallas al árbol del tracker sin cambiar la URL", () => {
    expect(decidirEnTracker("/", true)).toEqual({ tipo: "reescribe", destino: "/tracker" });
    expect(decidirEnTracker("/vuelo/abc", true)).toEqual({ tipo: "reescribe", destino: "/tracker/vuelo/abc" });
    expect(decidirEnTracker("/ingresar", false)).toEqual({ tipo: "reescribe", destino: "/tracker/ingresar" });
    expect(decidirEnTracker("/invitacion/tok", false)).toEqual({ tipo: "reescribe", destino: "/tracker/invitacion/tok" });
    expect(decidirEnTracker("/auth/callback", false)).toEqual({ tipo: "reescribe", destino: "/tracker/auth/callback" });
    expect(decidirEnTracker("/manifest.webmanifest", false)).toEqual({ tipo: "reescribe", destino: "/tracker/manifest.webmanifest" });
  });
  it("sin sesión, lo que la pide va a /ingresar; con sesión, /ingresar va al inicio", () => {
    expect(decidirEnTracker("/", false)).toEqual({ tipo: "redirige", destino: "/ingresar" });
    expect(decidirEnTracker("/vuelo/abc", false)).toEqual({ tipo: "redirige", destino: "/ingresar" });
    expect(decidirEnTracker("/ingresar", true)).toEqual({ tipo: "redirige", destino: "/" });
  });
  it("la invitación y el callback se abren sin cuenta, y con ella también", () => {
    expect(requiereSesionTracker("/invitacion/x")).toBe(false);
    expect(requiereSesionTracker("/auth/callback")).toBe(false);
    expect(decidirEnTracker("/invitacion/tok", true).tipo).toBe("reescribe");
  });
  it("el tracker nunca manda al dashboard: /dashboard va a la web", () => {
    expect(decidirEnTracker("/dashboard", true)).toEqual({ tipo: "a-la-web", destino: "/dashboard" });
    expect(decidirEnTracker("/dashboard/history", false)).toEqual({ tipo: "a-la-web", destino: "/dashboard/history" });
  });
  it("los archivos, la API y el service worker pasan", () => {
    for (const p of ["/_next/static/x.js", "/api/tracker/vuelos", "/sw.js", "/icono-192.png", "/marca/logo.svg", "/robots.txt"]) {
      expect(decidirEnTracker(p, true)).toEqual({ tipo: "pasa" });
    }
  });
  it("entrar por /tracker directo en este host no existe", () => {
    expect(decidirEnTracker("/tracker", true)).toEqual({ tipo: "no-existe" });
    expect(decidirEnTracker("/tracker/vuelo/x", true)).toEqual({ tipo: "no-existe" });
  });
});

describe("esRutaDelTrackerEnLaWeb", () => {
  it("/tracker en la web principal es 404", () => {
    expect(esRutaDelTrackerEnLaWeb("/tracker")).toBe(true);
    expect(esRutaDelTrackerEnLaWeb("/tracker/ingresar")).toBe(true);
    expect(esRutaDelTrackerEnLaWeb("/trackers")).toBe(false);
    expect(esRutaDelTrackerEnLaWeb("/dashboard")).toBe(false);
  });
});

describe("hostDeLaWeb y esEstaticoDelTracker", () => {
  it("la web es el host sin el tracker", () => {
    expect(hostDeLaWeb("tracker.vectoraero.ar")).toBe("vectoraero.ar");
    expect(hostDeLaWeb("tracker.localhost:3001")).toBe("localhost:3001");
    expect(hostDeLaWeb(null)).toBe("vectoraero.ar");
  });
  it("lo estático no renueva sesión, la API sí", () => {
    expect(esEstaticoDelTracker("/_next/static/a.js")).toBe(true);
    expect(esEstaticoDelTracker("/sw.js")).toBe(true);
    expect(esEstaticoDelTracker("/api/tracker/vuelos")).toBe(false);
    expect(esEstaticoDelTracker("/")).toBe(false);
  });
});

describe("/seguir/<token> en el host del tracker", () => {
  const tok = "a".repeat(32);
  it("pasa sin reescribir, con o sin sesión: es público y no es del árbol del tracker", () => {
    expect(decidirEnTracker(`/seguir/${tok}`, false)).toEqual({ tipo: "pasa" });
    expect(decidirEnTracker(`/seguir/${tok}`, true)).toEqual({ tipo: "pasa" });
    expect(requiereSesionTracker(`/seguir/${tok}`)).toBe(false);
  });
  it("no toca ni renueva sesión (es lo estático del tracker)", () => {
    expect(esEstaticoDelTracker(`/seguir/${tok}`)).toBe(true);
  });
  it("sólo ese camino: /seguir pelado o más profundo no", () => {
    expect(esRutaDeSeguir(`/seguir/${tok}`)).toBe(true);
    expect(esRutaDeSeguir(`/seguir/${tok}/`)).toBe(true);
    expect(esRutaDeSeguir("/seguir")).toBe(false);
    expect(esRutaDeSeguir("/seguir/")).toBe(false);
    expect(esRutaDeSeguir(`/seguir/${tok}/x`)).toBe(false);
    expect(decidirEnTracker("/seguir", true)).toEqual({ tipo: "reescribe", destino: "/tracker/seguir" });
  });
});

describe("el host de desarrollo", () => {
  it("reconoce localhost, 127.0.0.1, [::1], *.localhost y una IP de la red", () => {
    for (const h of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "tracker.localhost:3001", "192.168.0.12:3000"]) expect(esHostLocal(h)).toBe(true);
    for (const h of ["vectoraero.ar", "tracker.vectoraero.ar", "mi.localhost.com", "", null, undefined]) expect(esHostLocal(h)).toBe(false);
  });
});

describe("origenDelTracker", () => {
  it("la web pasa al tracker, con el puerto si lo trae", () => {
    expect(origenDelTracker("https://vectoraero.ar")).toBe("https://tracker.vectoraero.ar");
    expect(origenDelTracker("https://www.vectoraero.ar/dashboard")).toBe("https://tracker.vectoraero.ar");
    expect(origenDelTracker("https://vectoraero.ar:8443")).toBe("https://tracker.vectoraero.ar:8443");
  });
  it("el tracker, localhost y lo que no es una URL quedan como están", () => {
    expect(origenDelTracker("https://tracker.vectoraero.ar")).toBe("https://tracker.vectoraero.ar");
    expect(origenDelTracker("http://localhost:3000")).toBe("http://localhost:3000");
    expect(origenDelTracker("")).toBe("");
  });
});

describe("urlDeSeguirEnElTracker (la redirección 308 de los links viejos)", () => {
  const tok = "b".repeat(32);
  it("vectoraero.ar/seguir/<token> va al mismo link del tracker, con la búsqueda", () => {
    expect(urlDeSeguirEnElTracker("vectoraero.ar", `/seguir/${tok}`, "")).toBe(`https://tracker.vectoraero.ar/seguir/${tok}`);
    expect(urlDeSeguirEnElTracker("vectoraero.ar", `/seguir/${tok}`, "?x=1")).toBe(`https://tracker.vectoraero.ar/seguir/${tok}?x=1`);
    expect(urlDeSeguirEnElTracker("www.vectoraero.ar", `/seguir/${tok}`, "")).toBe(`https://tracker.vectoraero.ar/seguir/${tok}`);
  });
  it("con TRACKER_URL, a ése", () => {
    expect(urlDeSeguirEnElTracker("vectoraero.ar", `/seguir/${tok}`, "", "https://tracker.ejemplo.ar/")).toBe(`https://tracker.ejemplo.ar/seguir/${tok}`);
  });
  it("en desarrollo no redirige", () => {
    expect(urlDeSeguirEnElTracker("localhost:3000", `/seguir/${tok}`, "", "https://tracker.vectoraero.ar")).toBeNull();
    expect(urlDeSeguirEnElTracker("127.0.0.1:3000", `/seguir/${tok}`, "")).toBeNull();
  });
  it("en el tracker no redirige (no hay bucle) ni toca otras rutas", () => {
    expect(urlDeSeguirEnElTracker("tracker.vectoraero.ar", `/seguir/${tok}`, "")).toBeNull();
    expect(urlDeSeguirEnElTracker("vectoraero.ar", "/dashboard", "")).toBeNull();
    expect(urlDeSeguirEnElTracker("vectoraero.ar", "/seguir", "")).toBeNull();
  });
  it("sin host ni TRACKER_URL no inventa un destino", () => {
    expect(urlDeSeguirEnElTracker(null, `/seguir/${tok}`, "")).toBeNull();
  });
});
