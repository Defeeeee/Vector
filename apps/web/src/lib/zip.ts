/**
 * Un ZIP mínimo, sin comprimir (método "stored"): lo usa la descarga de las pegatinas, un PNG
 * por código. Los PNG ya vienen comprimidos, así que comprimirlos de nuevo no ahorra nada, y
 * así no hace falta una dependencia para esto.
 *
 * Formato: APPNOTE de PKWARE, secciones 4.3.7 (encabezado local), 4.3.12 (directorio central)
 * y 4.3.16 (fin del directorio central). Nombres en UTF-8 (bit 11).
 */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function armarZip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const { nombre, datos } of archivos) {
    const n = new TextEncoder().encode(nombre);
    const crc = crc32(datos);

    const local = new Uint8Array(30 + n.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true); // versión necesaria
    l.setUint16(6, 0x0800, true); // nombre en UTF-8
    l.setUint16(8, 0, true); // sin comprimir
    l.setUint16(10, 0, true); // hora
    l.setUint16(12, 0x21, true); // fecha: 1/1/1980
    l.setUint32(14, crc, true);
    l.setUint32(18, datos.length, true);
    l.setUint32(22, datos.length, true);
    l.setUint16(26, n.length, true);
    local.set(n, 30);

    const central = new Uint8Array(46 + n.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(n, 46);

    locales.push(local, datos);
    centrales.push(central);
    desplazamiento += local.length + datos.length;
  }

  const tamanoCentral = centrales.reduce((t, x) => t + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamanoCentral, true);
  f.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...centrales, fin];
  const salida = new Uint8Array(partes.reduce((t, x) => t + x.length, 0));
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}
