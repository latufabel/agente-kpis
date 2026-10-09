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
      ya_propuesto: z
        .string()
        .nullable()
        .describe("Clave del KPI descartado que este KPI vuelve a proponer; null si es nuevo"),
    }),
  ),
});
export type SalidaAnalista = z.infer<typeof SalidaAnalista>;

const SISTEMA = `Sos el agente Analista de KPIs de un equipo de producto.
Recibís el contexto del producto, los KPIs que YA existen en Jira y los temas detectados en el feedback (con métricas calculadas por código y los textos completos).

Tu trabajo:
1. Decidí para cada tema si es "accionable" (un patrón real que merece medirse: varios feedbacks, impacto en los objetivos del producto) o "ruido" (consultas sueltas, elogios generales, pedidos aislados).
2. Para cada tema accionable, revisá primero los KPIs existentes. Si un KPI existente ya mide ese problema, sumale la evidencia en "evidencia_kpis_existentes" y NO propongas un KPI duplicado. Solo proponé KPIs nuevos para aspectos que ningún KPI existente cubre.
3. Cada KPI nuevo tiene que ser medible: definición precisa, fórmula, fuente del dato, baseline y un objetivo con plazo.
   El baseline es SIEMPRE un número o un rango numérico, nunca un adjetivo como "alto" o "bajo". Usá los números que aparezcan en el feedback citando el FB; si no hay uno exacto, estimalo a partir de la evidencia (por ejemplo, días de demora que cuentan los clientes, o la proporción de feedbacks afectados), explicá el cálculo en una oración e indicá cómo medirlo con precisión.
4. Citá evidencia con los IDs FB-n exactos de los temas correspondientes.
5. Priorizá: 1 = lo más urgente (problemas nuevos o regresiones que afectan a muchos usuarios van primero).
6. KPIs descartados: el PM los descartó en algún momento, pero el negocio cambia. No los ignores: si la evidencia actual vuelve a justificar medir lo mismo, proponelo igual y poné en "ya_propuesto" la clave del KPI descartado (va a quedar con baja prioridad para que el PM lo reconsidere). No uses los descartados para sumar evidencia.

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

  const activos = kpisExistentes.filter((k) => !k.descartado);
  const descartados = kpisExistentes.filter((k) => k.descartado);
  const lista = (ks: KpiExistente[]) =>
    ks.length ? JSON.stringify(ks.map(({ descartado, ...k }) => k), null, 2) : "(ninguno)";
  const entrada = [
    `<contexto_producto>\n${formatearBrief(brief)}\n</contexto_producto>`,
    `<kpis_existentes_en_jira>\n${lista(activos)}\n</kpis_existentes_en_jira>`,
    `<kpis_descartados_en_jira>\n${lista(descartados)}\n</kpis_descartados_en_jira>`,
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
  const clavesValidas = new Set(activos.map((k) => k.clave));
  const clavesDescartadas = new Set(descartados.map((k) => k.clave));
  const ultima = Math.max(0, ...salida.kpis_nuevos.map((k) => k.prioridad));
  for (const k of salida.kpis_nuevos) {
    k.evidencia = k.evidencia.filter((id) => idsValidos.has(id));
    if (k.ya_propuesto && !clavesDescartadas.has(k.ya_propuesto)) k.ya_propuesto = null;
    // Lo que el PM ya descartó vuelve con baja prioridad: al final de la cola.
    if (k.ya_propuesto) k.prioridad = ultima + 1;
  }
  salida.evidencia_kpis_existentes = salida.evidencia_kpis_existentes
    .filter((e) => clavesValidas.has(e.clave))
    .map((e) => ({ ...e, evidencia: e.evidencia.filter((id) => idsValidos.has(id)) }));
  salida.kpis_nuevos.sort((a, b) => a.prioridad - b.prioridad);
  return salida;
}
