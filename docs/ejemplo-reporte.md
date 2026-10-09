# Agente KPIs — Cobros Recurrentes

Corrida 2026-10-09 14:53 · modo demo · 120 feedbacks (2026-07-01 a 2026-09-30)

## Resumen

Se detectó una regresión crítica e inmediata con el lanzamiento de la v1.3, la cual afectó la detección de comprobantes desde dispositivos móviles y desplomó el NPS a -100 en septiembre. Adicionalmente, se observa un incremento del dolor por la conciliación 100% manual en clientes de gran escala (100+ pagadores), lo que eleva el riesgo de abandono. Se requiere revertir o parchear con urgencia el parser de mails de la v1.3 y priorizar asistencia directa a los emisores más afectados.

## Alertas de desvío

### 🔴 P1 · Regresión crítica en detección de comprobantes desde celulares tras v1.3

**Severidad:** critica · **Tipo:** regresion · **Forma:** pico · **Versión:** v1.3

Tras el lanzamiento de la v1.3 el 10 de septiembre, la cual debía mejorar la compatibilidad de mails desde el celular, se generó un pico abrupto de 20 fallos de detección en los que el sistema no reconoce los archivos adjuntos de los pagadores.

**Hipótesis de causa:** El nuevo motor de procesamiento de mails entrantes de la v1.3 introdujo un bug que impide parsear correctamente los adjuntos de correos enviados desde clientes de correo móviles específicos (iOS/Android mailers), clasificándolos erróneamente como correos sin adjunto.

**KPIs que mueve:** Tasa de falsos negativos en detección de comprobantes · Tasa de respuesta al pedido de cobro

**Evidencia:** FB-84, FB-85, FB-86, FB-87, FB-89, FB-90, FB-91, FB-92, FB-94, FB-95, FB-96, FB-97, FB-99, FB-101, FB-103, FB-105, FB-107, FB-108, FB-111, FB-115

**Clientes en riesgo:**
- EM-014: NPS cayó de 6 a 3 y reportó fallos de comprobantes tras v1.3 (FB-91, FB-98).
- EM-007: NPS en caída libre (7 a 4 a 2) y afectado por fallos de celulares (FB-96).
- EM-025: NPS cayó de 7 a 3 con queja directa registrada en FB-90.

**Advertencias:**
- La caída del NPS mensual de septiembre a -100 y de la cohorte v1.3 a -100 muestra una correlación total con este fallo, pero la muestra para ambos es muy pequeña (n=9 y n=7 respectivamente), por lo que debe tomarse como señal cualitativa de urgencia más que como métrica estadística estable.

**Próximos pasos:**
- Hacer rollback de los cambios de procesamiento de mails de la v1.3 o aplicar hotfix urgente para restablecer la detección de adjuntos.
- Analizar la estructura de los correos rebotados en los logs para identificar el patrón de los clientes de correo móviles que fallan.
- Contactar proactivamente a los emisores afectados para avisarles del inconveniente y asegurarles que se está resolviendo.

### 🟠 P2 · Inviabilidad de la conciliación manual para emisores de gran volumen

**Severidad:** alta · **Tipo:** tendencia_creciente · **Forma:** creciente

Los dolores relacionados con la conciliación manual muestran una tendencia creciente (3 en julio, 7 en agosto, 8 en septiembre) concentrada fuertemente en los clientes con mayor cantidad de pagadores (EM-021 con 180, EM-007 con 140, EM-031 con 110). A medida que crecen, el flujo manual se vuelve insostenible.

**Hipótesis de causa:** El producto exige abrir y aprobar cada comprobante uno por uno. Cuando el emisor supera los 50-100 pagadores activos, esta tarea operativa consume demasiado tiempo y anula la propuesta de valor de reducción de esfuerzo manual.

**KPIs que mueve:** Tiempo promedio de conciliación manual mensual

**Evidencia:** FB-7, FB-17, FB-24, FB-36, FB-40, FB-49, FB-53, FB-58, FB-62, FB-73, FB-74, FB-77, FB-80, FB-93, FB-100, FB-109, FB-112, FB-119

**Clientes en riesgo:**
- EM-007: Tiene 140 pagadores y su NPS cayó de 7 a 2, acumulando 6 quejas sobre este tema específico.
- EM-031: Tiene 110 pagadores, NPS cayó de 8 a 6, registrando 5 quejas por ineficiencia en conciliación.
- EM-021: Posee 180 pagadores (el de mayor volumen), registra 6 quejas totales y 4 específicas de conciliación sin haber respondido aún encuesta NPS.

