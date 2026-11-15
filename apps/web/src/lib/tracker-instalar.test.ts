import { describe, expect, it } from "vitest";
import { desdeValido, detectarSistema, invitacionDeLaRuta, rutaDeInvitacionPegada } from "./tracker-instalar";

const TOKEN = "a".repeat(43);
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("detectarSistema", () => {
  it("Safari de iPhone no es otra app", () => {
    expect(detectarSistema(SAFARI_IOS)).toEqual({ sistema: "ios", enOtraApp: false, navegadorSugerido: "Safari" });
  });
  it("iOS con Chrome, Firefox o Edge pide Safari", () => {
    for (const marca of ["CriOS/130.0", "FxiOS/130.0", "EdgiOS/130.0"]) {
      const ua = SAFARI_IOS.replace("Version/18.0", marca);
      expect(detectarSistema(ua).enOtraApp).toBe(true);
    }
  });
  it("el navegador de Instagram o WhatsApp en iPhone es otra app", () => {
    expect(detectarSistema(SAFARI_IOS + " Instagram 300.0").enOtraApp).toBe(true);
    expect(detectarSistema(SAFARI_IOS.replace(" Safari/604.1", "")).enOtraApp).toBe(true); // webview sin "Safari/"
  });
  it("iPad que se hace pasar por Mac", () => {
    expect(detectarSistema("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5).sistema).toBe("ios");
    expect(detectarSistema("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0).sistema).toBe("otro");
  });
  it("Chrome de Android sirve; el webview de Facebook o WhatsApp no", () => {
    expect(detectarSistema(CHROME_ANDROID)).toEqual({ sistema: "android", enOtraApp: false, navegadorSugerido: "Chrome" });
    expect(detectarSistema(CHROME_ANDROID.replace("Pixel 8)", "Pixel 8; wv)") + " FB_IAB/FB4A").enOtraApp).toBe(true);
    expect(detectarSistema(CHROME_ANDROID + " Instagram 300").enOtraApp).toBe(true);
  });
  it("la compu no es ninguno", () => {
    expect(detectarSistema("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130").sistema).toBe("otro");
  });
});

describe("desdeValido", () => {
  it("acepta sólo la ruta de una invitación", () => {
    expect(desdeValido(`/invitacion/${TOKEN}`)).toBe(`/invitacion/${TOKEN}`);
  });
  it("rechaza lo demás", () => {
    for (const x of [null, "", "/", "/vuelo/" + TOKEN, "//evil.com", `/invitacion/${TOKEN}/x`, `/invitacion/${TOKEN}?a=1`, "/invitacion/corto", `https://evil.com/invitacion/${TOKEN}`, `/invitacion/${"a".repeat(129)}`, `/invitacion/${TOKEN}\n`]) {
      expect(desdeValido(x)).toBeNull();
    }
  });
});

describe("rutaDeInvitacionPegada", () => {
  it("entiende el link entero, la ruta y espacios alrededor", () => {
    const r = `/invitacion/${TOKEN}`;
    expect(rutaDeInvitacionPegada(`https://tracker.vectoraero.ar${r}`)).toBe(r);
    expect(rutaDeInvitacionPegada(`  ${r} `)).toBe(r);
    expect(rutaDeInvitacionPegada(`https://tracker.vectoraero.ar${r}?x=1#y`)).toBe(r);
  });
  it("no acepta otro host, http, puerto, usuario ni ruta distinta", () => {
    const r = `/invitacion/${TOKEN}`;
    for (const x of [`https://evil.com${r}`, `http://tracker.vectoraero.ar${r}`, `https://tracker.vectoraero.ar:8080${r}`, `https://tracker.vectoraero.ar.evil.com${r}`, `https://tracker.vectoraero.ar@evil.com${r}`, `https://tracker.vectoraero.ar/vuelo/${TOKEN}`, "hola", "", null, undefined]) {
      expect(rutaDeInvitacionPegada(x as string)).toBeNull();
    }
  });
});

describe("invitacionDeLaRuta", () => {
  it("devuelve la ruta sólo si es una invitación", () => {
    expect(invitacionDeLaRuta(`/invitacion/${TOKEN}`)).toBe(`/invitacion/${TOKEN}`);
    expect(invitacionDeLaRuta("/ingresar")).toBeNull();
  });
  it("un Android emulado desde una Mac sigue siendo Android", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36";
    expect(detectarSistema(ua, "MacIntel", 5).sistema).toBe("android");
  });
});
