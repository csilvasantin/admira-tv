# Admira.tv · Motores y Frenos
## Hoja de ruta para incorporar capacidades de clase enterprise (inspirado en Navori QL 2.7)

**Documento fuente para presentación en video**  
**Versión:** 1.0 · Junio 2026  
**Destinatario:** Equipo AdmiraNeXT · Pixeria · XpaceOS  
**URL del producto:** https://www.admira.tv

---

## 1. Propósito de este documento

Este documento define qué debe acelerar el desarrollo de **admira.tv** (los **motores**) y qué debe frenarlo o posponerse (los **frenos**), tras analizar el vídeo de lanzamiento de **Navori QL 2.7** y contrastarlo con el estado real de la plataforma Admira.

No se trata de copiar a Navori. Se trata de **cerrar brechas corporativas** sin perder la ventaja que ya tenemos: un canal DOOH con programática, IA, gemelo digital y medición de atención real.

---

## 2. Contexto: qué es Navori QL 2.7

Navori QL 2.7 es una actualización mayor de un CMS clásico de digital signage. Su vídeo de presentación organiza las novedades en cinco bloques:

1. **Content Manager reescrito** — interfaz más rápida, miniaturas grandes, preview en vivo, filtros.
2. **Nuevos tipos de contenido** — PowerPoint nativo, PDF, HTML con autenticación, Power BI, HDMI passthrough.
3. **QL Player reescrito** — mejor rendimiento en Samsung Tizen, LG WebOS, BrightSign e Innes.
4. **Integración Aquaji** — analytics por cámara que ajusta la playlist según la audiencia detectada.
5. **Hosting y seguridad** — on-premise, SSO (Active Directory, SAML 2.0), WAF, API ampliada.

QL 2.7 es un producto maduro orientado a **integradores AV y departamentos IT corporativos**. Su fortaleza es la cobertura de formatos de oficina y la capa enterprise. Su debilidad, frente a Admira, es que no nace como **canal programático con IA y gemelo digital**.

---

## 3. La trilogía Admira: dónde encaja admira.tv

Admira opera en tres capas conectadas:

| Capa | Producto | Rol |
|------|----------|-----|
| Crear | Pixeria (pixeria.com) | Contenido con IA: imagen, vídeo, música, campañas |
| Operar | XpaceOS (xpaceos.com) | Gemelo digital del espacio físico, audiencias, control en vivo |
| Emitir | Admira.tv | El canal: emisión en la red de pantallas, parrilla compartida, medición |

**admira.tv es la capa de emisión.** No compite con Pixeria en creación ni con XpaceOS en simulación 3D. Su misión es **poner en antena** lo que se crea y se vende, con control de flota y medición por superficie.

---

## 4. Estado actual de admira.tv (lo que ya tenemos)

### 4.1 CMS y programación (`cms.html`)

- Control de flota en tiempo real: online/offline, qué emite cada pantalla.
- Programación de parrilla vía `/grid`: pantalla → franja horaria → pieza del Stock de Pixeria.
- Canales por circuito (AdmiraNeXT, Kiosk, Metro, Xtanco…).
- Editor de segmentación condicional por pantalla.
- Control remoto: modo de emisión, volumen, forzar público, CLI.
- Conexión `pixerScreens` entre pantalla del grid y player físico.

### 4.2 Canal de emisión (`canal.html`)

- Bucle de reproducción del Stock de Pixeria.
- Tres modos: **local**, **sincro** y **condicional** (XPL).
- Detección facial on-device (face-api): género, edad, aforo — sin subir imágenes.
- Matriz de reglas: si detecta hombre → asset A; mujer → asset B; catch-all → carrusel completo.
- Precache de assets condicionales para disparo instantáneo cámara → contenido.
- Integración con parrilla `/grid/day`: emite lo programado en la franja actual.

### 4.3 Flota de players (`admira-player`)

- Players nativos: macOS, Windows, Linux (Electron), Android (Kotlin), iOS/iPadOS/visionOS (TestFlight), tvOS, Amazon Echo Show.
- Modo kiosko: reconexión, watchdog, anti-reposo, kill-switch.
- Cada player carga `admira.tv/canal.html` con su `screen` y `circuit` configurables.

### 4.4 Integración con el ecosistema

- **Pixeria** publica al Stock → admira.tv emite.
- **admira.app** vende inventario programático, empuja creativos ganadores vía `/signage/push`.
- **XpaceOS / gemelo** mide impactos, atención y CPM dinámico por pantalla.
- Workers Cloudflare: `pixer-eleven` (grid, stock, signage) y `omnipublicity-api` (segmentación, flota).

