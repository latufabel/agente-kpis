// Analítica determinística: los números los calcula el código, no el modelo.
// Conteos por mes, forma de la serie (constante / pico / creciente / decreciente),
// relación con versiones, NPS por período y señales por cliente.

import type { Feedback } from "../tipos.ts";
import type { Clasificacion } from "../agentes/interprete.ts";

export type Forma = "constante" | "pico" | "creciente" | "decreciente" | "esporadico";

export interface Version {
  version: string;
  fecha: string;
  cambios: string;
}

/** Feedback del tema en ventanas simétricas de `dias` días antes y después de la versión. */
export interface ComparacionVersion {
  version: string;
  fecha: string;
  dias: number;
  antes: number;
  despues: number;
  porDiaAntes: number;
  porDiaDespues: number;
}

export interface MetricasTema {
  tema: string;
  total: number;
  ids: string[];
  porMes: Record<string, number>;
  primera: string;
  ultima: string;
  clientesUnicos: number;
  porTipoUsuario: Record<string, number>;
  porSegmento: Record<string, number>;
  porSentimiento: Record<string, number>;
  forma: Forma;
  versionAsociada: string | null;
  comparacionVersiones: ComparacionVersion[];
  clientesRecurrentes: { cliente: string; veces: number; ids: string[] }[];
}

export interface PeriodoNps {
  periodo: string;
  n: number;
  nps: number | null;
  muestraChica: boolean;
}

export interface SenalCliente {
  cliente: string;
  segmento: string;
  pagadores: number | null;
  serieNps: { fecha: string; nps: number; id: string }[];
  feedbackNegativos: string[];
  temas: string[];
  motivo: string;
}

export interface Analitica {
  ventana: { desde: string; hasta: string; meses: string[] };
  totalFeedback: number;
  temas: MetricasTema[];
  nps: { porMes: PeriodoNps[]; porVersion: PeriodoNps[] };
  senalesClientes: SenalCliente[];
}

export const MUESTRA_MINIMA_NPS = 30;
const MS_DIA = 86_400_000;

const mes = (fecha: string) => fecha.slice(0, 7);
const dias = (desde: string, hasta: string) => Math.max(1, Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_DIA));

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(fecha) + n * MS_DIA).toISOString().slice(0, 10);

function contar<T>(items: T[], clave: (x: T) => string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const x of items) r[clave(x)] = (r[clave(x)] ?? 0) + 1;
  return r;
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.slice(0, 7).split("-").map(Number);
  const fin = hasta.slice(0, 7);
  while (true) {
    const actual = `${a}-${String(m).padStart(2, "0")}`;
    meses.push(actual);
    if (actual >= fin) break;
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return meses;
}

export function calcularNps(puntajes: number[]): number | null {
  if (!puntajes.length) return null;
  const promotores = puntajes.filter((p) => p >= 9).length;
  const detractores = puntajes.filter((p) => p <= 6).length;
  return Math.round(((promotores - detractores) / puntajes.length) * 100);
}

function periodoNps(periodo: string, fb: Feedback[]): PeriodoNps {
  const puntajes = fb.map((f) => f.nps).filter((n): n is number => n != null);
  return { periodo, n: puntajes.length, nps: calcularNps(puntajes), muestraChica: puntajes.length < MUESTRA_MINIMA_NPS };
}

/** Forma de la serie de un tema. Exportada para poder testearla aislada. */
export function detectarForma(
  porMes: number[],
  comparaciones: ComparacionVersion[],
): { forma: Forma; version: string | null } {
  const total = porMes.reduce((a, b) => a + b, 0);
  if (total < 3) return { forma: "esporadico", version: null };

  // Pico: aparece (o se multiplica) después de una versión. Ante empate gana la
  // versión más reciente: es la más cercana al inicio del problema.
  let mejor: { version: string; ratio: number } | null = null;
  for (const c of comparaciones) {
    if (c.despues < 5) continue;
    const ratio = c.antes === 0 ? c.despues : c.despues / c.antes;
    if ((c.antes === 0 || ratio >= 4) && (!mejor || ratio >= mejor.ratio)) mejor = { version: c.version, ratio };
  }
  if (mejor) return { forma: "pico", version: mejor.version };

  const primero = porMes[0];
  const ultimo = porMes[porMes.length - 1];
  const noDecrece = porMes.every((v, i) => i === 0 || v >= porMes[i - 1]);
  const noCrece = porMes.every((v, i) => i === 0 || v <= porMes[i - 1]);
  if (noDecrece && ultimo >= Math.max(3, 2 * primero)) return { forma: "creciente", version: null };
  if (noCrece && primero >= Math.max(3, 2 * ultimo)) return { forma: "decreciente", version: null };
  if (porMes.filter((v) => v > 0).length <= 1) return { forma: "esporadico", version: null };
  return { forma: "constante", version: null };
}

