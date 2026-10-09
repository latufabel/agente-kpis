# Agente KPIs — Cobros Recurrentes

Corrida 2026-10-09 15:57 · modo demo · 120 feedbacks (2026-07-01 a 2026-09-30)

## Resumen

Se detectó una regresión crítica tras el despliegue de la versión v1.3 el 10 de septiembre, la cual generó un pico de 20 fallas en la detección de comprobantes adjuntos por mail, impactando directamente en la experiencia de emisores y pagadores. Adicionalmente, persiste un problema estructural de insatisfacción por la carga de trabajo que genera la conciliación manual a medida que los emisores aumentan su volumen de pagadores, junto con reclamos sostenidos sobre el canal de correo y la falta de alertas de morosidad. Se priorizan cuatro alertas de desvío con foco inmediato en revertir la falla técnica de v1.3 y atender a los clientes de mayor volumen en riesgo de churn.

## Alertas de desvío

### 🔴 P1 · Regresión crítica en la recepción y detección de comprobantes post lanzamiento v1.3

**Severidad:** critica · **Tipo:** regresion · **Forma:** pico · **Versión:** v1.3

Inmediatamente después del lanzamiento de v1.3 el 10/09/2026, surgieron 20 reportes de fallas donde los correos con comprobantes enviados por los pagadores no cambian el estado a PENDIENTE DE REVISIÓN.

**Hipótesis de causa:** El nuevo procesamiento de mails entrantes implementado en v1.3 para mejorar el rendimiento y la compatibilidad con el celular introdujo un fallo en el parseo o captura de archivos adjuntos.

**KPIs que mueve:** Tasa de fallas en la detección de comprobantes por correo

**Evidencia:** FB-84, FB-85, FB-86, FB-87, FB-89, FB-90, FB-91, FB-92, FB-94, FB-95, FB-96, FB-97, FB-99, FB-101, FB-103, FB-105, FB-107, FB-108, FB-111, FB-115

**Clientes en riesgo:**
- EM-007: NPS en caída drástica de 7 a 2 tras registrar fallas de recepción junto con sobrecarga de conciliación.
- EM-025: NPS en caída de 7 a 3 con reportes de fallas en recepción desde la v1.3.
- EM-021: Acumula 6 feedbacks negativos, incluyendo fallas de detección en v1.3 y 180 pagadores afectados.
- EM-031: Acumula 6 feedbacks negativos con fallas en detección post v1.3.

**Advertencias:**
- El NPS del período de septiembre (-100) y de la versión v1.3 (-100) cuenta con solo 9 y 7 respuestas respectivamente (muestra chica < 30 respuestas), por lo que debe interpretarse como señal de alerta cualitativa y no como un indicador estadísticamente definitivo.

**Próximos pasos:**
- Hacer roll-back o hotfix del módulo de procesamiento de mails entrantes introducido en v1.3.
- Revisar los logs de recepción de mails del 11 al 27 de septiembre para procesar retroactivamente los comprobantes no detectados.
- Contactar proactivamente a los clientes EM-007, EM-025, EM-021 y EM-031 para darles soporte directo y confirmar la resolución.

### 🟠 P2 · Fricción creciente por sobrecarga operacional en la conciliación manual al escalar pagadores

**Severidad:** alta · **Tipo:** tendencia_creciente · **Forma:** creciente

El volumen de quejas por el trabajo manual de revisar comprobante por comprobante muestra una tendencia creciente mes a mes (3 en julio, 7 en agosto, 9 en septiembre), concentrándose en emisores con carteras grandes de pagadores.

**Hipótesis de causa:** A medida que el emisor suma más pagadores (ej. clubes o pymes con 100+ pagadores), la revisión y aprobación individual de comprobantes no escala y exige un esfuerzo excesivo.

**KPIs que mueve:** Tiempo promedio de conciliación por comprobante

**Evidencia:** FB-7, FB-17, FB-24, FB-36, FB-40, FB-49, FB-53, FB-58, FB-62, FB-73, FB-74, FB-77, FB-80, FB-93, FB-100, FB-109, FB-112, FB-116, FB-119