### 4.5 Conclusión del diagnóstico

**admira.tv ya cubre el núcleo de QL 2.7 en emisión, segmentación y analytics.** Lo que falta no es el concepto base, sino **formatos corporativos clásicos** (PowerPoint, PDF, BI) y **capa IT enterprise** (SSO, on-premise, documentación API pública).

---

## 5. LOS MOTORES — Qué debe acelerar el desarrollo

Los motores son iniciativas de alto retorno que cierran brechas con Navori y refuerzan la ventaja competitiva de Admira.

### Motor 1 · Biblioteca de medios de nivel enterprise

**Qué es:** Mejorar la experiencia de gestión de contenidos en el CMS.

**Qué incluye:**
- Miniaturas grandes con preview en vivo al pasar el cursor (vídeo en loop silenciado).
- Filtros por tipo, campaña, circuito, fecha, impactos.
- Ordenación por rendimiento (CPM, atención, reproducciones).

**Por qué acelera:** Es el quick win más visible para operadores. Navori lo vende como gran novedad de QL 2.7; nosotros podemos igualarlo en semanas, no en años.

**Esfuerzo estimado:** 2–3 semanas.

---

### Motor 2 · PDF como tipo de contenido nativo

**Qué es:** Permitir subir un PDF al Stock y reproducirlo en pantalla como slideshow de páginas.

**Cómo funciona:**
- Upload a `api.admira.store/stock/upload`.
- Conversión server-side a imágenes por página (Worker + pdf.js o servicio headless).
- El player reproduce la secuencia con duración configurable por página.

**Por qué acelera:** PDF es el formato universal de comunicación interna (RRHH, legal, operaciones). Sin PDF, Admira queda fuera de muchas licitaciones corporativas.

**Esfuerzo estimado:** 2–4 semanas.

---

### Motor 3 · Dashboards embebidos (Power BI y HTML autenticado)

**Qué es:** Nuevo tipo de contenido `web` en el Stock para mostrar dashboards de negocio en pantalla.

**Ejemplo de contrato:**
```json
{
  "type": "web",
  "url": "https://app.powerbi.com/view?r=...",
  "auth": "token",
  "refreshSec": 300
}
```

**Por qué acelera:** Navori lo destaca como killer feature para manufacturing, retail y warehousing. Es el puente entre BI corporativo y la red de pantallas. Admira ya tiene la infra de players WebView; solo falta el tipo de contenido y la gestión de credenciales.

**Esfuerzo estimado:** 3–5 semanas.

---

### Motor 4 · Editor visual de reglas condicionales

**Qué es:** Panel en el CMS para crear reglas de segmentación sin editar JSON a mano.

**Reglas posibles:**
- Si aforo > 5 Y género = mujer Y franja = mañana → reproducir asset X.
- Si nadie detectado → carrusel completo del Stock.
- Si hora entre 12:00 y 14:00 → menú del día.

**Por qué acelera:** Ya tenemos el motor (modo condicional + face-api + matriz en omnipublicity-api). Lo que falta es la **interfaz de operación** para que un usuario no técnico configure campañas reactivas. Esto nos pone por delante de Navori Aquaji en usabilidad.

**Esfuerzo estimado:** 4–6 semanas.

---

### Motor 5 · Sincronización multi-pantalla (frame-accurate)

**Qué es:** Alinear la reproducción de vídeo entre varios players del mismo circuito para videowalls y experiencias inmersivas.

**Cómo funciona:**
- Timestamp común vía `/signage/now` en el worker.
- Players alinean `currentTime` del vídeo al reloj del servidor.
- Modo `sync` ya existe; hay que endurecerlo a nivel de frame.

**Por qué acelera:** Navori certifica sync en todas las plataformas. Para circuitos como Xtanco (5 superficies) es requisito de calidad de producción.

**Esfuerzo estimado:** 4–8 semanas.

---

### Motor 6 · API pública documentada del CMS

**Qué es:** Exponer y documentar (OpenAPI + ejemplos) todos los endpoints que hoy usamos internamente.

**Endpoints clave:**
- `POST /grid/book`, `/grid/unbook`, `/grid/config`
- `POST /segmentation?target=<circuit>`
- `POST /locations/mode`
- `GET /stock/list`, `/signage/now`, `/grid/day`

