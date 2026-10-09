// Cliente de Claude compartido por todos los agentes.
//
// Cada agente es una llamada con salida estructurada (Zod). Las respuestas se
// graban en data/grabaciones/ para que la demo funcione sin API key: si no hay
// ANTHROPIC_API_KEY, se reproducen las grabaciones.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";

export const MODELO = process.env.AGENTE_MODELO ?? "claude-opus-5-5";
const DIR_GRABACIONES = "data/grabaciones";

type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export function modoLlm(): "vivo" | "reproducir" {
  if (process.env.AGENTE_LLM === "reproducir") return "reproducir";
  return process.env.ANTHROPIC_API_KEY ? "vivo" : "reproducir";
}

let cliente: Anthropic | undefined;

export interface LlamadaAgente<S extends z.ZodType> {
  agente: string;
  sistema: string;
  entrada: string;
  esquema: S;
  esfuerzo?: Esfuerzo;
  maxTokens?: number;
}

export async function llamarAgente<S extends z.ZodType>(llamada: LlamadaAgente<S>): Promise<z.infer<S>> {
  const { agente, sistema, entrada, esquema, esfuerzo = "medium", maxTokens = 20000 } = llamada;
  const huella = createHash("sha256")
    .update(JSON.stringify({ agente, MODELO, sistema, entrada, esfuerzo }))
    .digest("hex")
    .slice(0, 16);
  const archivo = path.join(DIR_GRABACIONES, `${agente}-${huella}.json`);

  if (modoLlm() === "reproducir") {
    if (!existsSync(archivo)) {
      throw new Error(
        `No hay grabación para el agente "${agente}" (${archivo}). ` +
          "Configurá ANTHROPIC_API_KEY para correrlo en vivo, o usá los datos de demo sin modificar.",
      );
    }
    const grabado = JSON.parse(readFileSync(archivo, "utf8"));
    return esquema.parse(grabado.salida);
  }

  cliente ??= new Anthropic();
  const inicio = Date.now();
  const respuesta = await cliente.beta.messages.parse({
    model: MODELO,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: esfuerzo, format: betaZodOutputFormat(esquema) },
    system: sistema,
    messages: [{ role: "user", content: entrada }],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El agente "${agente}" fue rechazado por el modelo (${respuesta.stop_details?.category ?? "sin categoría"}).`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(`El agente "${agente}" se quedó sin tokens de salida (max_tokens=${maxTokens}).`);
  }
  const salida = respuesta.parsed_output;
  if (salida == null) throw new Error(`El agente "${agente}" no devolvió una salida válida.`);

  mkdirSync(DIR_GRABACIONES, { recursive: true });
  writeFileSync(
    archivo,
    JSON.stringify(
      {
        agente,
        modelo: respuesta.model,
        esfuerzo,
        grabado: new Date().toISOString(),
        duracionMs: Date.now() - inicio,
        uso: { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens },
        salida,
      },
      null,
      2,
    ) + "\n",
  );
  return salida;
}
