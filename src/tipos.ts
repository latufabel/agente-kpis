// Tipos de dominio compartidos por fuentes, agentes y salidas.

export interface ConfigProducto {
  id: string;
  nombre: string;
  notion: { paginaContexto: string; dataSourceFeedback: string };
  jira: {
    proyecto: string;
    tipoKpi: string;
    tipoAlerta: string;
    estadoPropuesto: string;
    pmAccountId: string;
    etiquetaProducto: string;
  };
  fixtures: { contexto: string; feedback: string; kpisExistentes: string };
}

/** Un feedback tal como lo ven los agentes (sin etiquetas de ground truth). */
export interface Feedback {
  id: string; // FB-n
  fecha: string; // YYYY-MM-DD
  canal: string;
  tipoUsuario: string; // Emisor | Pagador
  cliente: string;
  emisor: string;
  segmento: string;
  pagadoresEmisor: number | null;
  nps: number | null;
  resumen: string;
  texto: string;
  /** Id de la página en Notion (solo modo conectado). */
  notionPageId?: string;
  /** Clasificación hecha en una corrida anterior (campos "(agente)" de Notion). */
  clasificacionPrevia?: { tema: string; sentimiento: string };
}

/** Alerta de desvío abierta en Jira (para no duplicarla en la próxima corrida). */
export interface AlertaAbierta {
  clave: string;
  titulo: string;
}

/** KPI que ya existe en Jira para el producto. */
export interface KpiExistente {
  clave: string;
  nombre: string;
  definicion: string;
  estado: string;
}
