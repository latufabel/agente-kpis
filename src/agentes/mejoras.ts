// Agente 5 (opcional) — Mejoras sugeridas: por cada KPI o alerta de la corrida,
// propone historias de mejora priorizadas, vinculadas al KPI que buscan mover.
// Se crean en Jira en estado "Propuesto": el PM aprueba antes de que entren al backlog.
// Se activa con AGENTE_MEJORAS=si o con --mejoras.

import { z } from "zod";
import { llamarAgente } from "../llm.ts";
import type { BriefProducto } from "./contexto.ts";
import { formatearBrief } from "./interprete.ts";
import type { SalidaAnalista } from "./analista.ts";
import type { SalidaDesvios } from "./desvios.ts";

export const SalidaMejoras = z.object({
  mejoras: z.array(
    z.object({
      titulo: z.string(),
      historia: z.string().describe('Formato: "Como <usuario>, quiero <capacidad>, para <beneficio>"'),
      descripcion: z.string().describe("Qué construir, en 2-4 oraciones"),
      kpi: z.string().describe("Clave o nombre exacto del KPI que esta mejora busca mover"),
      impacto_esperado: z.string().describe("Cuánto se espera mover el KPI y en qué plazo, partiendo del baseline"),
      esfuerzo: z.enum(["bajo", "medio", "alto"]),
      prioridad: z.number().int().describe("1 = hacer primero"),
      criterios_aceptacion: z.array(z.string()),
      evidencia: z.array(z.string()).describe("IDs FB-n que justifican la mejora"),
    }),
  ),
});
export type SalidaMejoras = z.infer<typeof SalidaMejoras>;

const SISTEMA = `Sos el agente de Mejoras sugeridas de un equipo de producto.
Recibís el contexto del producto, los KPIs (con su baseline) y las alertas de desvío de esta corrida, y las mejoras que ya están propuestas en Jira.

Tu trabajo: proponer las mejoras de producto concretas que más moverían esos KPIs.
- Cada mejora apunta a UN KPI (usá su clave o nombre exacto) y explica cuánto se espera moverlo respecto de su baseline.
- Atacá la causa de fondo descripta en las alertas y en la evidencia; respetá las restricciones del producto (por ejemplo, si el pagador no tiene cuenta, no propongas que inicie sesión).
- Priorizá por impacto sobre el esfuerzo: primero lo que destraba problemas críticos o regresiones.
- Entre 1 y 2 mejoras por KPI como máximo; no repitas mejoras que ya estén propuestas en Jira.
- Criterios de aceptación verificables. Citá evidencia con IDs FB-n exactos.

Sé concreto y conciso.`;

export async function agenteMejoras(
  brief: BriefProducto,
  kpis: { clave?: string; nombre: string; baseline?: string; definicion?: string }[],
  analista: SalidaAnalista,
  desvios: SalidaDesvios,
  mejorasAbiertas: string[],
): Promise<SalidaMejoras> {
  const alertas = desvios.alertas.map(({ titulo, severidad, prioridad, descripcion, hipotesis_causa, kpis_relacionados, evidencia }) => ({
    titulo, severidad, prioridad, descripcion, hipotesis_causa, kpis_relacionados, evidencia,
  }));
  const entrada = [
    `<contexto_producto>\n${formatearBrief(brief)}\n</contexto_producto>`,
    `<kpis>\n${JSON.stringify(kpis, null, 2)}\n</kpis>`,
    `<evidencia_nueva_en_kpis_existentes>\n${JSON.stringify(analista.evidencia_kpis_existentes, null, 2)}\n</evidencia_nueva_en_kpis_existentes>`,
    `<alertas>\n${JSON.stringify(alertas, null, 2)}\n</alertas>`,
    `<mejoras_ya_propuestas_en_jira>\n${mejorasAbiertas.length ? mejorasAbiertas.join("\n") : "(ninguna)"}\n</mejoras_ya_propuestas_en_jira>`,
  ].join("\n\n");

  const salida = await llamarAgente({
    agente: "mejoras",
    sistema: SISTEMA,
    entrada,
    esquema: SalidaMejoras,
    esfuerzo: "medium",
  });
  salida.mejoras.sort((a, b) => a.prioridad - b.prioridad);
  return salida;
}
