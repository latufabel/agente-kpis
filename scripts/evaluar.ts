// Evalúa una corrida contra las respuestas esperadas (ground truth del fixture).
// Los agentes nunca ven el campo "patron": solo lo usa este script.
//
//   npm run demo && npm run evaluar

import { readFileSync } from "node:fs";
import type { ResultadoCorrida } from "../src/pipeline.ts";

const PRODUCTO = process.argv[2] ?? "cobros-recurrentes";
const r: ResultadoCorrida = JSON.parse(readFileSync(`salida/${PRODUCTO}/resultado.json`, "utf8"));
const fixture: { notion_id: string; patron: string }[] = JSON.parse(
  readFileSync("data/fixtures/feedback_cobros_recurrentes.json", "utf8").replace(/^﻿/, ""),
);

const PATRONES = {
  P1: { prefijo: "P1", nombre: "Mail no llega al pagador", forma: "constante" },
  P2: { prefijo: "P2", nombre: "Regresión v1.3 (adjuntos)", forma: "pico" },
  P3: { prefijo: "P3", nombre: "Conciliación manual no escala", forma: "creciente" },
  P4: { prefijo: "P4", nombre: "Impagos invisibles", forma: "constante" },
} as const;
type Clave = keyof typeof PATRONES | "RUIDO";

const patronDe = new Map<string, Clave>(
  fixture.map((f) => [f.notion_id, (f.patron.startsWith("P") ? f.patron.slice(0, 2) : "RUIDO") as Clave]),
);
const totalPorPatron = new Map<Clave, number>();
for (const p of patronDe.values()) totalPorPatron.set(p, (totalPorPatron.get(p) ?? 0) + 1);

