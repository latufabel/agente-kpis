// Orquestador: encadena los agentes. El flujo lo controla el código; cada
// agente hace una sola tarea con salida estructurada.
//
//   Contexto ─┐
//   Feedback ─┼─► Intérprete ─► Analítica (código) ─► Analista de KPIs ─► Detector de desvíos
//   KPIs Jira ┘

import { agenteContexto, type BriefProducto } from "./agentes/contexto.ts";
import { agenteInterprete, type Clasificacion, type Tema } from "./agentes/interprete.ts";
import { agenteAnalista, type SalidaAnalista } from "./agentes/analista.ts";
import { agenteDesvios, type SalidaDesvios } from "./agentes/desvios.ts";
import { analizar, type Analitica } from "./analitica/metricas.ts";
import { leerContextoFixture, leerFeedbackFixture, leerKpisFixture } from "./fuentes/fixtures.ts";
import { leerContextoNotion, leerFeedbackNotion } from "./fuentes/notion.ts";
import { leerAlertasAbiertas, leerKpisJira } from "./fuentes/jira.ts";
import type { AlertaAbierta, ConfigProducto, Feedback, KpiExistente } from "./tipos.ts";

export interface ResultadoCorrida {
  producto: string;
  fecha: string;
  modo: "demo" | "conectado";
  brief: BriefProducto;
  kpisExistentes: KpiExistente[];
  alertasAbiertas: AlertaAbierta[];
  feedback: Feedback[];
  temas: Tema[];
  clasificaciones: Clasificacion[];
  /** IDs clasificados en esta corrida (los que hay que marcar como procesados). */
  nuevos: string[];
  analitica: Analitica;
  analista: SalidaAnalista;
  desvios: SalidaDesvios;
}

const paso = (n: string, s: string) => console.log(`\n${n} ${s}`);

export async function correr(config: ConfigProducto, opciones: { demo: boolean }): Promise<ResultadoCorrida | null> {
  const { demo } = opciones;

  paso("①", `Leyendo fuentes (${demo ? "fixtures locales" : "Notion + Jira"})`);
  const [documentacion, feedback, kpisExistentes, alertasAbiertas] = demo
    ? [leerContextoFixture(config), leerFeedbackFixture(config), leerKpisFixture(config), []]
    : await Promise.all([
        leerContextoNotion(config.notion.paginaContexto),
        leerFeedbackNotion(config.notion.dataSourceFeedback),
        leerKpisJira(config),
        leerAlertasAbiertas(config),
      ]);
  const previos = feedback.filter((f) => f.clasificacionPrevia);
  const pendientes = feedback.filter((f) => !f.clasificacionPrevia);
  console.log(`   ${feedback.length} feedbacks (${pendientes.length} sin procesar) · ${kpisExistentes.length} KPIs existentes · ${alertasAbiertas.length} alertas abiertas`);
  if (!pendientes.length) {
    console.log("   No hay feedback nuevo: nada que hacer.");
    return null;
  }

  paso("②", "Agente Contexto: leyendo el producto");
  const brief = await agenteContexto(documentacion);
  console.log(`   ${brief.nombre}: ${brief.versiones.length} versiones, ${brief.limitaciones.length} limitaciones conocidas`);

  paso("③", `Agente Intérprete: clasificando ${pendientes.length} feedbacks`);
  const temasExistentes = [...new Set(previos.map((f) => f.clasificacionPrevia!.tema))].map((tema) => ({ tema, descripcion: "" }));
  const interpretado = await agenteInterprete(brief, pendientes, temasExistentes);
  const clasificaciones: Clasificacion[] = [
    ...previos.map((f) => ({
      id: f.id,
      tema: f.clasificacionPrevia!.tema,
      sentimiento: f.clasificacionPrevia!.sentimiento as Clasificacion["sentimiento"],
    })),
    ...interpretado.clasificaciones,
  ];
  console.log(`   ${interpretado.temas.length} temas en el catálogo`);

  paso("④", "Analítica: series por tema, versiones, NPS y clientes");
  const analitica = analizar(feedback, clasificaciones, brief.versiones);
  for (const t of analitica.temas.slice(0, 8)) {
    console.log(`   ${String(t.total).padStart(3)} · ${t.forma.padEnd(11)} · ${t.tema}${t.versionAsociada ? ` (tras ${t.versionAsociada})` : ""}`);
  }

  paso("⑤", "Agente Analista de KPIs: contrastando con los KPIs de Jira");
  const analista = await agenteAnalista(brief, kpisExistentes, analitica.temas, feedback, clasificaciones);
  const accionables = analista.decisiones_temas.filter((d) => d.decision === "accionable").map((d) => d.tema);

  // Corrida incremental: el análisis mira toda la historia, pero solo se publica
  // lo que tiene feedback nuevo detrás (no se repite evidencia ni se proponen KPIs
  // por temas que no cambiaron).
  const nuevos = new Set(interpretado.clasificaciones.map((c) => c.id));
  const citaNuevo = (ids: string[]) => ids.some((id) => nuevos.has(id));
  const incremental = previos.length > 0;
  if (incremental) {
    const omitidos = analista.kpis_nuevos.filter((k) => !citaNuevo(k.evidencia));
    analista.kpis_nuevos = analista.kpis_nuevos.filter((k) => citaNuevo(k.evidencia));
    analista.evidencia_kpis_existentes = analista.evidencia_kpis_existentes
      .map((e) => ({ ...e, evidencia: e.evidencia.filter((id) => nuevos.has(id)) }))
      .filter((e) => e.evidencia.length > 0);
    for (const k of omitidos) console.log(`   (se omite el KPI "${k.nombre}": no hay feedback nuevo sobre ese tema)`);
  }
  console.log(`   ${accionables.length} temas accionables · ${analista.kpis_nuevos.length} KPIs nuevos · evidencia nueva para ${analista.evidencia_kpis_existentes.length} KPI(s) existentes`);

  paso("⑥", "Agente Detector de desvíos");
  const kpis = [
    ...kpisExistentes.filter((k) => !k.descartado).map((k) => ({ clave: k.clave, nombre: k.nombre })),
    ...analista.kpis_nuevos.map((k) => ({ nombre: k.nombre })),
  ];
  const desvios = await agenteDesvios(brief, analitica, accionables, kpis, alertasAbiertas);
  if (incremental) {
    // El feedback nuevo de un tema se suma a la evidencia de las alertas de ese tema.
    const temaDe = new Map(interpretado.clasificaciones.map((c) => [c.id, c.tema]));
    for (const a of desvios.alertas) {
      const deSusTemas = [...nuevos].filter((id) => a.temas.includes(temaDe.get(id) ?? ""));
      a.evidencia = [...new Set([...a.evidencia, ...deSusTemas])];
    }
    desvios.alertas = desvios.alertas.filter((a) => citaNuevo(a.evidencia));
  }
  console.log(`   ${desvios.alertas.length} alertas${incremental ? " con feedback nuevo" : ""}`);

  return {
    producto: config.nombre,
    fecha: new Date().toISOString(),
    modo: demo ? "demo" : "conectado",
    brief,
    kpisExistentes,
    alertasAbiertas,
    feedback,
    temas: interpretado.temas,
    clasificaciones,
    nuevos: interpretado.clasificaciones.map((c) => c.id),
    analitica,
    analista,
    desvios,
  };
}