**Clientes en riesgo:**
- EM-007: 6 reclamos recurrentes por conciliación manual (140 pagadores); NPS cayó a 2.
- EM-031: 6 reclamos recurrentes por conciliación manual (110 pagadores).
- EM-021: 5 reclamos recurrentes por conciliación manual (180 pagadores).

**Advertencias:**
- Muestra cualitativa acotada a 5 clientes únicos recurrentes, aunque representan un alto porcentaje del volumen total de pagadores de la plataforma.

**Próximos pasos:**
- Diseñar e implementar acciones masivas en el panel de administración (ej. aprobación en lote / masiva de comprobantes).
- Explorar opciones de pre-validación automática o lectura básica de adjuntos para acelerar la conciliación.

### 🟡 P3 · Problema crónico de efectividad por uso exclusivo del canal correo electrónico

**Severidad:** media · **Tipo:** problema_cronico · **Forma:** constante

Reclamo constante (6 menciones mensuales sostenidas) por la baja tasa de apertura de mails por parte de los pagadores y la solicitud persistente de integrar WhatsApp como canal de cobro.

**Hipótesis de causa:** El canal de correo electrónico presenta menor tasa de lectura en ciertos segmentos (particulares, socios de clubes y profesionales independientes), lo que obliga a los emisores a perseguir manualmente a los pagadores por fuera del sistema.

**KPIs que mueve:** DEMO-1

**Evidencia:** FB-3, FB-11, FB-13, FB-23, FB-27, FB-31, FB-37, FB-42, FB-47, FB-59, FB-64, FB-68, FB-75, FB-81, FB-88, FB-98, FB-113, FB-118

**Clientes en riesgo:**
- EM-014: 5 reclamos por canal de cobro/WhatsApp; NPS cayó de 6 a 3.
- EM-011: 5 reclamos sobre el uso de correo y preferencia por WhatsApp.
- EM-036: 4 reclamos reiterados sobre la baja efectividad del mail frente a WhatsApp.

**Advertencias:**
- WhatsApp está fuera de alcance según las limitaciones actuales del producto, por lo que requerirá evaluación de Discovery de Producto.

**Próximos pasos:**
- Priorizar en el roadmap la integración o envío de recordatorios/links de cobro mediante WhatsApp.
- Proporcionar temporalmente a los emisores un enlace directo de cobro que puedan copiar y enviar manualmente por WhatsApp.

### 🟡 P4 · Falta crónica de notificaciones de cuotas impagas y seguimiento de morosidad

**Severidad:** media · **Tipo:** problema_cronico · **Forma:** constante

Menciones constantes (15 feedbacks acumulados, 4-6 por mes) solicitando alertas automáticas cuando un pagador no abona su cuota al vencimiento.

**Hipótesis de causa:** Al no existir alertas o resúmenes periódicos para el emisor sobre pagos vencidos, la detección de impagos depende 100% de la revisión manual del panel, incrementando el tiempo de detección de mora.

**KPIs que mueve:** Tiempo promedio de detección de cuotas impagas

**Evidencia:** FB-9, FB-15, FB-21, FB-30, FB-43, FB-44, FB-52, FB-60, FB-71, FB-78, FB-82, FB-102, FB-110, FB-114, FB-120

**Clientes en riesgo:**
- EM-034: 4 reclamos recurrentes por la falta de alertas sobre morosos.
- EM-018: 3 reclamos negativos sobre seguimiento de cuotas no pagadas.
- EM-029: 3 reclamos registrados vinculados a la detección e información de impagos.

**Advertencias:**
- Muestra de feedback cualitativo constante pero acotada a 6 clientes únicos.

**Próximos pasos:**
- Diseñar e implementar un correo resumen diario/semanal para el emisor con el listado de cuotas vencidas no pagadas.
- Agregar un indicador visual destacado en el panel para cuotas vencidas sin comprobante adjunto.

## KPIs propuestos (estado «Propuesto», a aprobar por el PM)

### P1 · Tasa de fallas en la detección de comprobantes por correo

