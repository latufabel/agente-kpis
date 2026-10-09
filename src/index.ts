// Punto de entrada. Mismo comando para la demo, la corrida manual y GitHub Actions.
//
//   npm run demo                                  → fixtures locales, no escribe en Jira/Notion
//   npm start -- --producto cobros-recurrentes    → lee Notion + Jira, solo reporte
//   npm start -- --producto cobros-recurrentes --publicar
//                                                 → además crea tickets en Jira y marca Notion

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { correr } from "./pipeline.ts";
import { escribirReporte } from "./salidas/reporte.ts";
import { publicar } from "./salidas/publicar.ts";
import { MODELO, modoLlm } from "./llm.ts";
import type { ConfigProducto } from "./tipos.ts";

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno (p. ej. secrets de GitHub Actions).
}

const { values } = parseArgs({
  options: {
    producto: { type: "string", default: "cobros-recurrentes" },
    demo: { type: "boolean", default: false },
    publicar: { type: "boolean", default: false },
  },
});

const config: ConfigProducto = JSON.parse(readFileSync(`config/productos/${values.producto}.json`, "utf8"));
if (values.demo && values.publicar) {
  console.error("--publicar no se puede usar con --demo (la demo nunca escribe en Jira ni Notion).");
  process.exit(1);
}

console.log(`Agente KPIs · ${config.nombre} · modelo ${MODELO} (${modoLlm() === "vivo" ? "en vivo" : "reproduciendo grabaciones"})`);

const resultado = await correr(config, { demo: values.demo });
if (resultado) {
  const archivo = escribirReporte(path.join("salida", config.id), resultado);
  console.log(`\n✔ Reporte: ${archivo}`);
  if (values.publicar) await publicar(config, resultado);
  else if (!values.demo) console.log("  (sin --publicar: no se escribió nada en Jira ni Notion)");
}
