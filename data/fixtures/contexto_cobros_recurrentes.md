# Cobros Recurrentes

> Producto de prueba para Agente KPIs. El feedback y el historial de versiones son datos simulados.

# Problema
Una persona o entidad chica (un particular, una sociedad de fomento, un profesional independiente, una pyme) necesita cobrarle a sus pagadores un monto recurrente y sin fecha de fin. Hoy lo hace con planillas, cuadernos y mensajes a mano: persigue a cada pagador, junta comprobantes por distintos medios y no sabe con claridad quién pagó y quién no.

La solución tiene que funcionar **sin pedirle al pagador que cree una cuenta** y **sin manejar datos sensibles de pago**, apoyándose en el vínculo de confianza que ya existe entre ambos.

# Visión
> Que cobrar una cuota recurrente sea tan simple como mandar un mensaje: el emisor configura una vez y se olvida de perseguir pagos, y el pagador paga desde donde ya está, sin registrarse.

## Objetivos del producto
- **Para el emisor:** cobrar a tiempo, con menos esfuerzo manual, y saber en todo momento quién pagó y quién no.
- **Para el pagador:** enterarse a tiempo de lo que tiene que pagar y avisar que pagó sin fricción.
- **Para el negocio:** que los emisores crezcan en cantidad de pagadores sin que el trabajo de cobrar crezca al mismo ritmo.

# Usuarios
## Emisor
Es quien cobra. Es el único que entra al panel de administración (con usuario y contraseña). Configura pagadores y pagos, revisa comprobantes, concilia y da de baja pagos.

Segmentos:
- **Particular:** alquila una cochera o un departamento, da clases particulares. Pocos pagadores (1 a 15).
- **Profesional independiente:** psicóloga, kinesiólogo, entrenadora, estudio contable. Entre 15 y 40 pagadores.
- **Club / Sociedad de fomento:** cuotas sociales, muchos socios mayores. Entre 50 y 150 pagadores.
- **Pyme:** gimnasio, academia, jardín, colegio de música, administración de consorcios. Entre 40 y 200 pagadores.

## Pagador
Es quien paga. **No tiene cuenta ni entra a ningún sistema.** Recibe el pedido de cobro por mail, paga por el medio que prefiera (transferencia, Mercado Pago, efectivo) y responde el mismo mail con la foto o el PDF del comprobante.

# Cómo funciona
1. El emisor da de alta a sus pagadores y configura cada pago: monto, frecuencia y canal.
2. En cada vencimiento, el sistema genera una **cuota** y le envía al pagador el pedido de cobro.
3. El pagador responde con el comprobante adjunto. Si la respuesta tiene un archivo, la cuota pasa a **PENDIENTE DE REVISIÓN** y el sistema le confirma que lo recibió. Si no tiene archivo, el sistema le responde pidiendo el comprobante.
4. El emisor revisa cada comprobante en el panel y marca la cuota como **PAGADO** o la rechaza (**NO PAGADO**).
5. Si llega el siguiente vencimiento sin comprobante, la cuota pasa a **NO PAGADO**.

Estados de una cuota: PENDIENTE → ENVIADO → PENDIENTE DE REVISIÓN → PAGADO / NO PAGADO, y CANCELADA si se da de baja el pago.

# Limitaciones conocidas
- El único canal disponible es el **mail**. WhatsApp está planificado pero no disponible.
- **No hay recordatorios** automáticos al pagador antes ni después del vencimiento.
- **No hay alertas** al emisor cuando una cuota queda en NO PAGADO.
- La **conciliación es 100% manual**: el emisor abre y aprueba cada comprobante de a uno.
- El sistema no lee el texto de los mensajes: la única señal es si la respuesta trae un archivo adjunto.

# Historial de versiones
| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-06-15 | Lanzamiento: alta de pagadores y pagos, generación de cuotas, envío del pedido de cobro por mail, recepción de comprobantes y conciliación manual. |
| v1.1 | 2026-07-20 | Filtros en la bandeja de comprobantes (por estado, pagador y fecha). |
| v1.2 | 2026-08-18 | Mensajes automáticos configurables: el emisor puede escribir el texto del pedido de cobro y de las respuestas automáticas. |
| v1.3 | 2026-09-10 | Nuevo procesamiento de mails entrantes: mejora de rendimiento y de compatibilidad con respuestas enviadas desde el celular. |

# Datos del negocio (simulados)
- 40 emisores activos y alrededor de 1.600 pagadores.
- Moneda: pesos argentinos (ARS). La app no mueve dinero: solo pide el pago y recibe el comprobante.
