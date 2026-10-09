// Cliente LLM compartido por todos los agentes. Soporta Claude (Anthropic) y
// Gemini (Google); se elige con AGENTE_PROVEEDOR o, si no está, según qué API
// key haya en el entorno.
//
// Cada agente es una llamada con salida estructurada (esquema Zod). Las
// respuestas se graban en data/grabaciones/ para que la demo funcione sin API
// key: si no hay key, se reproducen las grabaciones.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const DIR_GRABACIONES = "data/grabaciones";

type Proveedor = "anthropic" | "gemini";
type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.5-flash",
};
const API_KEY: Record<Proveedor, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

// Se leen en tiempo de ejecución (no al importar) porque .env se carga en index.ts.
export function proveedor(): Proveedor {
  const elegido = process.env.AGENTE_PROVEEDOR?.toLowerCase();
  if (elegido === "anthropic" || elegido === "gemini") return elegido;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

export function modelo(): string {
  return process.env.AGENTE_MODELO || MODELO_POR_DEFECTO[proveedor()];
}

export function modoLlm(): "vivo" | "reproducir" {
  if (process.env.AGENTE_LLM === "reproducir") return "reproducir";
  return process.env[API_KEY[proveedor()]] ? "vivo" : "reproducir";
}

export interface LlamadaAgente<S extends z.ZodType> {
  agente: string;
  sistema: string;
  entrada: string;
  esquema: S;
  esfuerzo?: Esfuerzo;
  maxTokens?: number;
}

interface Respuesta {
  salida: unknown;
  modelo: string;
  uso: { entrada: number; salida: number };
}

export async function llamarAgente<S extends z.ZodType>(llamada: LlamadaAgente<S>): Promise<z.infer<S>> {
  const { agente, sistema, entrada, esquema, esfuerzo = "medium" } = llamada;
  const prov = proveedor();
  const mod = modelo();
  const huella = createHash("sha256")
    .update(JSON.stringify({ agente, prov, mod, sistema, entrada, esfuerzo }))
    .digest("hex")
    .slice(0, 16);
  const archivo = path.join(DIR_GRABACIONES, `${agente}-${huella}.json`);

  if (modoLlm() === "reproducir") {
    const grabacion = existsSync(archivo) ? archivo : ultimaGrabacion(agente);
    if (!grabacion) {
      throw new Error(
        `No hay grabación para el agente "${agente}" en ${DIR_GRABACIONES}/. ` +
          `Configurá ${API_KEY[prov]} en .env para correrlo en vivo.`,
      );
    }
    return esquema.parse(JSON.parse(readFileSync(grabacion, "utf8")).salida);
  }

  const inicio = Date.now();
  const r = await conReintentos(agente, () =>
    prov === "gemini" ? llamarGemini(mod, llamada) : llamarClaude(mod, llamada),
  );
  const salida = esquema.parse(r.salida);

  mkdirSync(DIR_GRABACIONES, { recursive: true });
  writeFileSync(
    archivo,
    JSON.stringify(
      {
        agente,
        proveedor: prov,
        modelo: r.modelo,
        esfuerzo,
        grabado: new Date().toISOString(),
        duracionMs: Date.now() - inicio,
        uso: r.uso,
        salida,
      },
      null,
      2,
    ) + "\n",
  );
  return salida;
}

/**
 * En modo demo, si la entrada cambió (p. ej. se editó un prompt) y no hay una
 * grabación exacta, se usa la más reciente de ese agente.
 */
function ultimaGrabacion(agente: string): string | null {
  if (!existsSync(DIR_GRABACIONES)) return null;
  const candidatas = readdirSync(DIR_GRABACIONES)
    .filter((f) => f.startsWith(`${agente}-`))
    .map((f) => path.join(DIR_GRABACIONES, f))
    .map((f) => ({ f, fecha: JSON.parse(readFileSync(f, "utf8")).grabado as string }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!candidatas.length) return null;
  console.warn(`   (reproduciendo la grabación más reciente de "${agente}")`);
  return candidatas[0].f;
}

/** Reintenta ante límites de uso (429) y sobrecarga (5xx), comunes en el plan gratuito. */
async function conReintentos<T>(agente: string, fn: () => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      const reintentable = status === 429 || (typeof status === "number" && status >= 500);
      if (!reintentable || intento >= 4) throw e;
      const espera = 15_000 * intento;
      console.warn(`   ⏳ ${agente}: el proveedor respondió ${status}; reintento en ${espera / 1000}s`);
      await new Promise((ok) => setTimeout(ok, espera));
    }
  }
}

// --- Claude (Anthropic) ---

let claude: Anthropic | undefined;

async function llamarClaude<S extends z.ZodType>(mod: string, ll: LlamadaAgente<S>): Promise<Respuesta> {
  claude ??= new Anthropic();
  const maxTokens = ll.maxTokens ?? 20000;
  const r = await claude.beta.messages.parse({
    model: mod,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: ll.esfuerzo ?? "medium", format: betaZodOutputFormat(ll.esquema) },
    system: ll.sistema,
    messages: [{ role: "user", content: ll.entrada }],
  });
  if (r.stop_reason === "refusal") {
    throw new Error(`El agente "${ll.agente}" fue rechazado por el modelo (${r.stop_details?.category ?? "sin categoría"}).`);
  }
  if (r.stop_reason === "max_tokens") {
    throw new Error(`El agente "${ll.agente}" se quedó sin tokens de salida (max_tokens=${maxTokens}).`);
  }
  if (r.parsed_output == null) throw new Error(`El agente "${ll.agente}" no devolvió una salida válida.`);
  return {
    salida: r.parsed_output,
    modelo: r.model,
    uso: { entrada: r.usage.input_tokens, salida: r.usage.output_tokens },
  };
}

// --- Gemini (Google) ---

/** Quita los límites de "entero seguro" que agrega Zod: Gemini no los necesita y puede rechazarlos. */
function limpiarEsquema(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(limpiarEsquema);
  if (!nodo || typeof nodo !== "object") return nodo;
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(nodo)) {
    if ((k === "minimum" || k === "maximum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER) continue;
    r[k] = limpiarEsquema(v);
  }
  return r;
}

let gemini: GoogleGenAI | undefined;

async function llamarGemini<S extends z.ZodType>(mod: string, ll: LlamadaAgente<S>): Promise<Respuesta> {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const { $schema, ...esquemaJson } = limpiarEsquema(z.toJSONSchema(ll.esquema)) as Record<string, unknown>;
  const r = await gemini.models.generateContent({
    model: mod,
    contents: ll.entrada,
    config: {
      systemInstruction: ll.sistema,
      responseMimeType: "application/json",
      responseJsonSchema: esquemaJson,
      maxOutputTokens: ll.maxTokens ?? 60000,
    },
  });
  const fin = r.candidates?.[0]?.finishReason;
  if (fin === "MAX_TOKENS") throw new Error(`El agente "${ll.agente}" se quedó sin tokens de salida.`);
  if (!r.text) throw new Error(`El agente "${ll.agente}" no devolvió texto (finishReason=${fin ?? "?"}).`);
  return {
    salida: JSON.parse(r.text),
    modelo: r.modelVersion ?? mod,
    uso: { entrada: r.usageMetadata?.promptTokenCount ?? 0, salida: r.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}
