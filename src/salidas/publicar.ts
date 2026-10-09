// Publica el resultado: KPIs y alertas en Jira (estado "Propuesto", asignados
// al PM) y los campos "(agente)" en Notion. Solo corre con --publicar.

import { adf, comentar, crearTicket, ETIQUETA_ALERTA, ETIQUETA_KPI, ETIQUETA_MEJORA, resumenKpi } from "../fuentes/jira.ts";
import { marcarFeedbackProcesado } from "../fuentes/notion.ts";
import type { ResultadoCorrida } from "../pipeline.ts";
import type { ConfigProducto } from "../tipos.ts";

/** El modelo a veces ya incluye "[P1][CRITICA]" o "[Mejora P1]" en el título: no repetirlo. */
const sinPrefijo = (titulo: string) => titulo.replace(/^(\s*\[[^\]]*\]\s*)+/, "");

const normalizar =(s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export async function publicar(config: ConfigProducto, r: ResultadoCorrida): Promise<void> {
  const claveKpi = new Map<string, string>();
  for (const k of r.kpisExistentes.filter((x) => !x.descartado)) {
    claveKpi.set(normalizar(k.nombre), k.clave);
    claveKpi.set(normalizar(k.clave), k.clave);
  }

  console.log("\n▶ Publicando en Jira");
  for (const k of r.analista.kpis_nuevos) {
    const clave = await crearTicket(config, {
      tipo: config.jira.tipoKpi,
      resumen: resumenKpi(k.nombre),
      etiquetas: [ETIQUETA_KPI, k.ya_propuesto ? "ya-propuesto" : `prioridad-${k.prioridad}`],
      descripcion: adf.doc(
        adf.parrafo("KPI propuesto por Agente KPIs. Aprobalo moviéndolo a «Aprobado», pasalo a «En evaluación/reformulación» o descartalo."),
        k.ya_propuesto
          ? adf.parrafo(
              `Ya se había propuesto y se descartó (${k.ya_propuesto}). La evidencia actual lo vuelve a justificar; queda con baja prioridad para que lo reconsideres.`,
            )
          : null,
        adf.campo("Definición", k.definicion),
        adf.campo("Fórmula", k.formula),
        adf.campo("Fuente del dato", k.fuente_datos),
        adf.campo("Baseline", k.baseline),
        adf.campo("Objetivo", k.objetivo),
        adf.campo("Por qué importa", k.por_que_importa),
        adf.campo("Temas", k.temas.join(" · ")),
        adf.campo("Evidencia", k.evidencia.join(", ")),
      ),
    });
    claveKpi.set(normalizar(k.nombre), clave);
    console.log(`   + ${clave}  KPI: ${k.nombre}`);
  }

  for (const e of r.analista.evidencia_kpis_existentes) {
    await comentar(
      e.clave,
      adf.doc(
        adf.titulo("Nueva evidencia (Agente KPIs)"),
        adf.parrafo(e.resumen),
        adf.campo("Temas", e.temas.join(" · ")),
        adf.campo("Evidencia", e.evidencia.join(", ")),
      ),
    );
    console.log(`   ~ ${e.clave}  +${e.evidencia.length} evidencias`);
  }

  for (const a of r.desvios.alertas) {
    const cuerpo = [
      adf.campo("Severidad", `${a.severidad} · prioridad ${a.prioridad}`),
      adf.campo("Tipo / forma", `${a.tipo} · ${a.forma}`),
      a.version_relacionada ? adf.campo("Versión relacionada", a.version_relacionada) : null,
      adf.parrafo(a.descripcion),
      adf.campo("Hipótesis de causa", a.hipotesis_causa),
      adf.campo("KPIs que mueve", a.kpis_relacionados.join(" · ")),
      adf.campo("Evidencia", a.evidencia.join(", ")),
      a.clientes_en_riesgo.length ? adf.titulo("Clientes en riesgo", 4) : null,
      adf.lista(a.clientes_en_riesgo.map((c) => `${c.cliente}: ${c.motivo}`)),
      a.advertencias.length ? adf.titulo("Advertencias", 4) : null,
      adf.lista(a.advertencias),
      adf.titulo("Próximos pasos", 4),
      adf.lista(a.proximos_pasos),
    ];
    if (a.alerta_existente) {
      await comentar(a.alerta_existente, adf.doc(adf.titulo("Actualización (Agente KPIs)"), ...cuerpo));
      console.log(`   ~ ${a.alerta_existente}  alerta actualizada`);
      continue;
    }
    const padre = a.kpis_relacionados.map((n) => claveKpi.get(normalizar(n))).find(Boolean);
    const ticket = {
      tipo: config.jira.tipoAlerta,
      resumen: `[P${a.prioridad}][${a.severidad.toUpperCase()}] ${sinPrefijo(a.titulo)}`,
      etiquetas: [ETIQUETA_ALERTA, `severidad-${a.severidad}`],
      descripcion: adf.doc(adf.parrafo("Alerta de desvío detectada por Agente KPIs."), ...cuerpo),
    };
    let clave: string;
    try {
      clave = await crearTicket(config, { ...ticket, padre });
    } catch (e) {
      if (!padre) throw e;
      console.warn(`   ⚠ No se pudo colgar de ${padre}; se crea sin padre`);
      clave = await crearTicket(config, ticket);
    }
    console.log(`   + ${clave}  ${ticket.resumen}${padre ? `  (hijo de ${padre})` : ""}`);
  }

  for (const m of r.mejoras?.mejoras ?? []) {
    const padre = claveKpi.get(normalizar(m.kpi));
    const ticket = {
      tipo: config.jira.tipoAlerta,
      resumen: `[Mejora P${m.prioridad}] ${sinPrefijo(m.titulo)}`,
      etiquetas: [ETIQUETA_MEJORA, `esfuerzo-${m.esfuerzo}`],
      descripcion: adf.doc(
        adf.parrafo("Mejora sugerida por Agente KPIs. Aprobala moviéndola a «Aprobado» o descartala."),
        adf.parrafo(m.historia),
        adf.parrafo(m.descripcion),
        adf.campo("KPI que mueve", m.kpi),
        adf.campo("Impacto esperado", m.impacto_esperado),
        adf.campo("Esfuerzo", m.esfuerzo),
        adf.campo("Evidencia", m.evidencia.join(", ")),
        adf.titulo("Criterios de aceptación", 4),
        adf.lista(m.criterios_aceptacion),
      ),
    };
    let clave: string;
    try {
      clave = await crearTicket(config, { ...ticket, padre });
    } catch (e) {
      if (!padre) throw e;
      clave = await crearTicket(config, ticket);
    }
    console.log(`   + ${clave}  ${ticket.resumen}${padre ? `  (hija de ${padre})` : ""}`);
  }

  console.log("\n▶ Completando campos (agente) en Notion");
  const porId = new Map(r.feedback.map((f) => [f.id, f]));
  const claseDe = new Map(r.clasificaciones.map((c) => [c.id, c]));
  let n = 0;
  for (const id of r.nuevos) {
    const f = porId.get(id);
    const c = claseDe.get(id);
    if (!f?.notionPageId || !c) continue;
    await marcarFeedbackProcesado(f.notionPageId, c.tema, c.sentimiento);
    n++;
  }
  console.log(`   ${n} feedbacks marcados como procesados`);
}
