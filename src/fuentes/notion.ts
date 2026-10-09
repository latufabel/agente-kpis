// Cliente mínimo de la API de Notion: lee el contexto del producto y la base de
// feedback, y escribe los campos "(agente)".

import type { Feedback } from "../tipos.ts";

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

const PROP = {
  sentimiento: "Sentimiento (agente)",
  tema: "Tema (agente)",
  procesado: "Procesado (agente)",
} as const;

async function notion<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Falta NOTION_TOKEN en .env");
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw new Error(`Notion ${metodo} ${ruta} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

const texto = (rich: any[] | undefined) => (rich ?? []).map((t) => t.plain_text).join("");

async function hijos(bloqueId: string): Promise<any[]> {
  const todos: any[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const r = await notion("GET", `/blocks/${bloqueId}/children${q}`);
    todos.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return todos;
}

async function bloquesAMarkdown(bloques: any[]): Promise<string[]> {
  const lineas: string[] = [];
  for (const b of bloques) {
    const d = b[b.type];
    switch (b.type) {
      case "heading_1": lineas.push(`# ${texto(d.rich_text)}`); break;
      case "heading_2": lineas.push(`## ${texto(d.rich_text)}`); break;
      case "heading_3": lineas.push(`### ${texto(d.rich_text)}`); break;
      case "paragraph": lineas.push(texto(d.rich_text)); break;
      case "bulleted_list_item": lineas.push(`- ${texto(d.rich_text)}`); break;
      case "numbered_list_item": lineas.push(`1. ${texto(d.rich_text)}`); break;
      case "quote":
      case "callout": lineas.push(`> ${texto(d.rich_text)}`); break;
      case "table": {
        const filas = await hijos(b.id);
        for (const f of filas) lineas.push(`| ${f.table_row.cells.map(texto).join(" | ")} |`);
        break;
      }
      default:
        if (d?.rich_text) lineas.push(texto(d.rich_text));
    }
    if (b.has_children && b.type !== "table" && b.type !== "child_database" && b.type !== "child_page") {
      lineas.push(...(await bloquesAMarkdown(await hijos(b.id))));
    }
  }
  return lineas;
}

export async function leerContextoNotion(paginaId: string): Promise<string> {
  const pagina = await notion("GET", `/pages/${paginaId}`);
  const titulo = Object.values<any>(pagina.properties).find((p) => p.type === "title");
  const lineas = await bloquesAMarkdown(await hijos(paginaId));
  return [`# ${texto(titulo?.title)}`, ...lineas].join("\n");
}

function filaAFeedback(p: any): Feedback {
  const props = p.properties;
  const sel = (n: string) => props[n]?.select?.name ?? "";
  const txt = (n: string) => texto(props[n]?.rich_text ?? props[n]?.title);
  const num = (n: string) => props[n]?.number ?? null;
  const uid = props["ID"]?.unique_id;
  const tema = txt(PROP.tema);
  const sentimiento = sel(PROP.sentimiento);
  const procesado = props[PROP.procesado]?.checkbox === true;
  return {
    id: uid ? `${uid.prefix ? uid.prefix + "-" : ""}${uid.number}` : p.id,
    fecha: props["Fecha"]?.date?.start?.slice(0, 10) ?? p.created_time.slice(0, 10),
    canal: sel("Canal"),
    tipoUsuario: sel("Tipo de usuario"),
    cliente: txt("Cliente"),
    emisor: txt("Emisor"),
    segmento: sel("Segmento"),
    pagadoresEmisor: num("Pagadores del emisor"),
    nps: num("NPS"),
    resumen: txt("Resumen"),
    texto: txt("Texto"),
    notionPageId: p.id,
    clasificacionPrevia: procesado && tema ? { tema, sentimiento } : undefined,
  };
}

/** Todo el feedback de la base (procesado y sin procesar), en orden cronológico. */
export async function leerFeedbackNotion(dataSourceId: string): Promise<Feedback[]> {
  const filas: any[] = [];
  let cursor: string | undefined;
  do {
    const r = await notion("POST", `/data_sources/${dataSourceId}/query`, {
      page_size: 100,
      start_cursor: cursor,
      sorts: [{ property: "Fecha", direction: "ascending" }],
    });
    filas.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return filas.map(filaAFeedback);
}

export async function marcarFeedbackProcesado(pageId: string, tema: string, sentimiento: string): Promise<void> {
  await notion("PATCH", `/pages/${pageId}`, {
    properties: {
      [PROP.tema]: { rich_text: [{ type: "text", text: { content: tema } }] },
      [PROP.sentimiento]: { select: { name: sentimiento } },
      [PROP.procesado]: { checkbox: true },
    },
  });
}
