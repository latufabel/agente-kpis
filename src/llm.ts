// Cliente LLM compartido por todos los agentes. Soporta Claude (Anthropic),
// Gemini (Google) y OpenRouter (modelos gratuitos y de terceros); se elige con AGENTE_PROVEEDOR o, si no está, según qué API
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

// Demo y corridas conectadas graban en carpetas separadas: la demo se versiona,
// las conectadas no (ver .gitignore).
let dirGrabaciones = "data/grabaciones/demo";
export function usarGrabaciones(modo: "demo" | "conectado"): void {
  dirGrabaciones = `data/grabaciones/${modo}`;
}

type Proveedor = "anthropic" | "gemini" | "openrouter";
type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.6-flash",
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
};
// Si el modelo elegido se queda sin cuota o sigue saturado, se prueba el siguiente.
// Cada modelo gratuito tiene su propia cuota diaria. Se puede pisar con
// AGENTE_MODELOS_RESPALDO (lista separada por comas).
const RESPALDO_POR_DEFECTO: Record<Proveedor, string[]> = {
  anthropic: ["claude-sonnet-5-5"],
  gemini: ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
  openrouter: ["dots-studio/dots-3-note-preview:free", "nvidia/nemotron-3-super-120b-a12b:free"],
};

function modelosAProbar(principal: string): string[] {
  const respaldo = process.env.AGENTE_MODELOS_RESPALDO
    ? process.env.AGENTE_MODELOS_RESPALDO.split(",").map((m) => m.trim()).filter(Boolean)
    : RESPALDO_POR_DEFECTO[proveedor()];
  return [principal, ...respaldo.filter((m) => m !== principal)];
}

const API_KEY: Record<Proveedor, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

// Se leen en tiempo de ejecución (no al importar) porque .env se carga en index.ts.
export function proveedor(): Proveedor {
  const elegido = process.env.AGENTE_PROVEEDOR?.toLowerCase();
  if (elegido === "anthropic" || elegido === "gemini" || elegido === "openrouter") return elegido;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "anthropic";
}

/** Modelo para un agente: AGENTE_MODELO_<AGENTE> (p. ej. AGENTE_MODELO_ANALISTA) > AGENTE_MODELO > por defecto. */
export function modelo(agente?: string): string {
  const propio = agente ? process.env[`AGENTE_MODELO_${agente.toUpperCase()}`] : undefined;
  return propio || process.env.AGENTE_MODELO || MODELO_POR_DEFECTO[proveedor()];
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
  const mod = modelo(agente);
  const huella = createHash("sha256")
    // Solo depende de la entrada: una grabación se reproduce aunque cambie el proveedor.
    .update(JSON.stringify({ agente, sistema, entrada, esfuerzo }))
    .digest("hex")
    .slice(0, 16);
  const archivo = path.join(dirGrabaciones, `${agente}-${huella}.json`);

  // Misma entrada y mismo modelo que una corrida anterior → misma respuesta. Así lo
  // que se revisa en una corrida sin --publicar es exactamente lo que se publica después.
  if (modoLlm() === "vivo" && existsSync(archivo) && process.env.AGENTE_CACHE !== "no") {
    const previa = JSON.parse(readFileSync(archivo, "utf8"));
    if (previa.proveedor === prov && previa.modeloPedido === mod) return esquema.parse(previa.salida);
  }

  if (modoLlm() === "reproducir") {
    const grabacion = existsSync(archivo) ? archivo : ultimaGrabacion(agente);
    if (!grabacion) {
      throw new Error(
        `No hay grabación para el agente "${agente}" en ${dirGrabaciones}/. ` +
          `Configurá ${API_KEY[prov]} en .env para correrlo en vivo.`,
      );
    }
    return esquema.parse(JSON.parse(readFileSync(grabacion, "utf8")).salida);
  }

  const inicio = Date.now();
  const llamar = (m: string) =>
    prov === "gemini" ? llamarGemini(m, llamada) : prov === "openrouter" ? llamarOpenRouter(m, llamada) : llamarClaude(m, llamada);
  let r: Respuesta | undefined;
  const candidatos = modelosAProbar(mod);
  for (const [i, m] of candidatos.entries()) {
    try {
      r = await conReintentos(agente, () => llamar(m));
      break;
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      const pasarAlSiguiente = status === 429 || (typeof status === "number" && status >= 500) || status === 404;
      if (!pasarAlSiguiente || i === candidatos.length - 1) throw e;
      console.warn(`   ↪ ${agente}: ${m} no disponible (${status}); pruebo con ${candidatos[i + 1]}`);
    }
  }
  if (!r) throw new Error(`El agente "${agente}" no obtuvo respuesta.`);
  const salida = esquema.parse(r.salida);

  mkdirSync(dirGrabaciones, { recursive: true });
  writeFileSync(
    archivo,
    JSON.stringify(
      {
        agente,
        proveedor: prov,
        modeloPedido: mod,
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
  if (!existsSync(dirGrabaciones)) return null;
  const candidatas = readdirSync(dirGrabaciones)
    .filter((f) => f.startsWith(`${agente}-`))
    .map((f) => path.join(dirGrabaciones, f))
    .map((f) => ({ f, fecha: JSON.parse(readFileSync(f, "utf8")).grabado as string }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!candidatas.length) return null;
  console.warn(`   (reproduciendo la grabación más reciente de "${agente}")`);
  return candidatas[0].f;
}

/**
 * Reintenta una vez ante sobrecarga momentánea (5xx). Ante falta de cuota (429)
 * no espera: corta para que se pruebe el siguiente modelo de respaldo.
 */
async function conReintentos<T>(agente: string, fn: () => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      const reintentable = typeof status === "number" && status >= 500;
      if (!reintentable || intento >= 2) throw e;
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

// --- OpenRouter (API compatible con OpenAI) ---

async function llamarOpenRouter<S extends z.ZodType>(mod: string, ll: LlamadaAgente<S>): Promise<Respuesta> {
  const { $schema, ...esquemaJson } = limpiarEsquema(z.toJSONSchema(ll.esquema)) as Record<string, unknown>;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Agente KPIs",
    },
    body: JSON.stringify({
      model: mod,
      max_tokens: ll.maxTokens ?? 32000,
      messages: [
        { role: "system", content: ll.sistema },
        { role: "user", content: ll.entrada },
      ],
      response_format: { type: "json_schema", json_schema: { name: ll.agente, strict: true, schema: esquemaJson } },
    }),
  });
  const cuerpo: any = await r.json().catch(() => ({}));
  if (!r.ok || cuerpo.error) {
    const status = cuerpo.error?.code ?? r.status;
    throw Object.assign(new Error(`OpenRouter ${status}: ${cuerpo.error?.message ?? r.statusText}`), {
      status: typeof status === "number" ? status : r.status,
    });
  }
  const eleccion = cuerpo.choices?.[0];
  if (eleccion?.finish_reason === "length") throw new Error(`El agente "${ll.agente}" se quedó sin tokens de salida.`);
  const texto: string = eleccion?.message?.content ?? "";
  if (!texto) throw new Error(`El agente "${ll.agente}" no devolvió texto.`);
  // Algunos modelos envuelven el JSON en un bloque de código.
  const json = texto.replace(/^s*```(?:json)?s*/i, "").replace(/s*```s*$/, "");
  return {
    salida: JSON.parse(json),
    modelo: cuerpo.model ?? mod,
    uso: { entrada: cuerpo.usage?.prompt_tokens ?? 0, salida: cuerpo.usage?.completion_tokens ?? 0 },
  };
}
