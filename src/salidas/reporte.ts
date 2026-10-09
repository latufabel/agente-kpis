// Reporte local de cada corrida: salida/<producto>/reporte.md + resultado.json.
// Es lo que ve el PM (y los evaluadores) en modo demo, sin Jira ni Notion.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ResultadoCorrida } from "../pipeline.ts";

const ICONO = { critica: "🔴", alta: "🟠", media: "🟡", baja: "⚪" } as const;

export function escribirReporte(dir: string, r: ResultadoCorrida): string {
  mkdirSync(dir, { recursive: true });
  const { analista, desvios, analitica } = r;
  const decision = new Map(analista.decisiones_temas.map((d) => [d.tema, d.decision]));
  const L: string[] = [];

  L.push(`# Agente KPIs — ${r.producto}`, "");
  L.push(`Corrida ${r.fecha.slice(0, 16).replace("T", " ")} · modo ${r.modo} · ${analitica.totalFeedback} feedbacks (${analitica.ventana.desde} a ${analitica.ventana.hasta})`, "");
  L.push("## Resumen", "", desvios.resumen_ejecutivo, "");

  L.push("## Alertas de desvío", "");
  for (const a of desvios.alertas) {
    L.push(`### ${ICONO[a.severidad]} P${a.prioridad} · ${a.titulo}`, "");
    L.push(`**Severidad:** ${a.severidad} · **Tipo:** ${a.tipo} · **Forma:** ${a.forma}${a.version_relacionada ? ` · **Versión:** ${a.version_relacionada}` : ""}${a.alerta_existente ? ` · actualiza ${a.alerta_existente}` : ""}`, "");
    L.push(a.descripcion, "");
    L.push(`**Hipótesis de causa:** ${a.hipotesis_causa}`, "");
    if (a.kpis_relacionados.length) L.push(`**KPIs que mueve:** ${a.kpis_relacionados.join(" · ")}`, "");
    L.push(`**Evidencia:** ${a.evidencia.join(", ")}`, "");
    if (a.clientes_en_riesgo.length) {
      L.push("**Clientes en riesgo:**", ...a.clientes_en_riesgo.map((c) => `- ${c.cliente}: ${c.motivo}`), "");
    }
    if (a.advertencias.length) L.push("**Advertencias:**", ...a.advertencias.map((x) => `- ${x}`), "");
    L.push("**Próximos pasos:**", ...a.proximos_pasos.map((x) => `- ${x}`), "");
  }

  L.push("## KPIs propuestos (estado «Propuesto», a aprobar por el PM)", "");
  for (const k of analista.kpis_nuevos) {
    const yaPropuesto = k.ya_propuesto ? ` _(ya propuesto: se descartó en ${k.ya_propuesto}; baja prioridad)_` : "";
    L.push(`### P${k.prioridad} · ${k.nombre}${yaPropuesto}`, "");
    L.push(`- **Definición:** ${k.definicion}`);
    L.push(`- **Fórmula:** ${k.formula}`);
    L.push(`- **Fuente del dato:** ${k.fuente_datos}`);
    L.push(`- **Baseline:** ${k.baseline}`);
    L.push(`- **Objetivo:** ${k.objetivo}`);
    L.push(`- **Por qué importa:** ${k.por_que_importa}`);
    L.push(`- **Temas:** ${k.temas.join(" · ")}`);
    L.push(`- **Evidencia:** ${k.evidencia.join(", ")}`, "");
  }

  if (r.mejoras?.mejoras.length) {
    L.push("## Mejoras sugeridas (estado «Propuesto», a aprobar por el PM)", "");
    for (const m of r.mejoras.mejoras) {
      L.push(`### P${m.prioridad} · ${m.titulo}`, "");
      L.push(`_${m.historia}_`, "");
      L.push(m.descripcion, "");
      L.push(`- **KPI que mueve:** ${m.kpi}`);
      L.push(`- **Impacto esperado:** ${m.impacto_esperado}`);
      L.push(`- **Esfuerzo:** ${m.esfuerzo}`);
      L.push(`- **Evidencia:** ${m.evidencia.join(", ")}`);
      L.push("- **Criterios de aceptación:**", ...m.criterios_aceptacion.map((c) => `  - ${c}`), "");
    }
  }

  L.push("## Evidencia sumada a KPIs existentes", "");
  if (!analista.evidencia_kpis_existentes.length) L.push("_Ninguna._", "");
  for (const e of analista.evidencia_kpis_existentes) {
    const k = r.kpisExistentes.find((x) => x.clave === e.clave);
    L.push(`- **${e.clave} ${k?.nombre ?? ""}** (+${e.evidencia.length}): ${e.resumen} Evidencia: ${e.evidencia.join(", ")}`);
  }
  L.push("");

  L.push("## Temas detectados", "");
  L.push(`| Tema | Total | ${analitica.ventana.meses.join(" | ")} | Forma | Decisión |`);
  L.push(`|---|---:|${analitica.ventana.meses.map(() => "---:").join("|")}|---|---|`);
  for (const t of analitica.temas) {
    const forma = t.versionAsociada ? `${t.forma} (tras ${t.versionAsociada})` : t.forma;
    L.push(`| ${t.tema} | ${t.total} | ${Object.values(t.porMes).join(" | ")} | ${forma} | ${decision.get(t.tema) ?? "—"} |`);
  }
  L.push("");

  L.push("## NPS", "");
  L.push("| Período | n | NPS |", "|---|---:|---:|");
  for (const p of [...analitica.nps.porMes, ...analitica.nps.porVersion]) {
    L.push(`| ${p.periodo} | ${p.n} | ${p.nps ?? "—"}${p.muestraChica ? " ⚠ muestra chica" : ""} |`);
  }
  L.push("");

  if (analitica.senalesClientes.length) {
    L.push("## Señales por cliente", "");
    for (const s of analitica.senalesClientes) {
      L.push(`- **${s.cliente}** (${s.segmento}${s.pagadores != null ? `, ${s.pagadores} pagadores` : ""}): ${s.motivo}. Temas: ${s.temas.join(" · ")}`);
    }
    L.push("");
  }

  const archivo = path.join(dir, "reporte.md");
  writeFileSync(archivo, L.join("\n"));
  writeFileSync(path.join(dir, "resultado.json"), JSON.stringify(r, null, 2) + "\n");
  return archivo;
}
