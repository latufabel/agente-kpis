// Fuente offline para la demo: lee los datos de data/fixtures/.
// El campo "patron" (ground truth) se descarta acá: los agentes nunca lo ven.

import { readFileSync } from "node:fs";
import type { ConfigProducto, Feedback, KpiExistente } from "../tipos.ts";

const leer = (ruta: string) => readFileSync(ruta, "utf8").replace(/^﻿/, "");

interface FilaFixture {
  notion_id: string;
  fecha: string;
  canal: string;
  tipo: string;
  cliente: string;
  emisor: string;
  seg: string;
  pag: number | null;
  nps: number | null;
  resumen: string;
  texto: string;
}

export function leerContextoFixture(config: ConfigProducto): string {
  return leer(config.fixtures.contexto);
}

export function leerFeedbackFixture(config: ConfigProducto): Feedback[] {
  const filas: FilaFixture[] = JSON.parse(leer(config.fixtures.feedback));
  return filas.map((f) => ({
    id: f.notion_id,
    fecha: f.fecha,
    canal: f.canal,
    tipoUsuario: f.tipo,
    cliente: f.cliente,
    emisor: f.emisor,
    segmento: f.seg,
    pagadoresEmisor: f.pag,
    nps: f.nps,
    resumen: f.resumen,
    texto: f.texto,
  }));
}

export function leerKpisFixture(config: ConfigProducto): KpiExistente[] {
  return JSON.parse(leer(config.fixtures.kpisExistentes));
}