/** Patrón mayoritario de un conjunto de IDs. */
function mayoria(ids: string[]): { patron: Clave | null; pureza: number } {
  const c = new Map<Clave, number>();
  for (const id of ids) {
    const p = patronDe.get(id);
    if (p) c.set(p, (c.get(p) ?? 0) + 1);
  }
  const [patron, n] = [...c.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { patron, pureza: ids.length ? n / ids.length : 0 };
}

const checks: { criterio: string; ok: boolean; detalle: string }[] = [];
const check = (criterio: string, ok: boolean, detalle: string) => checks.push({ criterio, ok, detalle });
const pct = (x: number) => `${Math.round(x * 100)}%`;

// 1. Temas: cada patrón debe quedar agrupado.
const decision = new Map(r.analista.decisiones_temas.map((d) => [d.tema, d.decision]));
const temasDe = new Map<Clave, typeof r.analitica.temas>();
for (const t of r.analitica.temas) {
  const { patron } = mayoria(t.ids);
  if (patron) temasDe.set(patron, [...(temasDe.get(patron) ?? []), t]);
}
for (const [clave, p] of Object.entries(PATRONES) as [keyof typeof PATRONES, (typeof PATRONES)[keyof typeof PATRONES]][]) {
  const temas = temasDe.get(clave) ?? [];
  const ids = temas.flatMap((t) => t.ids);
  const aciertos = ids.filter((id) => patronDe.get(id) === clave).length;
  const recall = aciertos / (totalPorPatron.get(clave) ?? 1);
  const precision = ids.length ? aciertos / ids.length : 0;
  check(
    `${clave} detectado (${p.nombre})`,
    recall >= 0.8 && precision >= 0.8,
    `recall ${pct(recall)} · precisión ${pct(precision)} · temas: ${temas.map((t) => `"${t.tema}"`).join(", ") || "ninguno"}`,
  );
  const principal = [...temas].sort((a, b) => b.total - a.total)[0];
  const formaOk = principal?.forma === p.forma && (clave !== "P2" || principal.versionAsociada === "v1.3");
  check(
    `${clave} forma = ${p.forma}${clave === "P2" ? " tras v1.3" : ""}`,
    formaOk,
    principal ? `${principal.forma}${principal.versionAsociada ? ` tras ${principal.versionAsociada}` : ""} (${Object.values(principal.porMes).join("/")})` : "sin tema",
  );
}

// 2. Ruido separado.
const enAccionables = r.analitica.temas.filter((t) => decision.get(t.tema) === "accionable").flatMap((t) => t.ids);
const ruidoFiltrado = 1 - enAccionables.filter((id) => patronDe.get(id) === "RUIDO").length / (totalPorPatron.get("RUIDO") ?? 1);
const senalRetenida = enAccionables.filter((id) => patronDe.get(id) !== "RUIDO").length / (r.analitica.totalFeedback - (totalPorPatron.get("RUIDO") ?? 0));
check("Ruido separado de la señal", ruidoFiltrado >= 0.8 && senalRetenida >= 0.9, `ruido filtrado ${pct(ruidoFiltrado)} · señal retenida ${pct(senalRetenida)}`);

// 3. KPIs: cada patrón cubierto, sin KPIs de ruido, P1 absorbido por el KPI existente.
const kpisPorPatron = new Map<Clave, string[]>();
for (const k of r.analista.kpis_nuevos) {
  const { patron } = mayoria(k.evidencia);
  if (patron) kpisPorPatron.set(patron, [...(kpisPorPatron.get(patron) ?? []), k.nombre]);
}
const evidenciaExistente = r.analista.evidencia_kpis_existentes.map((e) => ({ ...e, ...mayoria(e.evidencia) }));
for (const clave of Object.keys(PATRONES) as (keyof typeof PATRONES)[]) {
  const nuevos = kpisPorPatron.get(clave) ?? [];
  const existentes = evidenciaExistente.filter((e) => e.patron === clave).map((e) => e.clave);
  check(`${clave} tiene KPI`, nuevos.length + existentes.length > 0, [...existentes.map((c) => `${c} (existente)`), ...nuevos].join(" · ") || "ninguno");
}
const p1Absorbido = evidenciaExistente.some((e) => e.patron === "P1");
const duplicado = r.analista.kpis_nuevos.some((k) => /tasa de respuesta/i.test(k.nombre) && mayoria(k.evidencia).patron === "P1");
check("P1 suma evidencia al KPI existente sin duplicarlo", p1Absorbido && !duplicado, `evidencia a existente: ${p1Absorbido ? "sí" : "no"} · duplicado: ${duplicado ? "sí" : "no"}`);
const kpisRuido = r.analista.kpis_nuevos.filter((k) => mayoria(k.evidencia).patron === "RUIDO");
check("El ruido no genera KPIs", kpisRuido.length === 0, kpisRuido.map((k) => k.nombre).join(" · ") || "ok");
const conBaseline = r.analista.kpis_nuevos.filter((k) => /\d/.test(k.baseline)).length;
check("KPIs medibles con baseline", conBaseline >= Math.ceil(r.analista.kpis_nuevos.length * 0.6), `${conBaseline}/${r.analista.kpis_nuevos.length} con baseline numérico`);
const sinEvidencia = [...r.analista.kpis_nuevos, ...r.desvios.alertas].filter((x) => !x.evidencia.length).length;
check("Todo KPI y alerta cita FB-n", sinEvidencia === 0, sinEvidencia ? `${sinEvidencia} sin evidencia` : "ok");

// 4. Alertas.
const alertaP2 = r.desvios.alertas.find((a) => mayoria(a.evidencia).patron === "P2");
check(
  "P2: alerta crítica, prioridad 1, atribuida a v1.3",
  !!alertaP2 && alertaP2.severidad === "critica" && alertaP2.prioridad === 1 && /1\.3/.test(alertaP2.version_relacionada ?? ""),
  alertaP2 ? `${alertaP2.severidad} · P${alertaP2.prioridad} · versión ${alertaP2.version_relacionada}` : "sin alerta",
);
const textoAlertas = JSON.stringify(r.desvios.alertas);
check("Riesgo de abandono de EM-007 identificado", /EM-007/.test(textoAlertas), /EM-007/.test(textoAlertas) ? "mencionado" : "no mencionado");
const advierte = r.desvios.alertas.some((a) => a.advertencias.some((x) => /muestra|n\s*=|pocas respuestas/i.test(x)));
check("Advierte muestra chica de NPS", advierte, advierte ? "sí" : "no");

// Resultado.
const ok = checks.filter((c) => c.ok).length;
console.log(`\nEvaluación · ${r.producto} · corrida ${r.fecha.slice(0, 16)}\n`);
for (const c of checks) console.log(`${c.ok ? "✔" : "✘"} ${c.criterio}\n    ${c.detalle}`);
console.log(`\nPuntaje: ${ok}/${checks.length}`);
process.exitCode = ok === checks.length ? 0 : 1;
