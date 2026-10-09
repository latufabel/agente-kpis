// Prepara una demo o una prueba: vacía los campos "(agente)" de la base de
// feedback en Notion para que el agente vuelva a procesar esos registros.
// Solo toca Tema (agente), Sentimiento (agente) y Procesado (agente).
//
//   npm run reiniciar-notion -- --ultimos 20 --si   → los 20 feedbacks más recientes
//   npm run reiniciar-notion -- --si                → todos

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { ConfigProducto } from "../src/tipos.ts";

try {
  process.loadEnvFile();
} catch {}

const { values } = parseArgs({
  options: {
    producto: { type: "string", default: "cobros-recurrentes" },
    ultimos: { type: "string" },
    si: { type: "boolean", default: false },
  },
});

const config: ConfigProducto = JSON.parse(readFileSync(`config/productos/${values.producto}.json`, "utf8"));
const h = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  "Notion-Version": "2025-09-03",
  "Content-Type": "application/json",
};
if (!process.env.NOTION_TOKEN) {
  console.error("Falta NOTION_TOKEN en .env");
  process.exit(1);
}

// Feedback ya procesado, del más reciente al más viejo.
const procesados: { id: string; fecha: string }[] = [];
let cursor: string | undefined;
do {
  const r = await fetch(`https://api.notion.com/v1/data_sources/${config.notion.dataSourceFeedback}/query`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      page_size: 100,
      start_cursor: cursor,
      filter: { property: "Procesado (agente)", checkbox: { equals: true } },
      sorts: [{ property: "Fecha", direction: "descending" }],
    }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Notion ${r.status}: ${j.message}`);
  procesados.push(...j.results.map((p: any) => ({ id: p.id, fecha: p.properties["Fecha"]?.date?.start ?? "" })));
  cursor = j.has_more ? j.next_cursor : undefined;
} while (cursor);

const cantidad = values.ultimos ? Math.min(Number(values.ultimos), procesados.length) : procesados.length;
const elegidos = procesados.slice(0, cantidad);
console.log(`${config.nombre}: ${procesados.length} feedbacks procesados; se reinician ${elegidos.length}${elegidos.length ? ` (desde ${elegidos[elegidos.length - 1].fecha})` : ""}.`);

if (!values.si) {
  console.log("Para confirmar, agregá --si.");
  process.exit(0);
}

for (const [i, p] of elegidos.entries()) {
  const r = await fetch(`https://api.notion.com/v1/pages/${p.id}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({
      properties: {
        "Tema (agente)": { rich_text: [] },
        "Sentimiento (agente)": { select: null },
        "Procesado (agente)": { checkbox: false },
      },
    }),
  });
  if (!r.ok) throw new Error(`Notion ${r.status} al reiniciar ${p.id}`);
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${elegidos.length}`);
}
console.log(`✔ Listo: ${elegidos.length} feedbacks quedaron sin procesar.`);
