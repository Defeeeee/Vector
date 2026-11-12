import { describe, expect, it } from "vitest";
import { claveDeAvisoVuelo, endpointDePushValido, estadoDeAvisosVuelo, leerSuscripcionVuelo } from "./avisos-vuelo";
import { destinoDelAviso, leerAviso } from "./push";

const base = { soportaPush: true, esIOS: false, instalada: false, permiso: "default" as const, suscripto: false, pidioEsteVuelo: false };

describe("estadoDeAvisosVuelo", () => {
  it("sin haberlo pedido, apagados; el navegador suscripto a la red no cuenta", () => {
    expect(estadoDeAvisosVuelo({ ...base, permiso: "granted", suscripto: true })).toBe("apagados");
  });

  it("prendidos sólo si este vuelo lo pidió, con permiso y suscripción", () => {
    expect(estadoDeAvisosVuelo({ ...base, permiso: "granted", suscripto: true, pidioEsteVuelo: true })).toBe("prendidos");
    expect(estadoDeAvisosVuelo({ ...base, permiso: "granted", suscripto: false, pidioEsteVuelo: true })).toBe("apagados");
  });

  it("bloqueados, iPhone sin instalar y sin soporte, como en la red", () => {
    expect(estadoDeAvisosVuelo({ ...base, permiso: "denied" })).toBe("bloqueados");
    expect(estadoDeAvisosVuelo({ ...base, esIOS: true, soportaPush: false })).toBe("instalar-app");
    expect(estadoDeAvisosVuelo({ ...base, soportaPush: false })).toBe("sin-soporte");
  });
});

describe("endpointDePushValido", () => {
  it("acepta los servicios de push conocidos", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(endpointDePushValido(e)).toBe(true);
    }
  });

  it("rechaza lo demás: http, hosts ajenos, usuario, puerto, vacío", () => {
    for (const e of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://evil.example.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://fcm.googleapis.com@evil.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://127.0.0.1/x",
      "https://fcm.googleapis.com",
      " https://fcm.googleapis.com/x",
      "",
      null,
      42,
    ]) {
      expect(endpointDePushValido(e)).toBe(false);
    }
  });
});

describe("leerSuscripcionVuelo", () => {
  const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc-abc_def", auth: "x1_-Y" } };

  it("se queda sólo con endpoint y claves", () => {
    expect(leerSuscripcionVuelo({ ...ok, expirationTime: null, extra: "x" })).toEqual(ok);
  });

  it("descarta lo que no sirve", () => {
    expect(leerSuscripcionVuelo(null)).toBeNull();
    expect(leerSuscripcionVuelo({ ...ok, endpoint: "https://evil.example.com/x" })).toBeNull();
    expect(leerSuscripcionVuelo({ ...ok, keys: { p256dh: "", auth: "a" } })).toBeNull();
    expect(leerSuscripcionVuelo({ ...ok, keys: { p256dh: "a b", auth: "a" } })).toBeNull();
  });
});

describe("el aviso del vuelo en el service worker", () => {
  it("el service worker lo lee tal cual y tocarlo abre el link del vuelo", () => {
    const token = "t".repeat(40);
    const aviso = leerAviso(JSON.stringify({ titulo: "Federico despegó de SADM", cuerpo: "Seguí el vuelo en vivo.", url: `/seguir/${token}`, etiqueta: "vector-vuelo-x-despegue" }));
    expect(aviso.url).toBe(`/seguir/${token}`);
    expect(destinoDelAviso(aviso.url)).toBe(`/seguir/${token}`);
  });

  it("la clave de recordatorio es por vuelo", () => {
    expect(claveDeAvisoVuelo("abc")).not.toBe(claveDeAvisoVuelo("abd"));
  });
});