- **Definición:** Porcentaje de respuestas de correo de pagadores con imagen o archivo adjunto que el sistema no logra identificar ni pasar al estado Pendiente de Revisión.
- **Fórmula:** (Número de respuestas con comprobante no detectadas / Número total de respuestas con comprobante recibidas) * 100
- **Fuente del dato:** Logs del motor de procesamiento de mails entrantes y servidor de correo.
- **Baseline:** 50% de fallas en la detección. Calculado a partir del reporte en FB-91 de un emisor que indica la pérdida de la mitad de los comprobantes tras v1.3; a medir analizando logs de correos entrantes no procesados.
- **Objetivo:** Reducir la tasa de fallas a menos de 1% en un plazo de 15 días.
- **Por qué importa:** Es una regresión crítica de la versión v1.3 que genera fricción severa y falsos reclamos a pagadores que sí enviaron su comprobante.
- **Temas:** Fallas en la recepción y detección de comprobantes
- **Evidencia:** FB-84, FB-85, FB-86, FB-87, FB-89, FB-90, FB-91, FB-92, FB-94, FB-95, FB-96, FB-97, FB-99, FB-101, FB-103, FB-105, FB-107, FB-108, FB-111, FB-115

### P2 · Tiempo promedio de conciliación por comprobante

- **Definición:** Tiempo en minutos transcurrido desde que un emisor abre un comprobante pendiente en la bandeja hasta que lo marca como Pagado o No Pagado.
- **Fórmula:** Suma total de minutos dedicados a revisar comprobantes / Número total de comprobantes conciliados en el período
- **Fuente del dato:** Telemetría de uso del panel de administración (eventos en la bandeja de comprobantes).
- **Baseline:** 3 a 6 minutos por comprobante. Calculado a partir de FB-24 (160 comprobantes llevan 16 horas, equivalente a 6 min/comprobante) y FB-7 (100 comprobantes en 4 horas, equivalente a 2.4 min/comprobante); a medir computando tiempo de sesión en bandeja.
- **Objetivo:** Reducir el tiempo promedio a menos de 0.5 minutos (30 segundos) por comprobante en 60 días mediante herramientas de aprobación masiva.
- **Por qué importa:** Representa el principal cuello de botella operativo que frena la meta de negocio de escalar en cantidad de pagadores por emisor.
- **Temas:** Carga de trabajo en conciliación manual
- **Evidencia:** FB-7, FB-17, FB-24, FB-36, FB-40, FB-49, FB-58, FB-73, FB-74, FB-77, FB-80, FB-93, FB-100, FB-109, FB-112, FB-116, FB-119

### P3 · Tiempo promedio de detección de cuotas impagas

- **Definición:** Días transcurridos desde que una cuota vence y entra en estado No Pagado hasta que el emisor visualiza o realiza alguna acción sobre esa cuota en el panel.
- **Fórmula:** Suma de días entre la fecha de vencimiento de la cuota impaga y la primera vista/gestión del emisor / Número total de cuotas impagas
- **Fuente del dato:** Base de datos de cuotas y registros de eventos de navegación en el panel.
- **Baseline:** 30 a 60 días de demora. Calculado a partir de FB-9, FB-21 y FB-52 donde los emisores reportan enterarse de cuotas no pagadas entre 1 y 2 meses después del vencimiento; a medir rastreando los timestamps de vencimiento y de visualización.
- **Objetivo:** Reducir la demora de detección a menos de 1 día (24 horas) en 45 días implementando alertas automáticas de impagos.
- **Por qué importa:** Sin alertas, los emisores no pueden cumplir el objetivo de saber en todo momento quién pagó y quién no, provocando morosidad desapercibida.
- **Temas:** Ausencia de alertas de cuotas impagas
- **Evidencia:** FB-9, FB-15, FB-21, FB-30, FB-43, FB-44, FB-52, FB-60, FB-71, FB-78, FB-82, FB-102, FB-110, FB-114, FB-120

## Evidencia sumada a KPIs existentes

- **DEMO-1 Tasa de respuesta al pedido de cobro** (+11): Los problemas de entregabilidad (mails a spam) y la baja tasa de lectura del correo electrónico explican directamente bajas en la tasa de respuesta medida por DEMO-1. Sumar estas evidencias permite al equipo entender que la falta de respuesta no es necesariamente desinterés del pagador, sino fallas en la llegada y apertura del canal mail. Evidencia: FB-3, FB-6, FB-11, FB-13, FB-18, FB-23, FB-35, FB-55, FB-75, FB-76, FB-106

