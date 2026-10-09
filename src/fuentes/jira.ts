// Cliente mínimo de Jira Cloud (REST v3): lee KPIs y alertas abiertas del
// producto, crea tickets en estado "Propuesto" asignados al PM y comenta evidencia.
//
// Convención: un KPI es un ticket del tipo `tipoKpi` (Epic) con las etiquetas
// `kpi` + la etiqueta del producto. Las alertas son tickets `tipoAlerta` con
// `alerta-desvio`, hijos del KPI que mueven.

import type { AlertaAbierta, ConfigProducto, KpiExistente } from "../tipos.ts";

export const ETIQUETA_KPI = "kpi";
export const ETIQUETA_ALERTA = "alerta-desvio";
export const ETIQUETA_AGENTE = "agente-kpis";
const PREFIJO_KPI = "KPI: ";

async function jira<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error("Faltan JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN en .env");
  }
  const r = await fetch(`${JIRA_BASE_URL.replace(/\/$/, "")}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw new Error(`Jira ${metodo} ${ruta} → ${r.status}: ${await r.text()}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

/** Texto plano de un documento ADF. */
function adfATexto(nodo: any): string {
  if (!nodo) return "";
  if (nodo.type === "text") return nodo.text ?? "";
  const hijos = (nodo.content ?? []).map(adfATexto).join(nodo.type === "doc" ? "\n" : "");
  return ["paragraph", "heading", "listItem"].includes(nodo.type) ? hijos + "\n" : hijos;
}

async function buscar(jql: string): Promise<any[]> {
  const issues: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const r = await jira("POST", "/rest/api/3/search/jql", {
      jql,
      fields: ["summary", "description", "status"],
      maxResults: 100,
      nextPageToken,
    });
    issues.push(...r.issues);
    nextPageToken = r.isLast ? undefined : r.nextPageToken;
  } while (nextPageToken);
  return issues;
}

/** Todos los KPIs del producto, incluidos los descartados (los negocios cambian: pueden volver). */
export async function leerKpisJira(config: ConfigProducto): Promise<KpiExistente[]> {
  const { proyecto, etiquetaProducto, estadoDescartado } = config.jira;
  const issues = await buscar(
    `project = "${proyecto}" AND labels = "${ETIQUETA_KPI}" AND labels = "${etiquetaProducto}" ORDER BY key`,
  );
  return issues.map((i) => ({
    clave: i.key,
    nombre: i.fields.summary.replace(PREFIJO_KPI, ""),
    definicion: adfATexto(i.fields.description).trim().slice(0, 1500),
    estado: i.fields.status.name,
    descartado: i.fields.status.name === estadoDescartado,
  }));
}

export async function leerAlertasAbiertas(config: ConfigProducto): Promise<AlertaAbierta[]> {
  const { proyecto, etiquetaProducto } = config.jira;
  const issues = await buscar(
    `project = "${proyecto}" AND labels = "${ETIQUETA_ALERTA}" AND labels = "${etiquetaProducto}" AND statusCategory != Done ORDER BY key`,
  );
  return issues.map((i) => ({ clave: i.key, titulo: i.fields.summary }));
}

export interface NuevoTicket {
  tipo: string;
  resumen: string;
  descripcion: any; // documento ADF
  etiquetas: string[];
  padre?: string;
  /** Estado destino; por defecto, el estado "Propuesto" del producto. */
  estado?: string;
}

export async function crearTicket(config: ConfigProducto, t: NuevoTicket): Promise<string> {
  const creado = await jira<{ key: string }>("POST", "/rest/api/3/issue", {
    fields: {
      project: { key: config.jira.proyecto },
      issuetype: { name: t.tipo },
      summary: t.resumen.slice(0, 250),
      description: t.descripcion,
      labels: [...new Set([ETIQUETA_AGENTE, config.jira.etiquetaProducto, ...t.etiquetas])],
      assignee: { accountId: config.jira.pmAccountId },
      ...(t.padre ? { parent: { key: t.padre } } : {}),
    },
  });
  await moverAEstado(creado.key, t.estado ?? config.jira.estadoPropuesto);
  return creado.key;
}

async function moverAEstado(clave: string, estado: string): Promise<void> {
  const issue = await jira("GET", `/rest/api/3/issue/${clave}?fields=status`);
  if (issue.fields.status.name === estado) return;
  const { transitions } = await jira("GET", `/rest/api/3/issue/${clave}/transitions`);
  const t = transitions.find((x: any) => x.to?.name === estado);
  if (!t) {
    console.warn(`  ⚠ ${clave}: no hay transición a "${estado}" (quedó en "${issue.fields.status.name}")`);
    return;
  }
  await jira("POST", `/rest/api/3/issue/${clave}/transitions`, { transition: { id: t.id } });
}

export async function comentar(clave: string, cuerpo: any): Promise<void> {
  await jira("POST", `/rest/api/3/issue/${clave}/comment`, { body: cuerpo });
}

// --- Helpers ADF (Atlassian Document Format) ---

export type NodoAdf = Record<string, unknown>;
const txt = (s: string, negrita = false): NodoAdf =>
  negrita ? { type: "text", text: s, marks: [{ type: "strong" }] } : { type: "text", text: s };

export const adf = {
  doc: (...contenido: (NodoAdf | null)[]): NodoAdf => ({
    type: "doc",
    version: 1,
    content: contenido.filter((n): n is NodoAdf => n !== null),
  }),
  titulo: (s: string, nivel = 3): NodoAdf => ({ type: "heading", attrs: { level: nivel }, content: [txt(s)] }),
  parrafo: (s: string): NodoAdf => ({ type: "paragraph", content: s ? [txt(s)] : [] }),
  campo: (etiqueta: string, valor: string): NodoAdf => ({
    type: "paragraph",
    content: [txt(`${etiqueta}: `, true), txt(valor)],
  }),
  lista: (items: string[]): NodoAdf | null =>
    items.length
      ? {
          type: "bulletList",
          content: items.map((s) => ({ type: "listItem", content: [{ type: "paragraph", content: [txt(s)] }] })),
        }
      : null,
};

export const resumenKpi = (nombre: string) => `${PREFIJO_KPI}${nombre}`;
