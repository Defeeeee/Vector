#!/usr/bin/env python3
"""
Proxy CONNECT para que Vector (VPS oraclearm, São Paulo) llegue a ANAC desde otra IP.
ANAC dejó de aceptar conexiones del VPS (el CAD el 2026-10-28; MADHEL y los NOTAM, a más
tardar el 2026-11-02).

- Escucha sólo en la IP de Tailscale de la máquina (`ESCUCHA`).
- Sólo acepta conexiones de los orígenes de `ORIGENES` (el VPS).
- Sólo deja pasar CONNECT a los `host:puerto` de `DESTINOS`.
- El TLS va de punta a punta entre Vector y ANAC: el proxy no ve el contenido, sólo a qué
  host se conecta.

Corre como servicio de systemd (`proxy-anac.service`, al lado). Dónde y con qué lista:
- DefeServer (100.112.141.102:8899): login.anac.gob.ar y cad.anac.gob.ar, para el CAD del
  backend (`CAD_PROXY`). Esa copia es anterior a este archivo y tiene la lista escrita adentro.
- oraclex64 (100.71.80.77:8899): datos.anac.gob.ar (MADHEL) y ais.anac.gob.ar (NOTAM),
  para la web (`ANAC_PROXY`, `apps/web/src/lib/anac.ts`).
"""
import asyncio
import os
import sys


def _destinos(texto: str) -> set[tuple[str, int]]:
    salida = set()
    for item in texto.split(","):
        host, _, puerto = item.strip().rpartition(":")
        if host:
            salida.add((host.lower(), int(puerto)))
    return salida


_ip, _, _puerto = os.environ["ESCUCHA"].rpartition(":")
ESCUCHA = (_ip, int(_puerto))
PERMITIDOS_ORIGEN = {o.strip() for o in os.environ["ORIGENES"].split(",") if o.strip()}
PERMITIDOS_DESTINO = _destinos(os.environ["DESTINOS"])


async def tubo(lector, escritor):
    try:
        while datos := await lector.read(65536):
            escritor.write(datos)
            await escritor.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        escritor.close()


async def atender(lector, escritor):
    origen = escritor.get_extra_info("peername")[0]
    try:
        if origen not in PERMITIDOS_ORIGEN:
            return
        cabecera = await asyncio.wait_for(lector.readuntil(b"\r\n\r\n"), 10)
        metodo, destino, _ = cabecera.split(b"\r\n", 1)[0].decode("latin-1").split(" ", 2)
        host, _, puerto = destino.rpartition(":")
        if metodo != "CONNECT" or (host.lower(), int(puerto or 0)) not in PERMITIDOS_DESTINO:
            escritor.write(b"HTTP/1.1 403 Forbidden\r\n\r\n")
            await escritor.drain()
            print(f"rechazado {origen} {metodo} {destino}", flush=True)
            return
        l2, e2 = await asyncio.wait_for(asyncio.open_connection(host, int(puerto)), 10)
        escritor.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
        await escritor.drain()
        await asyncio.gather(tubo(lector, e2), tubo(l2, escritor))
    except Exception as exc:  # noqa: BLE001
        print(f"error {origen}: {type(exc).__name__}", flush=True)
    finally:
        escritor.close()


async def main():
    servidor = await asyncio.start_server(atender, *ESCUCHA)
    destinos = ", ".join(f"{h}:{p}" for h, p in sorted(PERMITIDOS_DESTINO))
    print(f"proxy ANAC en {ESCUCHA} para {destinos}", flush=True)
    async with servidor:
        await servidor.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
