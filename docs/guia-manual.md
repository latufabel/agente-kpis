# Guía: correr el Agente KPIs a mano desde VS Code

Para probar o hacer una demostración, sin esperar la corrida automática (días hábiles a las 08:00 y a las 15:00 de Argentina).

## Antes de empezar (una sola vez)

1. Abrí la carpeta del proyecto en VS Code: **Archivo → Abrir carpeta…** → `agente-kpis`.
2. Si nunca lo hiciste, instalá las dependencias: **Terminal → Nuevo terminal**, escribí `npm install` y apretá Enter.
3. Revisá que el archivo `.env` tenga las claves (ver [`.env.example`](../.env.example)). Sin claves solo funciona la opción 1.

## Cómo correrlo

1. Apretá **Ctrl+Shift+P**.
2. Escribí **`Run Task`** (o *Ejecutar tarea*) y elegí **Tasks: Run Task**.
3. Elegí una opción del menú. El resultado aparece en el panel de terminal, abajo.

| Opción | Qué hace | ¿Escribe en Jira/Notion? |
|---|---|---|
| **1 · Demo sin conexión** | Corre todo con los datos de prueba locales | No |
| **2 · Evaluar** | Compara la última corrida con las respuestas esperadas (puntaje x/20) | No |
| **3 · Probar con Notion y Jira** | Lee el feedback y los KPIs reales y genera el reporte | No |
| **4 · Publicar en Jira y Notion** | Lo mismo que la 3, y además crea los tickets y completa Notion | **Sí** |
| **5 · Reiniciar feedback en Notion** | Deja sin procesar los N feedbacks más recientes, para tener algo nuevo que mostrar | Sí (solo los campos "(agente)") |
| **6 · Abrir el último reporte** | Abre `salida/cobros-recurrentes/reporte.md` (Ctrl+Shift+V para verlo con formato) | No |

## Guion sugerido para una demostración

1. **Opción 5** con `20`: simula que entraron 20 feedbacks nuevos.
2. **Opción 3**: el agente los lee, los clasifica y arma el reporte. Abrilo con la **opción 6**.
3. **Opción 4**: publica. Mostrá en Jira cómo suma evidencia a los KPIs que ya existen y actualiza las alertas abiertas en vez de duplicarlas, y en Notion los campos "(agente)" completos.
4. Volvé a correr la **opción 4**: dice *"No hay feedback nuevo"*, no duplica nada.

> La opción 4 reutiliza exactamente las respuestas de la opción 3 si no cambió nada en el medio: lo que revisaste es lo que se publica.

## Si algo falla

- **"Falta NOTION_TOKEN / JIRA_…"**: falta esa clave en `.env`.
- **Mensajes `⏳ … 503` o `429`**: el modelo está saturado o se agotó la cuota gratuita; el agente reintenta solo. Si se agotó la cuota del día, cambiá de modelo en `.env` (por ejemplo `AGENTE_MODELO=gemini-3.5-flash`) o de proveedor (`AGENTE_PROVEEDOR=openrouter`).
- **"No hay feedback nuevo"**: es correcto; usá la opción 5 para preparar una demo.
