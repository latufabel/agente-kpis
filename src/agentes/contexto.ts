// Agente 1 — Contexto: convierte la página de producto en un brief estructurado
// (objetivos, usuarios, limitaciones y versiones con fecha) que usan los demás agentes.

import { z } from "zod";
import { llamarAgente } from "../llm.ts";

export const BriefProducto = z.object({
  nombre: z.string(),
  problema: z.string().describe("El problema que resuelve el producto, en 2-3 oraciones"),
  objetivos: z.array(z.string()),
  usuarios: z.array(z.object({ tipo: z.string(), descripcion: z.string() })),
  flujo: z.string().describe("Cómo funciona el producto, resumido"),
  limitaciones: z.array(z.string()),
  versiones: z.array(
    z.object({
      version: z.string(),
      fecha: z.string().describe("YYYY-MM-DD"),
      cambios: z.string(),
    }),
  ),
});
export type BriefProducto = z.infer<typeof BriefProducto>;

const SISTEMA = `Sos el agente de Contexto de un sistema que analiza feedback de producto.
Leés la documentación de un producto y devolvés un brief fiel y compacto.
No inventes información: si algo no está en la documentación, dejalo afuera.
Incluí TODAS las versiones del historial con su fecha exacta (YYYY-MM-DD) y sus cambios tal como están descriptos.`;

export async function agenteContexto(documentacion: string): Promise<BriefProducto> {
  return llamarAgente({
    agente: "contexto",
    sistema: SISTEMA,
    entrada: `<documentacion_producto>\n${documentacion}\n</documentacion_producto>`,
    esquema: BriefProducto,
    esfuerzo: "low",
  });
}