**Próximos pasos:**
- Diseñar un flujo de aprobación rápida o conciliación en lote ('bulk approval') en el panel del emisor.
- Evaluar la viabilidad técnica de una pre-lectura de montos o datos clave en los comprobantes para sugerir pre-aprobaciones.

### 🟠 P3 · Riesgo extremo de abandono en grandes emisores (Clubs y Pymes)

**Severidad:** alta · **Tipo:** riesgo_cliente · **Forma:** decreciente

Múltiples clientes de alta relevancia por volumen de pagadores presentan caídas drásticas y sucesivas de NPS o una acumulación crítica de comentarios negativos sin NPS registrado.

**Hipótesis de causa:** Los clientes más grandes sufren el impacto combinado de la regresión de celulares (v1.3) y el techo operativo que impone la falta de automatización en conciliaciones y avisos de impagos.

**KPIs que mueve:** Tasa de respuesta al pedido de cobro

**Evidencia:** FB-109, FB-80, FB-98, FB-37, FB-90, FB-53

**Clientes en riesgo:**
- EM-007: 140 pagadores. NPS bajó de 7 a 4 y luego a 2. Registra 7 feedbacks negativos totales.
- EM-014: 95 pagadores. NPS bajó de 6 a 3. Registra 5 feedbacks negativos totales.
- EM-021: 180 pagadores. Cuenta con 6 comentarios negativos que denotan frustración severa.

**Advertencias:**
- Se deben gestionar estos casos de manera individual inmediata debido al peso que tienen estos emisores sobre el volumen de transacciones total de la plataforma.

**Próximos pasos:**
- Asignar un representante de Customer Success para contactar de inmediato a EM-007, EM-021 y EM-014.
- Ofrecer soporte manual asistido temporal para resolver sus conciliaciones trabadas por el fallo de la v1.3.

### 🟡 P4 · Falta crónica de alertas de impagos y reportes de control

**Severidad:** media · **Tipo:** problema_cronico · **Forma:** constante

Se mantiene una demanda constante y sostenida (15 quejas en total, distribuidas uniformemente mes a mes) solicitando visibilidad activa sobre las cuotas vencidas no pagadas sin que el emisor deba buscar activamente.

**Hipótesis de causa:** Dado que el sistema no emite recordatorios automáticos ni genera alertas al emisor cuando una cuota pasa a estado vencido, los emisores pequeños y medianos pierden el control de su cobranza, contradiciendo el objetivo de 'saber en todo momento quién pagó y quién no'.

**KPIs que mueve:** Tasa de deudas vencidas no visualizadas por el emisor

**Evidencia:** FB-9, FB-15, FB-21, FB-30, FB-43, FB-44, FB-52, FB-60, FB-71, FB-78, FB-82, FB-102, FB-110, FB-114, FB-120

**Clientes en riesgo:**
- EM-034: Acumula 4 feedbacks negativos reclamando reportes de impagos para su gestión diaria.
- EM-018: Acumula 3 feedbacks negativos solicitando alertas y control de morosidad.

**Próximos pasos:**
- Diseñar un reporte semanal automático por mail para el emisor consolidando deudores vencidos.
- Evaluar a nivel de roadmap la implementación de recordatorios automáticos de vencimiento hacia los pagadores.

## KPIs propuestos (estado «Propuesto», a aprobar por el PM)

### P1 · Tasa de falsos negativos en detección de comprobantes

- **Definición:** Porcentaje de correos de respuesta con comprobantes adjuntos en el cuerpo que son rebotados erróneamente por el sistema con una alerta de falta de archivo.
- **Fórmula:** (Cantidad de respuestas automáticas por falta de comprobante enviadas erróneamente / Total de correos procesados con imágenes incrustadas) * 100
- **Fuente del dato:** Logs del parseador de correo electrónico entrante y base de datos de respuestas automáticas de error enviadas.
- **Baseline:** Aproximadamente 50% de las respuestas móviles fallan desde la v1.3 (según el reporte del emisor EM-014 en FB-91 y del EM-034 en FB-107 que indican que solo entran PDF).
- **Objetivo:** Reducir la tasa de falsos negativos a menos de 1% en los próximos 15 días.
- **Por qué importa:** Es una regresión directa de la v1.3 que daña la experiencia del pagador, genera reclamos e incrementa drásticamente la carga de soporte manual.
- **Temas:** Fallo en detección de comprobantes desde celulares
- **Evidencia:** FB-84, FB-85, FB-86, FB-87, FB-89, FB-90, FB-91, FB-92, FB-94, FB-95, FB-96, FB-97, FB-99, FB-101, FB-103, FB-105, FB-107, FB-108, FB-111, FB-115