**Por qué acelera:** Navori QL 2.7 amplía la API para integradores. Nosotros ya tenemos la API; falta el **contrato público**. Con MCP `admira-tv-mcp` ya damos acceso a agentes; el siguiente paso es integradores humanos y partners.

**Esfuerzo estimado:** 2–3 semanas (documentación + portal).

---

### Motor 7 · La ventaja que NO debemos dejar de explotar

**Qué es:** Mantener y comunicar lo que Navori no tiene:

| Capacidad Admira | Navori QL 2.7 |
|------------------|---------------|
| Programática RTB en tiempo real (admira.app) | No |
| Creativos generados con IA (Pixeria) | No |
| Gemelo digital 3D del punto de venta (XpaceOS) | No |
| CPM dinámico por atención real (quién mira vs quién pasa) | Parcial (Aquaji) |
| Loop cerrado: crear → vender → emitir → medir | No |

**Por qué acelera:** Cada motor corporativo que añadamos (PDF, BI, SSO) debe presentarse como **capa sobre un canal inteligente**, no como un CMS más del montón.

---

## 6. LOS FRENOS — Qué debe frenar o posponer el desarrollo

Los frenos protegen el foco, el presupuesto y la identidad del producto.

### Freno 1 · No clonar QL 2.7 al 100%

**Riesgo:** Perder 12–18 meses reimplementando un CMS genérico mientras el mercado avanza en DOOH programático e IA.

**Decisión:** Tomar de Navori solo lo que cierra brechas corporativas (PDF, BI, SSO). No reescribir desde cero lo que ya funciona (player, grid, condicional, flota).

---

### Freno 2 · PowerPoint nativo con animaciones — posponer

**Riesgo:** Reproducir PowerPoint con animaciones y timings exactos (como Navori) requiere un motor propio o licencias costosas. Es el feature más caro de la lista.

**Decisión:**
- **MVP:** convertir PPTX → PDF/imágenes en el upload.
- **Pro (fase posterior):** evaluar solo si un cliente enterprise lo exige con contrato.

**Prioridad:** Baja. PDF cubre el 80% del caso de uso corporativo.

---

### Freno 3 · Players nativos SoC (Samsung Tizen, LG WebOS, BrightSign)

**Riesgo:** Navori reescribió su player para cada SoC. Admira usa WebView + players propios (Electron, Android, Apple). Portar a Tizen/WebOS es un proyecto paralelo de años.

**Decisión:** Mantener la estrategia WebView/kiosko salvo que un despliegue masivo en SoC lo exija contractualmente. Los players actuales ya cubren el 95% de los kioskos del grupo.

**Prioridad:** Muy baja.

---

### Freno 4 · HDMI passthrough

**Riesgo:** Solo aplica a hardware con capturadora HDMI (BrightSign, Innes). Requiere drivers específicos por plataforma.

**Decisión:** Posponer hasta que haya un despliegue concreto que lo requiera (p. ej. retransmitir señal de TV en una red de retail).

**Prioridad:** Muy baja.

---

### Freno 5 · On-premise completo

**Riesgo:** Empaquetar workers + KV + stock en Docker para clientes que no quieren cloud es un producto distinto con soporte propio.

**Decisión:** La arquitectura actual (Cloudflare Workers + GitHub Pages) es correcta para el 95% de casos. On-premise solo bajo contrato enterprise con SLA.

**Prioridad:** Baja (fase 3).

---

### Freno 6 · SSO / SAML antes de cerrar formatos de contenido

**Riesgo:** Implementar Active Directory y SAML 2.0 es valioso para IT, pero no desbloquea ventas si el cliente no puede subir su PDF o su dashboard de Power BI.

**Decisión:** SSO va en fase 3 (enterprise). Primero PDF, web embed y biblioteca mejorada.

**Prioridad:** Media-baja (después de motores 1–3).

---

### Freno 7 · No diluir la narrativa de producto

**Riesgo:** Presentar admira.tv como "otro CMS de signage" en lugar de "el canal de emisión DOOH con programática e IA".

**Decisión:** Toda comunicación externa (web, demos, Shoptalk) debe mantener la trilogía: **Pixeria crea → XpaceOS opera → Admira.tv emite.**

---

## 7. Roadmap por fases

### Fase 1 · Quick wins (2–4 semanas)

