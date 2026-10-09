// Agente 4 — Detector de desvíos: mira la forma de cada tema en el tiempo, su
// relación con las versiones, el NPS y las señales por cliente, y emite alertas
// priorizadas con evidencia, hipótesis de causa y próximos pasos.

import { z } from "zod";
import { llamarAgente } from "../llm.ts";
import type { Analitica } from "../analitica/metricas.ts";
import { MUESTRA_MINIMA_NPS } from "../analitica/metricas.ts";
import { formatearBrief } from "./interprete.ts";
import type { BriefProducto } from "./contexto.ts";
import type { AlertaAbierta } from "../tipos.ts";

export const SalidaDesvios = z.object({
  resumen_ejecutivo: z.string().describe("3-5 oraciones para el PM"),
  alertas: z.array(
    z.object({
      alerta_existente: z.string().nullable().describe("Clave de la alerta abierta en Jira si esta alerta es la misma; null si es nueva"),
      titulo: z.string(),
      severidad: z.enum(["critica", "alta", "media", "baja"]),
      prioridad: z.number().int().describe("1 = atender primero"),
      tipo: z.enum(["regresion", "problema_cronico", "tendencia_creciente", "riesgo_cliente", "caida_satisfaccion"]),
      forma: z.enum(["constante", "pico", "creciente", "decreciente", "esporadico"]),
      temas: z.array(z.string()),
      kpis_relacionados: z.array(z.string()).describe("Nombres o claves de KPIs que este desvío mueve"),
      version_relacionada: z.string().nullable(),
      descripcion: z.string(),
      hipotesis_causa: z.string(),
      evidencia: z.array(z.string()).describe("IDs FB-n"),
      clientes_en_riesgo: z.array(z.object({ cliente: z.string(), motivo: z.string() })),
      advertencias: z.array(z.string()).describe("Limitaciones de los datos, ej. muestra chica"),
      proximos_pasos: z.array(z.string()),
    }),
  ),
});
export type SalidaDesvios = z.infer<typeof SalidaDesvios>;

const SISTEMA = `Sos el agente Detector de desvíos de un equipo de producto.
Recibís métricas calculadas por código (no las recalcules ni las contradigas): forma de la serie de cada tema, comparación antes/después de cada versión, NPS por período y señales por cliente.

Tu trabajo es emitir alertas de desvío priorizadas:
- Una regresión que aparece después de una versión (forma "pico" asociada a una versión) es crítica: atribuila a esa versión y explicá la hipótesis de causa usando lo que cambió en ella.
- Distinguí la forma: constante (problema crónico), pico (algo cambió), creciente (empeora con el tiempo o con la escala del cliente).
- Señalá clientes en riesgo de abandono cuando su NPS cae o se quejan repetidamente, con el detalle.
- Si el NPS u otra métrica tiene muestra chica (menos de ${MUESTRA_MINIMA_NPS} respuestas), decilo en "advertencias" y no saques conclusiones fuertes solo de ese número.
- Cada alerta cita la evidencia con IDs FB-n exactos y propone próximos pasos concretos (investigar, corregir, medir, contactar al cliente).
- Si una alerta ya está abierta en Jira (te paso la lista), devolvela con "alerta_existente" = su clave para actualizarla en vez de duplicarla.
- Ordená por prioridad (1 = primero). No generes alertas para temas que el analista marcó como ruido.

Sé concreto y conciso.`;

export async function agenteDesvios(
  brief: BriefProducto,
  analitica: Analitica,
  temasAccionables: string[],
  kpis: { clave?: string; nombre: string }[],
  alertasAbiertas: AlertaAbierta[],
): Promise<SalidaDesvios> {
  const accionables = new Set(temasAccionables);
  const datos = {
    ventana: analitica.ventana,
    totalFeedback: analitica.totalFeedback,
    temas: analitica.temas.filter((t) => accionables.has(t.tema)),
    nps: analitica.nps,
    senalesClientes: analitica.senalesClientes,
  };
  const entrada = [
    `<contexto_producto>\n${formatearBrief(brief)}\n</contexto_producto>`,
    `<kpis>\n${JSON.stringify(kpis, null, 2)}\n</kpis>`,
    `<alertas_abiertas_en_jira>\n${alertasAbiertas.length ? JSON.stringify(alertasAbiertas, null, 2) : "(ninguna)"}\n</alertas_abiertas_en_jira>`,
    `<metricas>\n${JSON.stringify(datos, null, 2)}\n</metricas>`,
  ].join("\n\n");

  const salida = await llamarAgente({
    agente: "desvios",
    sistema: SISTEMA,
    entrada,
    esquema: SalidaDesvios,
    esfuerzo: "high",
  });
  const abiertas = new Set(alertasAbiertas.map((a) => a.clave));
  for (const a of salida.alertas) if (a.alerta_existente && !abiertas.has(a.alerta_existente)) a.alerta_existente = null;
  salida.alertas.sort((a, b) => a.prioridad - b.prioridad);
  return salida;
}