export function analizar(feedback: Feedback[], clasificaciones: Clasificacion[], versiones: Version[]): Analitica {
  const fechas = feedback.map((f) => f.fecha).sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const meses = mesesEntre(desde, hasta);
  const porId = new Map(feedback.map((f) => [f.id, f]));
  const claseDe = new Map(clasificaciones.map((c) => [c.id, c]));
  // Solo versiones dentro de la ventana observada (con al menos una semana de datos antes).
  const versionesEnVentana = versiones.filter(
    (v) => v.fecha > desde && v.fecha <= hasta && dias(desde, v.fecha) >= 7,
  );

  const grupos = new Map<string, Feedback[]>();
  for (const c of clasificaciones) {
    const f = porId.get(c.id);
    if (!f) continue;
    grupos.set(c.tema, [...(grupos.get(c.tema) ?? []), f]);
  }

  const temas: MetricasTema[] = [...grupos.entries()].map(([tema, fb]) => {
    fb.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const conteoMes = contar(fb, (f) => mes(f.fecha));
    const porMes = Object.fromEntries(meses.map((m) => [m, conteoMes[m] ?? 0]));
    const comparacionVersiones = versionesEnVentana.map((v) => {
      const d = Math.min(dias(desde, v.fecha), dias(v.fecha, hasta) + 1);
      const inicio = sumarDias(v.fecha, -d);
      const fin = sumarDias(v.fecha, d);
      const antes = fb.filter((f) => f.fecha >= inicio && f.fecha < v.fecha).length;
      const despues = fb.filter((f) => f.fecha >= v.fecha && f.fecha < fin).length;
      return {
        version: v.version,
        fecha: v.fecha,
        dias: d,
        antes,
        despues,
        porDiaAntes: +(antes / d).toFixed(3),
        porDiaDespues: +(despues / d).toFixed(3),
      };
    });
    const { forma, version } = detectarForma(Object.values(porMes), comparacionVersiones);
    const porCliente = new Map<string, string[]>();
    for (const f of fb) porCliente.set(f.cliente, [...(porCliente.get(f.cliente) ?? []), f.id]);
    return {
      tema,
      total: fb.length,
      ids: fb.map((f) => f.id),
      porMes,
      primera: fb[0].fecha,
      ultima: fb[fb.length - 1].fecha,
      clientesUnicos: porCliente.size,
      porTipoUsuario: contar(fb, (f) => f.tipoUsuario),
      porSegmento: contar(fb, (f) => f.segmento),
      porSentimiento: contar(fb, (f) => claseDe.get(f.id)?.sentimiento ?? "?"),
      forma,
      versionAsociada: version,
      comparacionVersiones,
      clientesRecurrentes: [...porCliente.entries()]
        .filter(([, ids]) => ids.length >= 2)
        .map(([cliente, ids]) => ({ cliente, veces: ids.length, ids })),
    };
  });
  temas.sort((a, b) => b.total - a.total);

  // NPS por mes y por tramo entre versiones.
  const porMesNps = meses.map((m) => periodoNps(m, feedback.filter((f) => mes(f.fecha) === m)));
  const cortes = [desde, ...versionesEnVentana.map((v) => v.fecha), "9999-12-31"];
  const porVersionNps = cortes.slice(0, -1).map((inicio, i) => {
    const fin = cortes[i + 1];
    const etiqueta = i === 0 ? `antes de ${versionesEnVentana[0]?.version ?? "fin"}` : `desde ${versionesEnVentana[i - 1].version} (${inicio})`;
    return periodoNps(etiqueta, feedback.filter((f) => f.fecha >= inicio && f.fecha < fin));
  });

  // Señales por cliente: NPS que cae o quejas repetidas.
  const porCliente = new Map<string, Feedback[]>();
  for (const f of feedback) porCliente.set(f.cliente, [...(porCliente.get(f.cliente) ?? []), f]);
  const senalesClientes: SenalCliente[] = [];
  for (const [cliente, fb] of porCliente) {
    fb.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const serieNps = fb.filter((f) => f.nps != null).map((f) => ({ fecha: f.fecha, nps: f.nps!, id: f.id }));
    const negativos = fb.filter((f) => claseDe.get(f.id)?.sentimiento === "Negativo");
    const motivos: string[] = [];
    if (serieNps.length >= 2 && serieNps[serieNps.length - 1].nps <= serieNps[0].nps - 3) {
      motivos.push(`NPS en caída (${serieNps.map((s) => s.nps).join(" → ")})`);
    }
    if (negativos.length >= 3) motivos.push(`${negativos.length} feedbacks negativos`);
    if (!motivos.length) continue;
    senalesClientes.push({
      cliente,
      segmento: fb[fb.length - 1].segmento,
      pagadores: fb[fb.length - 1].pagadoresEmisor,
      serieNps,
      feedbackNegativos: negativos.map((f) => f.id),
      temas: [...new Set(fb.map((f) => claseDe.get(f.id)?.tema).filter((t): t is string => !!t))],
      motivo: motivos.join("; "),
    });
  }

  return {
    ventana: { desde, hasta, meses },
    totalFeedback: feedback.length,
    temas,
    nps: { porMes: porMesNps, porVersion: porVersionNps },
    senalesClientes,
  };
}