| Iniciativa | Motor | Impacto |
|------------|-------|---------|
| Biblioteca con preview en vivo | Motor 1 | Alto — visible de inmediato |
| PDF en Stock + player | Motor 2 | Alto — desbloquea corporativo |
| Dashboards embebidos (Power BI) | Motor 3 | Alto — diferenciador retail/industria |

**Resultado:** Paridad con el 70% del valor percibido de QL 2.7 en formatos de contenido.

---

### Fase 2 · Diferenciación (1–2 meses)

| Iniciativa | Motor | Impacto |
|------------|-------|---------|
| Editor visual de reglas condicionales | Motor 4 | Muy alto — usabilidad |
| Sync frame-accurate multi-pantalla | Motor 5 | Alto — videowalls |
| Informes de atención por asset | Motor 7 | Muy alto — monetización |

**Resultado:** Por delante de Navori en segmentación reactiva y medición de atención.

---

### Fase 3 · Enterprise (cuando haya contrato)

| Iniciativa | Motor / Freno | Impacto |
|------------|---------------|---------|
| SSO SAML / Active Directory | Freno 6 → Motor | Medio — IT procurement |
| API pública documentada | Motor 6 | Alto — partners |
| On-premise Docker | Freno 5 | Bajo — nicho |
| PowerPoint nativo Pro | Freno 2 | Bajo — solo si contrato |
| HDMI passthrough | Freno 4 | Muy bajo |
| Players SoC nativos | Freno 3 | Muy bajo |

**Resultado:** Checklist completo para licitaciones enterprise sin sacrificar la arquitectura cloud.

---

## 8. Matriz resumen: Motores vs Frenos

| Área | Motor (acelerar) | Freno (posponer) |
|------|------------------|------------------|
| Contenidos | PDF, web/BI, preview biblioteca | PowerPoint nativo Pro |
| Segmentación | Editor visual de reglas | — |
| Players | Sync multi-pantalla | SoC nativos, HDMI |
| Plataforma | API documentada | On-premise completo |
| Seguridad | — (fase 3) | SSO antes de formatos |
| Posicionamiento | Canal DOOH + IA + programática | Parecer "otro CMS" |

---

## 9. Mensajes clave para la presentación en video

1. **Admira.tv ya es un canal de emisión avanzado**, no un proyecto desde cero.
2. **Navori QL 2.7 es la referencia de brechas corporativas**, no el modelo a copiar.
3. **Los motores cierran el gap en 8–12 semanas** (PDF, BI, biblioteca, reglas visuales).
4. **Los frenos protegen el foco** (no SoC, no on-premise prematuro, no PowerPoint Pro).
5. **La ventaja competitiva es la trilogía**: crear con IA, operar con gemelo, emitir con programática.
6. **El objetivo no es igualar a Navori — es superarlo en inteligencia y monetización.**

---

## 10. Próximo paso recomendado

Empezar por el **trío de máximo impacto**:

1. PDF en Stock  
2. Dashboards embebidos (Power BI / HTML autenticado)  
3. Biblioteca de medios con preview en vivo en el CMS  

Estas tres iniciativas cierran la brecha más visible con QL 2.7 y refuerzan el mensaje: **Admira.tv emite todo — desde creativos con IA hasta informes de negocio en tiempo real.**

---

## Anexo A · Glosario

| Término | Definición |
|---------|------------|
| DOOH | Digital Out-of-Home: publicidad en pantallas físicas |
| Stock | Biblioteca de assets de Pixeria (`api.admira.store/stock`) |
| Circuito | Agrupación de pantallas por prefijo de ID (p. ej. `xtanco`) |
| Condicional | Modo de emisión que cambia contenido según la cámara |
| Grid | Sistema de parrilla programada (`/grid/day`) |
| CPM | Coste por mil impactos; en Admira incluye atención real |
| Gemelo digital | Simulación 3D del punto de venta en XpaceOS |
| RTB | Real-Time Bidding: subasta programática en admira.app |

---

## Anexo B · Referencias

- Admira.tv (emisión): https://www.admira.tv
- CMS de flota: https://admira.tv/cms.html
- Canal de emisión: https://admira.tv/canal.html
- Pixeria (creación): https://www.pixeria.com
- XpaceOS (operación): https://www.xpaceos.com
- admira.app (programática): https://admira.app
- Vídeo referencia Navori QL 2.7: https://www.youtube.com/watch?v=Z8NL_SbzGZE

---

*Documento preparado para generación de presentación en video con Google NotebookLM.*  
*AdmiraNeXT · Junio 2026*