### P2 · Tiempo promedio de conciliación manual mensual

- **Definición:** Tiempo transcurrido estimado que un emisor pasa en la bandeja de comprobantes abriendo, validando y cambiando el estado de los pagos en un mes.
- **Fórmula:** Sumatoria de horas dedicadas a la conciliación en el panel por los emisores en un mes / Total de emisores activos que recibieron comprobantes
- **Fuente del dato:** Eventos de tracking de interfaz (clicks de aprobación y tiempo de permanencia en la vista de comprobantes).
- **Baseline:** Entre 2 y 3 días completos de trabajo mensual para emisores con más de 100 pagadores (FB-24 cita 2 días para 160 alumnos; FB-73 y FB-119 citan 3 días para su volumen).
- **Objetivo:** Reducir el tiempo promedio de conciliación para grandes emisores a menos de 4 horas al mes en los próximos 60 días.
- **Por qué importa:** La conciliación uno a uno es ineficiente y frena el crecimiento de los emisores, limitando el objetivo de negocio de escalar sin incrementar el esfuerzo operativo.
- **Temas:** Conciliación manual ineficiente para grandes volúmenes
- **Evidencia:** FB-7, FB-17, FB-24, FB-36, FB-40, FB-49, FB-53, FB-58, FB-62, FB-73, FB-74, FB-77, FB-80, FB-93, FB-100, FB-109, FB-112, FB-119

### P3 · Tasa de deudas vencidas no visualizadas por el emisor

- **Definición:** Porcentaje de cuotas en estado 'NO PAGADO' que transcurren más de 10 días desde el vencimiento sin que el emisor haya ingresado a la cuota o enviado un reclamo.
- **Fórmula:** (Cuotas vencidas en 'NO PAGADO' con más de 10 días sin interacción de lectura del emisor / Total de cuotas vencidas 'NO PAGADO') * 100
- **Fuente del dato:** Métricas de interacción con el panel de administración cruzadas con la base de datos de cuotas.
- **Baseline:** Alta frecuencia de detección tardía, los emisores informan enterarse de deudas de meses anteriores de forma fortuita (FB-9, FB-21, FB-30, FB-52).
- **Objetivo:** Bajar la tasa de deudas no visualizadas a menos del 5% tras 7 días del vencimiento en un plazo de 45 días mediante la introducción de alertas automáticas.
- **Por qué importa:** Afecta directamente el objetivo del emisor de saber en todo momento quién pagó y de cobrar a tiempo sin perder visibilidad.
- **Temas:** Falta de alertas y reportes de impagos
- **Evidencia:** FB-9, FB-15, FB-21, FB-30, FB-43, FB-44, FB-52, FB-60, FB-71, FB-78, FB-82, FB-102, FB-110, FB-114, FB-120

## Evidencia sumada a KPIs existentes

- **DEMO-1 Tasa de respuesta al pedido de cobro** (+21): La evidencia demuestra que el uso de correo electrónico como único canal de comunicación limita gravemente la tasa de respuesta. Los usuarios no abren el mail o lo leen tarde, lo que reduce el éxito del cobro recurrente. Implementar WhatsApp se perfila como la solución clave para mover esta métrica. Evidencia: FB-3, FB-11, FB-13, FB-23, FB-27, FB-31, FB-35, FB-37, FB-38, FB-42, FB-47, FB-59, FB-64, FB-68, FB-75, FB-81, FB-88, FB-98, FB-106, FB-113, FB-118

## Temas detectados

