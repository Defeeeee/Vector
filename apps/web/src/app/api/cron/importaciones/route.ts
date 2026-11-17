import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { barrerImportaciones } from "@/lib/importar-libro-servidor";

/**
 * El barrido de las importaciones del libro, cada 5 minutos desde el crontab del server:
 *
 *   *\/5 * * * * ~/bin/vector-importaciones.sh
 *
 * Retoma los trabajos que quedaron 'procesando' sin latido hace más de 10 minutos (un deploy
 * reinicia `next start`) desde el lote donde estaban, manda el mail que no salió y borra los
 * archivos de las importadas, las descartadas y las de más de 7 días. Correrlo dos veces
 * seguidas no repite nada: un trabajo que este proceso ya está leyendo se saltea.
 */
function coincide(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const esperado = process.env.DOCUMENTS_ALERT_SECRET;
  if (!esperado) return NextResponse.json({ error: "Barrido no configurado" }, { status: 503 });
  if (!coincide(req.headers.get("X-Cron-Secret") ?? "", esperado)) return NextResponse.json({ error: "Secreto inválido" }, { status: 401 });
  return NextResponse.json(await barrerImportaciones());
}