## Temas detectados

| Tema | Total | 2026-07 | 2026-08 | 2026-09 | Forma | Decisión |
|---|---:|---:|---:|---:|---|---|
| Fallas en la recepción y detección de comprobantes | 20 | 0 | 0 | 20 | pico (tras v1.3) | accionable |
| Carga de trabajo en conciliación manual | 19 | 3 | 7 | 9 | creciente | accionable |
| Baja apertura del correo electrónico y preferencia por WhatsApp | 18 | 6 | 6 | 6 | constante | accionable |
| Solicitud de nuevas funcionalidades | 16 | 7 | 9 | 0 | constante | ruido |
| Ausencia de alertas de cuotas impagas | 15 | 4 | 5 | 6 | constante | accionable |
| Elogio general | 14 | 8 | 5 | 1 | decreciente | ruido |
| Consulta de uso | 11 | 4 | 4 | 3 | constante | ruido |
| Problemas de entregabilidad y correo no deseado | 7 | 3 | 2 | 2 | constante | accionable |

## NPS

| Período | n | NPS |
|---|---:|---:|
| 2026-07 | 8 | 38 ⚠ muestra chica |
| 2026-08 | 8 | 0 ⚠ muestra chica |
| 2026-09 | 9 | -100 ⚠ muestra chica |
| antes de v1.1 | 4 | 25 ⚠ muestra chica |
| desde v1.1 (2026-07-20) | 7 | 14 ⚠ muestra chica |
| desde v1.2 (2026-08-18) | 7 | -14 ⚠ muestra chica |
| desde v1.3 (2026-09-10) | 7 | -100 ⚠ muestra chica |

## Señales por cliente

- **EM-014** (Club / Sociedad de fomento, 95 pagadores): NPS en caída (6 → 3); 5 feedbacks negativos. Temas: Baja apertura del correo electrónico y preferencia por WhatsApp · Fallas en la recepción y detección de comprobantes
- **EM-018** (Profesional independiente, 28 pagadores): 3 feedbacks negativos. Temas: Solicitud de nuevas funcionalidades · Ausencia de alertas de cuotas impagas
- **EM-007** (Club / Sociedad de fomento, 140 pagadores): NPS en caída (7 → 4 → 2); 7 feedbacks negativos. Temas: Carga de trabajo en conciliación manual · Solicitud de nuevas funcionalidades · Fallas en la recepción y detección de comprobantes
- **EM-036** (Profesional independiente, 22 pagadores): 5 feedbacks negativos. Temas: Solicitud de nuevas funcionalidades · Baja apertura del correo electrónico y preferencia por WhatsApp · Ausencia de alertas de cuotas impagas
- **EM-029** (Profesional independiente, 18 pagadores): 3 feedbacks negativos. Temas: Ausencia de alertas de cuotas impagas · Solicitud de nuevas funcionalidades · Elogio general · Fallas en la recepción y detección de comprobantes
- **EM-021** (Pyme, 180 pagadores): 6 feedbacks negativos. Temas: Baja apertura del correo electrónico y preferencia por WhatsApp · Carga de trabajo en conciliación manual · Fallas en la recepción y detección de comprobantes
- **EM-011** (Profesional independiente, 35 pagadores): 5 feedbacks negativos. Temas: Baja apertura del correo electrónico y preferencia por WhatsApp · Solicitud de nuevas funcionalidades · Fallas en la recepción y detección de comprobantes
- **EM-034** (Pyme, 48 pagadores): 4 feedbacks negativos. Temas: Ausencia de alertas de cuotas impagas · Solicitud de nuevas funcionalidades · Fallas en la recepción y detección de comprobantes
- **EM-025** (Pyme, 70 pagadores): NPS en caída (7 → 3); 3 feedbacks negativos. Temas: Elogio general · Solicitud de nuevas funcionalidades · Carga de trabajo en conciliación manual · Ausencia de alertas de cuotas impagas · Fallas en la recepción y detección de comprobantes
- **EM-031** (Pyme, 110 pagadores): 6 feedbacks negativos. Temas: Carga de trabajo en conciliación manual · Fallas en la recepción y detección de comprobantes
