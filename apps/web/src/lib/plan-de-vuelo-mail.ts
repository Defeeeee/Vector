import { asuntoDelMail, cuerpoDelMail, type AvisoDelPlan, type PlanOaci } from "./plan-de-vuelo";

/**
 * El mail con el que Vector presenta el plan de vuelo a la oficina ARO/AIS.
 *
 * **Copia el de FPL.AR**, que es el que las oficinas ya reciben de los planes de Federico
 * (17/10/2026): asunto `LVS100-SRDL(1815)SADM_171026`, el cuerpo con desde, hasta, fecha y
 * EOBT, la firma del comandante, y al pie que las respuestas van al correo del piloto.
 * AIC A 19/2026: el plan "firmado, digitalizado y enviado como adjunto (en PDF) a la oficina
 * ARO/AIS del aeródromo de salida", "indicando en el asunto … el Nro. de vuelo/matricula".
 *
 * **Sin seguimiento**: este mail no pasa por `enviarConSeguimiento` (ni imagen de apertura
 * ni links redirigidos). Es una presentación ante una oficina del Estado, no un mail de
 * Vector a un piloto.
 *
 * **La prueba** va sólo al piloto, con el asunto marcado y una línea arriba que dice a
 * dónde iría: es para ver cómo le llega a la oficina antes de mandárselo.
 *
 * Puro: recibe todo, devuelve el mail.
 */

export type ModoEnvio = "prueba" | "aro";

export interface DatosMailPlan {
  plan: PlanOaci;
  nombres: { salida: string; destino: string };
  /** El mail del piloto: va en copia, y a él van las respuestas. */
  piloto: string;
  oficina: { correo: string; nombre: string; oaci: string } | null;
  modo: ModoEnvio;
  /**
   * Un aviso sobre el plan: la demora (DLA, AIP ENR 1.10, 7.2), con `plan` ya con la nueva
   * EOBT y fecha (`planConDemora`) y la hora de antes acá, o la cancelación (CNL, Apéndice
   * 5). El asunto lleva `DLA` o `CNL` adelante del de siempre.
   */
  aviso?: AvisoDelPlan;
}

export interface MailPlan {
  para: string;
  cc: string[];
  responderA: string;
  asunto: string;
  texto: string;
  html: string;
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function armarMailPlan(d: DatosMailPlan): MailPlan {
  const asuntoReal = `${d.aviso ? `${d.aviso.tipo.toUpperCase()} ` : ""}${asuntoDelMail(d.plan)}`;
  const pie = [
    "—",
    "Para cualquier consulta o respuesta, por favor escriban directamente al",
    `correo del piloto: ${d.piloto}, o usen la opción "Responder a todos"`,
    "para incluir al piloto en la respuesta.",
    "Este mensaje fue generado automáticamente por Vector.",
  ];
  const cuerpo = cuerpoDelMail(d.plan, d.nombres, d.aviso);
  const aviso =
    d.modo === "prueba"
      ? [
          `PRUEBA: en el envío real, este mail va a ${d.oficina ? `${d.oficina.correo} (ARO/AIS ${d.oficina.nombre}, ${d.oficina.oaci})` : "la oficina ARO/AIS que elijas"}, con copia a vos.`,
          "",
        ]
      : [];
  const texto = [...aviso, cuerpo, d.piloto, "", ...pie].join("\n");

  // El HTML es el mismo texto, sin diseño: lo lee una persona en una oficina, y tiene que
  // verse igual en cualquier cliente de correo.
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">',
    ...(d.modo === "prueba"
      ? [`<p style="background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:8px 12px;color:#9a3412">${escapar(aviso[0])}</p>`]
      : []),
    `<pre style="font-family:'Courier New',Courier,monospace;font-size:14px;white-space:pre-wrap;margin:0">${escapar([cuerpo, d.piloto].join("\n"))}</pre>`,
    `<p style="color:#666;font-size:12px;margin-top:24px">${pie.map(escapar).join("<br>")}</p>`,
    "</div>",
  ].join("");

  return {
    para: d.modo === "prueba" || !d.oficina ? d.piloto : d.oficina.correo,
    cc: d.modo === "aro" ? [d.piloto] : [],
    responderA: d.piloto,
    asunto: d.modo === "prueba" ? `PRUEBA · ${asuntoReal}` : asuntoReal,
    texto,
    html,
  };
}
