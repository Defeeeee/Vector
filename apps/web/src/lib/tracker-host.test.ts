import { describe, expect, it } from "vitest";
import { decidirEnTracker, esEstaticoDelTracker, esHostTracker, esRutaDelTrackerEnLaWeb, hostDeLaWeb, requiereSesionTracker } from "./tracker-host";

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
