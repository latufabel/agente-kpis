// Agente 3 — Analista de KPIs: contrasta cada tema con los KPIs que ya existen
// en Jira. Si un KPI existente lo mide, le suma evidencia (no duplica); si no,
// propone un KPI nuevo con definición, fórmula, baseline y evidencia.

import { z } from "zod";
import { llamarAgente } from "../llm.ts";
import type { Feedback, KpiExistente } from "../tipos.ts";
import type { MetricasTema } from "../analitica/metricas.ts";
import type { Clasificacion } from "./interprete.ts";
import { formatearBrief } from "./interprete.ts";
import type { BriefProducto } from "./contexto.ts";

export const SalidaAnalista = z.object({
  decisiones_temas: z.array(
    z.object({
      tema: z.string(),
      decision: z.enum(["accionable", "ruido"]),
      justificacion: z.string(),
    }),
  ),
  evidencia_kpis_existentes: z.array(
    z.object({
      clave: z.string().describe("Clave del KPI existente en Jira"),
      temas: z.array(z.string()),
      evidencia: z.array(z.string()).describe("IDs FB-n que respaldan"),
      resumen: z.string().describe("Qué agrega esta evidencia al KPI, 2-3 oraciones"),
    }),
  ),
  kpis_nuevos: z.array(
    z.object({
      nombre: z.string(),
      definicion: z.string(),
      formula: z.string(),
      fuente_datos: z.string().describe("De dónde sale el dato para medirlo"),
      baseline: z.string().describe("Punto de partida con número si el feedback lo permite, o cómo establecerlo"),
      objetivo: z.string().describe("Meta propuesta y plazo"),
      por_que_importa: z.string(),
      temas: z.array(z.string()),
      evidencia: z.array(z.string()).describe("IDs FB-n que respaldan"),
      prioridad: z.number().int().describe("1 = más urgente"),
    }),
  ),
});
export type SalidaAnalista = z.infer<typeof SalidaAnalista>;

const SISTEMA = `Sos el agente Analista de KPIs de un equipo de producto.
Recibís el contexto del producto, los KPIs que YA existen en Jira y los temas detectados en el feedback (con métricas calculadas por código y los textos completos).

Tu trabajo:
1. Decidí para cada tema si es "accionable" (un patrón real que merece medirse: varios feedbacks, impacto en los objetivos del producto) o "ruido" (consultas sueltas, elogios generales, pedidos aislados).
2. Para cada tema accionable, revisá primero los KPIs existentes. Si un KPI existente ya mide ese problema, sumale la evidencia en "evidencia_kpis_existentes" y NO propongas un KPI duplicado. Solo proponé KPIs nuevos para aspectos que ningún KPI existente cubre.
3. Cada KPI nuevo tiene que ser medible: definición precisa, fórmula, fuente del dato, baseline (usá números concretos que aparezcan en el feedback cuando existan, citando el FB; si no hay, explicá cómo tomarlo) y un objetivo con plazo.
4. Citá evidencia con los IDs FB-n exactos de los temas correspondientes.
5. Priorizá: 1 = lo más urgente (problemas nuevos o regresiones que afectan a muchos usuarios van primero).

Sé concreto y conciso. No inventes datos que no estén en el feedback o en el contexto.`;

export async function agenteAnalista(
  brief: BriefProducto,
  kpisExistentes: KpiExistente[],
  metricas: MetricasTema[],
  feedback: Feedback[],
  clasificaciones: Clasificacion[],
): Promise<SalidaAnalista> {
  const porId = new Map(feedback.map((f) => [f.id, f]));
  const temaDe = new Map(clasificaciones.map((c) => [c.id, c.tema]));
  const bloquesTemas = metricas.map((m) => {
    const { ids, comparacionVersiones, ...resto } = m;
    const textos = ids
      .map((id) => porId.get(id))
      .filter((f): f is Feedback => !!f && temaDe.get(f.id) === m.tema)
      .map((f) => `  [${f.id}] ${f.fecha} ${f.tipoUsuario} ${f.cliente}${f.nps != null ? ` NPS ${f.nps}` : ""}: ${f.texto}`)
      .join("\n");
    return `<tema nombre="${m.tema}">\nMétricas: ${JSON.stringify(resto)}\nFeedback:\n${textos}\n</tema>`;
  });

  const entrada = [
    `<contexto_producto>\n${formatearBrief(brief)}\n</contexto_producto>`,
    `<kpis_existentes_en_jira>\n${kpisExistentes.length ? JSON.stringify(kpisExistentes, null, 2) : "(ninguno)"}\n</kpis_existentes_en_jira>`,
    `<temas>\n${bloquesTemas.join("\n\n")}\n</temas>`,
  ].join("\n\n");

  const salida = await llamarAgente({
    agente: "analista",
    sistema: SISTEMA,
    entrada,
    esquema: SalidaAnalista,
    esfuerzo: "high",
  });

  // Higiene: solo IDs reales y claves de KPI existentes.
  const idsValidos = new Set(feedback.map((f) => f.id));
  const clavesValidas = new Set(kpisExistentes.map((k) => k.clave));
  for (const k of salida.kpis_nuevos) k.evidencia = k.evidencia.filter((id) => idsValidos.has(id));
  salida.evidencia_kpis_existentes = salida.evidencia_kpis_existentes
    .filter((e) => clavesValidas.has(e.clave))
    .map((e) => ({ ...e, evidencia: e.evidencia.filter((id) => idsValidos.has(id)) }));
  salida.kpis_nuevos.sort((a, b) => a.prioridad - b.prioridad);
  return salida;
}