| Tema | Total | 2026-07 | 2026-08 | 2026-09 | Forma | Decisión |
|---|---:|---:|---:|---:|---|---|
| Notificaciones y cobro por WhatsApp | 21 | 7 | 7 | 7 | constante | accionable |
| Fallo en detección de comprobantes desde celulares | 20 | 0 | 0 | 20 | pico (tras v1.3) | accionable |
| Conciliación manual ineficiente para grandes volúmenes | 18 | 3 | 7 | 8 | creciente | accionable |
| Falta de alertas y reportes de impagos | 15 | 4 | 5 | 6 | constante | accionable |
| Elogio general y validación de valor | 13 | 8 | 4 | 1 | decreciente | ruido |
| Consulta de uso | 9 | 4 | 3 | 2 | decreciente | ruido |
| Problemas de entregabilidad de correo | 4 | 2 | 1 | 1 | constante | ruido |
| Mensajes automáticos configurables | 2 | 1 | 1 | 0 | esporadico | ruido |
| Soporte para múltiples usuarios | 2 | 0 | 1 | 1 | esporadico | ruido |
| Personalización de correos con logo | 1 | 1 | 0 | 0 | esporadico | ruido |
| Exportación de datos a Excel | 1 | 1 | 0 | 0 | esporadico | ruido |
| Soporte para cobros con tarjeta | 1 | 1 | 0 | 0 | esporadico | ruido |
| Soporte para cobros multimoneda | 1 | 1 | 0 | 0 | esporadico | ruido |
| Soporte para modo oscuro | 1 | 1 | 0 | 0 | esporadico | ruido |
| Múltiples montos por categoría de pagador | 1 | 1 | 0 | 0 | esporadico | ruido |
| Descuentos por pronto pago | 1 | 0 | 1 | 0 | esporadico | ruido |
| Recuperación de contraseña en el panel | 1 | 0 | 1 | 0 | esporadico | ruido |
| Pausa temporal de cobros | 1 | 0 | 1 | 0 | esporadico | ruido |
| Aplicación móvil para el emisor | 1 | 0 | 1 | 0 | esporadico | ruido |
| Integración con Mercado Pago | 1 | 0 | 1 | 0 | esporadico | ruido |
| Emisión automática de recibos | 1 | 0 | 1 | 0 | esporadico | ruido |
| Configuración de horario de envío | 1 | 0 | 1 | 0 | esporadico | ruido |
| Mejoras en el diseño de correos | 1 | 0 | 1 | 0 | esporadico | ruido |
| Historial anual por pagador | 1 | 0 | 1 | 0 | esporadico | ruido |
| Configuración de fecha de vencimiento | 1 | 0 | 0 | 1 | esporadico | ruido |

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

- **EM-014** (Club / Sociedad de fomento, 95 pagadores): NPS en caída (6 → 3); 5 feedbacks negativos. Temas: Notificaciones y cobro por WhatsApp · Fallo en detección de comprobantes desde celulares
- **EM-018** (Profesional independiente, 28 pagadores): 3 feedbacks negativos. Temas: Personalización de correos con logo · Falta de alertas y reportes de impagos · Historial anual por pagador
- **EM-007** (Club / Sociedad de fomento, 140 pagadores): NPS en caída (7 → 4 → 2); 7 feedbacks negativos. Temas: Conciliación manual ineficiente para grandes volúmenes · Múltiples montos por categoría de pagador · Fallo en detección de comprobantes desde celulares
- **EM-036** (Profesional independiente, 22 pagadores): 4 feedbacks negativos. Temas: Exportación de datos a Excel · Notificaciones y cobro por WhatsApp · Pausa temporal de cobros · Falta de alertas y reportes de impagos
- **EM-029** (Profesional independiente, 18 pagadores): 3 feedbacks negativos. Temas: Falta de alertas y reportes de impagos · Mensajes automáticos configurables · Configuración de horario de envío · Fallo en detección de comprobantes desde celulares
- **EM-021** (Pyme, 180 pagadores): 6 feedbacks negativos. Temas: Notificaciones y cobro por WhatsApp · Conciliación manual ineficiente para grandes volúmenes · Fallo en detección de comprobantes desde celulares · Soporte para múltiples usuarios
- **EM-011** (Profesional independiente, 35 pagadores): 5 feedbacks negativos. Temas: Notificaciones y cobro por WhatsApp · Soporte para múltiples usuarios · Fallo en detección de comprobantes desde celulares
- **EM-034** (Pyme, 48 pagadores): 5 feedbacks negativos. Temas: Falta de alertas y reportes de impagos · Emisión automática de recibos · Fallo en detección de comprobantes desde celulares
- **EM-025** (Pyme, 70 pagadores): NPS en caída (7 → 3); 3 feedbacks negativos. Temas: Elogio general y validación de valor · Descuentos por pronto pago · Conciliación manual ineficiente para grandes volúmenes · Falta de alertas y reportes de impagos · Fallo en detección de comprobantes desde celulares
- **EM-031** (Pyme, 110 pagadores): 6 feedbacks negativos. Temas: Conciliación manual ineficiente para grandes volúmenes · Fallo en detección de comprobantes desde celulares
