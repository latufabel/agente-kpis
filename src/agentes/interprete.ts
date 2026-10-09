// Agente 2 — Intérprete: lee cada feedback y le asigna sentimiento y tema
// (el problema o necesidad de fondo). Mantiene un catálogo de temas estable
// entre corridas: si un tema ya existe, lo reutiliza en vez de crear otro.

import { z } from "zod";
import { llamarAgente } from "../llm.ts";
import type { Feedback } from "../tipos.ts";
import type { BriefProducto } from "./contexto.ts";

export const Sentimiento = z.enum(["Positivo", "Neutral", "Negativo"]);
export type Sentimiento = z.infer<typeof Sentimiento>;

const SalidaInterprete = z.object({
  temas: z
    .array(z.object({ tema: z.string(), descripcion: z.string() }))
    .describe("Catálogo completo de temas: los existentes que se usaron más los nuevos"),
  clasificaciones: z.array(
    z.object({
      id: z.string().describe("ID del feedback, ej. FB-12"),
      sentimiento: Sentimiento,
      tema: z.string().describe("Nombre exacto de un tema del catálogo"),
    }),
  ),
});

export interface Tema {
  tema: string;
  descripcion: string;
}
export interface Clasificacion {
  id: string;
  sentimiento: Sentimiento;
  tema: string;
}

const SISTEMA = `Sos el agente Intérprete de un sistema que convierte feedback de producto en KPIs.
Para cada feedback decidís el sentimiento y el TEMA.

Cómo definir temas:
- Un tema es el problema o la necesidad DE FONDO (la causa), no el síntoma. Dos quejas que se parecen en la superficie pero tienen causas distintas van en temas distintos. Usá el contexto del producto (cómo funciona, limitaciones conocidas, historial de versiones) para distinguir causas.
- Cuando el usuario pide una solución (una funcionalidad, un canal o una integración nueva), preguntate qué problema le resolvería y nombrá el tema por ese problema, no por la solución pedida.
- Agrupá: un tema tiene que poder juntar varios feedbacks. Evitá temas de un solo caso salvo que de verdad no encaje en ningún otro.
- No partas un mismo problema en variantes (por dispositivo, por segmento, "general" vs. "específico", distintas formas de pedir lo mismo): es un solo tema. Como referencia, 100 feedbacks suelen agruparse en 6 a 15 temas.
- Si un problema aparece de golpe después de una versión, no lo mezcles con quejas anteriores parecidas que tienen otra causa.
- Los feedbacks puntuales que no describen un problema del producto (consultas de uso, saludos, elogios generales, pedidos aislados) van a temas genéricos como "Consulta de uso" o "Elogio general". No los fuerces dentro de un tema de problema.
- Si te paso temas existentes, reutilizá el nombre EXACTO cuando corresponda. Creá un tema nuevo solo si ninguno encaja.
- Nombres de tema: en español, cortos (máximo 8 palabras), específicos.

Sentimiento: Positivo, Neutral o Negativo según el tono del feedback hacia el producto.

Clasificá TODOS los feedbacks recibidos, cada uno exactamente una vez.`;

function formatearFeedback(f: Feedback): string {
  const pagadores = f.pagadoresEmisor != null ? `, ${f.pagadoresEmisor} pagadores` : "";
  const nps = f.nps != null ? ` | NPS: ${f.nps}` : "";
  return `[${f.id}] ${f.fecha} | ${f.canal} | ${f.tipoUsuario} ${f.cliente} (emisor ${f.emisor}, ${f.segmento}${pagadores})${nps}\nResumen: ${f.resumen}\nTexto: ${f.texto}`;
}

export function formatearBrief(brief: BriefProducto): string {
  return JSON.stringify(brief, null, 2);
}

const TAMANO_LOTE = 150;

export async function agenteInterprete(
  brief: BriefProducto,
  feedback: Feedback[],
  temasExistentes: Tema[],
): Promise<{ temas: Tema[]; clasificaciones: Clasificacion[] }> {
  let temas = [...temasExistentes];
  const clasificaciones: Clasificacion[] = [];

  for (let i = 0; i < feedback.length; i += TAMANO_LOTE) {
    const lote = feedback.slice(i, i + TAMANO_LOTE);
    const entrada = [
      `<contexto_producto>\n${formatearBrief(brief)}\n</contexto_producto>`,
      `<temas_existentes>\n${temas.length ? JSON.stringify(temas, null, 2) : "(ninguno todavía)"}\n</temas_existentes>`,
      `<feedback>\n${lote.map(formatearFeedback).join("\n\n")}\n</feedback>`,
    ].join("\n\n");

    const salida = await llamarAgente({
      agente: "interprete",
      sistema: SISTEMA,
      entrada,
      esquema: SalidaInterprete,
      esfuerzo: "medium",
    });

    const porNombre = new Map(temas.map((t) => [t.tema, t]));
    for (const t of salida.temas) porNombre.set(t.tema, t);
    temas = [...porNombre.values()];

    const idsLote = new Set(lote.map((f) => f.id));
    const vistos = new Set<string>();
    for (const c of salida.clasificaciones) {
      if (!idsLote.has(c.id) || vistos.has(c.id)) continue;
      vistos.add(c.id);
      if (!porNombre.has(c.tema)) {
        porNombre.set(c.tema, { tema: c.tema, descripcion: "" });
        temas.push({ tema: c.tema, descripcion: "" });
      }
      clasificaciones.push(c);
    }
    const faltantes = lote.filter((f) => !vistos.has(f.id));
    if (faltantes.length) {
      console.warn(`  ⚠ El intérprete no clasificó ${faltantes.length} feedback(s): ${faltantes.map((f) => f.id).join(", ")}`);
    }
  }

  return { temas, clasificaciones };
}
