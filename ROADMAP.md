# ROADMAP - DocScan Finance CR

Lista viva de lo que falta y de mejoras conocidas. Marcar con `[x]` al completar.

## Leyenda

- **Prioridad**: P0 (bloquea), P1 (importante), P2 (nice to have).
- **Esfuerzo**: S (chico, <2h), M (medio, media jornada), L (grande, >1 dia).

---

## 1. Procesamiento documental

- [ ] **(P1, M)** Soporte XML factura electronica Hacienda CR
  - Detectar `mime_type` xml + extension `.xml`.
  - Parsear con `fast-xml-parser` (ya instalado).
  - Persistir XML completo inmutable en `raw_xml` (tabla ya existe).
  - Saltar OCR, pasar texto plano al pipeline.
  - Mapeo de campos Hacienda CR (Clave, Consecutivo, Emisor, Receptor, DetalleServicio, etc.) a `invoices` + `invoice_lines`.
  - Pruebas con XML real de Hacienda.

- [ ] **(P1, M)** Excel modo `IVA_ANALISIS` (Proyecto 2 del plan)
  - Plantilla con hoja "Detalle" (22 columnas: Clave, Tipo doc, Actividad, Tipo cedula, Estado Hacienda, Tipo de cambio, Total gravado, Total exento, Descuento, SubTotal, SubTotal colones, Otros cargos, Porcentaje impuesto, Total impuesto, Impuesto en colones, Total factura, Total colones).
  - Hoja "Resumen" con totales por tarifa IVA.
  - Switch en el documento: REINTEGRO vs IVA_ANALISIS (por header de upload o configuracion).

- [ ] **(P2, S)** Soporte EUR en `currencyService`
  - Hacienda solo expone USD. Buscar fuente para EUR (BCCR SOAP requiere token).
  - Por ahora `moneda = EUR` queda sin conversion.

- [x] **(P2, S)** Reintentos automaticos de documentos en ERROR
  - Workflow n8n `ReprocesoErrores` (mencionado en plan 14.4).
  - Endpoint `POST /api/documents/:id/reprocess`.
  - Solo reintenta si error es recuperable (timeout, network, no estructural).
  - Implementado: `POST /api/documents/:id/reprocess` (ADMIN). Limpia raw_ocr / ai_extractions / processing_trace / excel_mapping / invoices / invoice_lines del documento, resetea documents row a PROCESSING y vuelve a correr el pipeline. Conserva id y hash. Flag `reprocessExistingDocId` en processFile salta el hash check + INSERT. UI: boton "Reprocesar" en DocumentDetailPage para ADMIN. El workflow n8n automatico queda pendiente como sub-item futuro.

- [x] **(P2, S)** Limpieza automatica de `storage/temp` y archivos antiguos en `storage/uploads`
  - Cron diario que borra archivos > 30 dias.
  - Implementado: `storageCleanupService.js` con `cleanOldTempFiles` (default 7 dias) y `cleanOrphanedUploads` (default 30 dias, solo borra archivos NO referenciados por documents.storage_path activos). Cron `15 3 * * *` registrado en `server.js` con `node-cron`. Endpoint manual `POST /api/admin/storage/cleanup` (ADMIN). UI en GoogleAdminPage seccion "Mantenimiento de almacenamiento".

- [x] **(P1, S)** Dedup por numero de factura + proveedor (post-extraccion)
  - Antes solo se deduplicaba por SHA del binario. Si el contador re-escaneaba en mayor resolucion, el binario diferia y la misma factura entraba dos veces. Ahora despues de Gemini, si `numero_factura + proveedor_cedula` (o `proveedor_nombre` normalizado como fallback) ya existe en un documento NO eliminado y NO en ERROR/DUPLICATE, el nuevo se marca como DUPLICATE y NO se inserta invoice ni se escribe Excel. Si el documento original se elimina desde la UI, su invoice desaparece por CASCADE y el archivo puede volver a procesarse normalmente.

---

## 2. RAG y chatbot

- [x] **(P1, L)** Modulo RAG documental (seccion 13.4 modulo 3 del plan)
  - Chunking de `raw_ocr` por documento.
  - Embedding con Gemini (`text-embedding-004` o similar).
  - Tabla `rag_documents.embedding` (JSON o BLOB).
  - Endpoint `POST /api/rag/query` que recibe pregunta, embedde, hace similitud cosine, top-K, contexto a Gemini.
  - Response incluye archivo, pagina, fila excel, celda.
  - Pagina `/rag` con buscador.
  - Persistir queries en `rag_queries`.
  - Implementado: `ragService.js` con chunking parrafo-aware (target 800 chars, max 2000), embeddings via Gemini `gemini-embedding-001` (no `text-embedding-004` - ese no esta expuesto en v1beta del SDK 0.24), batchEmbedContents con fallback a individual. Cosine similarity in-memory. Endpoints: POST /api/rag/query, GET /api/rag/status, GET /api/rag/history, POST /api/rag/reindex/:id (ADMIN), POST /api/rag/reindex-all (ADMIN). Prompt restrictivo: solo responde con info del contexto, dice "No encontre informacion suficiente" si no hay match, cita docs por numero. Pipeline async indexa cada doc nuevo tras MYSQL_DONE. Pagina /rag con buscador grande, ejemplos clickeables, panel de respuesta con fuentes citadas (link a /documents/:id) y panel admin de reindex.

- [ ] **(P1, L)** Chatbot contable (Proyecto 3 / seccion 17)
  - Whitelist de intenciones: gastos_periodo, ingresos_periodo, pagos_pendientes, facturas_vencidas, proveedor_top, iva_por_tarifa.
  - Gemini extrae intencion + parametros (JSON).
  - Validador: rechaza intenciones fuera de whitelist.
  - Query builder: SELECT parametrizado, NUNCA INSERT/UPDATE/DELETE.
  - Solo SELECT permitido. Bloquear UNION, comentarios SQL, etc.
  - Pagina `/chatbot` con interfaz tipo chat.
  - Persistir cada interaccion en `chatbot_queries` (pregunta_natural, consulta_estructurada, sql_ejecutado, respuesta, duracion_ms).
  - Permisos por rol: USUARIO ve agregados, ADMIN ve detalle.

---

## 3. Frontend - modulos pendientes

- [x] **(P1, M)** Dashboard real (actualmente solo cards a 0)
  - Indicadores: procesadas, duplicadas, error, revision, pendientes (queries reales).
  - Grafico por tarifa IVA con recharts.
  - Grafico por proveedor.
  - Grafico evolucion mensual.
  - Refetch automatico cada 10-30 s.
  - Endpoint: `GET /api/dashboard/stats`. Refresca cada 15 s.

- [x] **(P1, M)** Modulo "Trazabilidad" pagina dedicada (`/traceability`)
  - Vista global de todos los documentos con su estado.
  - Filtros por etapa actual, estado, fecha.
  - Timeline grande con detalle por etapa.
  - Endpoint: `GET /api/traceability` con filtros (`status`, `source`, `current_stage`, `from`, `to`) + stats agregadas (by_status, by_current_stage, stage_durations). LEFT JOIN con derived table de ultimo trace por documento para evitar correlated subqueries. Pagina refresca cada 5s. La timeline por documento sigue viviendo en `DocumentDetailPage` (al click en "Ver").

- [x] **(P1, M)** Modulo "Edicion auditada" (modulo 5 del plan)
  - Solo ADMIN.
  - Editar campos de `invoices` y `invoice_lines`.
  - Toda modificacion va a `manual_edits` (tabla ya existe) sin sobreescribir original.
  - Mostrar historial de cambios.
  - Endpoints: `PATCH /api/invoices/:id`, `PATCH /api/invoice-lines/:id`, `GET /api/documents/:id/edits`. Whitelist de campos editables. `original_value` se guarda como el valor que estaba en la fila inmediatamente antes (primera edicion = valor IA). Razon obligatoria. Cambios se aplican en transaccion con su audit-line. Excel NO se actualiza automaticamente; usar "Nuevo Reintegro" para regenerarlo si se desea reflejar la edicion alli.

- [x] **(P2, S)** Filtros avanzados en `Gestion documental`
  - Por source_type (Drive / Gmail / Manual).
  - Por status (con multi-select).
  - Por rango de fechas.
  - Busqueda por proveedor o numero factura.
  - Implementado: backend acepta `status`, `source` (multi via comma), `from`, `to`, `search` (LIKE sobre original_filename / proveedor_nombre / numero_factura). Frontend: barra con ChipMulti reusable + date pickers + search box. Refresca con react-query cada 5s usando queryKey dinamico segun filtros activos.

- [x] **(P2, S)** Vista responsive mobile
  - Sidebar colapsable en mobile.
  - Tablas con scroll mas amigables.
  - Implementado: breakpoint en `lg` (1024px). Bajo eso: top bar fija con hamburger + titulo de la app, sidebar como overlay con transform/translate-x animado, backdrop semitransparente clickeable para cerrar, body.overflow blockado mientras esta abierto, cierre automatico al cambiar de ruta (useEffect sobre location.pathname). NavLinks del usuario en footer del sidebar truncados para nombres largos. Padding de paginas pasa de `p-6` a `p-4 md:p-6`. Headers de paginas con `flex-wrap` para no apretar titulo + botones en moviles. Tablas existentes ya tenian overflow-auto + min-w; siguen scrollables horizontalmente con touch.

- [x] **(P2, M)** Cambiar password propio
  - Modal en perfil o pagina dedicada.
  - Pide password actual + nueva 2 veces.
  - Implementado como pagina `/profile`. Endpoint `PATCH /api/auth/password` con zod schema (current obligatorio, new min 8 chars, rechaza si new==current). Validacion con bcrypt del current antes de hashear el nuevo. Frontend con react-hook-form + zodResolver. Sesion actual no se invalida tras el cambio (el JWT vigente sigue valido hasta su expiracion natural). Link en el footer del sidebar (nombre del usuario).

---

## 4. Usuarios e ingresos

- [ ] **(P2, M)** CRUD clientes (tabla `clients` ya existe)
  - Pagina `/admin/clients`.
  - CRUD basico + relacion con `income_invoices`.

- [ ] **(P2, M)** Facturas de ingreso (Proyecto 3)
  - CRUD en `income_invoices`.
  - Registro de `payments`.
  - Estado calculado: PAGADA, PENDIENTE, VENCIDA.
  - Job diario que actualiza VENCIDA (fecha_vencimiento < hoy y estado != PAGADA).

- [ ] **(P2, S)** Notificar al usuario cuando hay errores recientes
  - Toast o badge en sidebar con count de documentos en ERROR.

---

## 5. Operacion y observabilidad

- [x] **(P1, S)** Logs estructurados
  - Reemplazar `console.log` con un logger (pino o winston).
  - Niveles por env (development verbose, production warn+).
  - Correlacion request_id por request HTTP.
  - Implementado con `pino` + `pino-pretty`. Middleware `requestLogger` agrega `req.log` con `req_id` (UUID) y emite log por request al cerrar response. Header `X-Request-Id` expuesto al cliente. Path `/api/health` silenciado. Secretos (Authorization, X-N8N-Token, JWT_SECRET, etc.) redactados via `redact.paths`. CLI scripts (migrate/seed/test-gemini) mantienen console por simplicidad.

- [ ] **(P2, M)** Tests automatizados
  - Backend: vitest + supertest para endpoints clave.
  - Frontend: vitest + testing-library para componentes criticos.
  - Pipeline: GitHub Actions con check de lint + tests + build.

- [ ] **(P2, S)** Healthchecks mas detallados
  - Disco disponible para `storage/`.
  - Tipo de cambio fresco (alertar si > 3 dias sin actualizar).
  - Numero de documentos en ERROR > N.

- [ ] **(P2, S)** Rate-limit por usuario en uploads
  - Actualmente solo rate-limit por IP en `/api/`.

- [ ] **(P2, M)** Backup automatico de MySQL
  - Cron diario que hace `mysqldump` a `storage/backups/`.
  - Rotacion (mantener 7 dias).

---

## 6. Hardening y seguridad

- [ ] **(P0, S)** Rotar todos los secretos en `.env` antes de produccion
  - `JWT_SECRET`, `N8N_INGEST_TOKEN`, `DB_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`.

- [ ] **(P0, S)** Cambiar password del ADMIN bootstrap tras primer login
  - Forzar en UI con flag `must_change_password`.

- [ ] **(P1, M)** CORS restrictivo en produccion
  - Hoy `cors: true` permite cualquier origen.
  - En produccion limitar a la URL real del frontend.

- [ ] **(P1, M)** HTTPS obligatorio en produccion
  - Forzar redirect http -> https.
  - Cookies / tokens con flags Secure y SameSite.

- [ ] **(P2, M)** Auditoria de accesos
  - Tabla `audit_log` con quien, cuando, que accion, IP.
  - Endpoints sensibles (DELETE bulk, change role, OAuth disconnect) registran ahi.

- [ ] **(P2, S)** Verificacion OAuth de Google
  - Pasar la app de Testing a Production en Google Cloud Console.
  - Refresh tokens dejaran de invalidarse cada 7 dias.
  - Requiere proceso de verificacion con Google (semanas).

- [ ] **(P2, S)** 2FA opcional para administradores
  - TOTP con `speakeasy` o `otplib`.

---

## 7. Bugs conocidos / mejoras tecnicas

- [ ] **(P2, S)** ExcelJS marca el archivo Reintegro con "registros recuperados"
  - Causa: DXFs (formatos condicionales) + drawing (logo) + conditional formatting no se preservan al 100%.
  - Los datos quedan correctos pero Excel muestra un warning cosmetico al abrir.
  - Opciones: aceptar warning, simplificar machote, o reemplazar ExcelJS con xlsx-populate solo para esta operacion.

- [x] **(P2, S)** Limpieza de archivos huerfanos
  - Si un documento se elimina pero su archivo fisico ya fue movido, queda referencia rota.
  - Detector que compara `documents.storage_path` con files en disco.
  - Implementado: `detectOrphans()` en `storageCleanupService.js`. Endpoint `GET /api/admin/storage/orphans` (ADMIN) devuelve 2 listas: (1) documents cuya storage_path no existe en disco, (2) archivos en storage/uploads sin referencia. UI: tabla con tamano y edad en GoogleAdminPage. Solo reporta, no borra (la limpieza se hace via el endpoint cleanup).

- [ ] **(P2, S)** Documentar swagger / OpenAPI
  - Generar spec automatica del backend (zod-to-openapi o similar).
  - Endpoint `/api/docs` con swagger-ui.

- [ ] **(P2, S)** Memoizar `getAuthenticatedClient` en `googleOAuthService`
  - Hoy cada llamada lee BD para el refresh_token. Cache de N segundos seria suficiente.

---

## 8. Documentacion

- [ ] **(P2, S)** Diagrama de arquitectura visual (mermaid / image)
- [ ] **(P2, S)** Documentar el modelo de datos completo (ER diagram)
- [ ] **(P2, S)** Guia de troubleshooting con casos frecuentes (OCR timeout, Google Testing mode, Excel warning)
- [ ] **(P2, S)** Politica de retencion de datos

---

## 9. Despliegue / produccion

- [ ] **(P1, L)** Pipeline CI/CD
  - Build + lint + tests en push a main.
  - Deploy automatico a servidor (PM2 o systemd) tras tag.

- [ ] **(P1, M)** PM2 / systemd para backend y n8n como servicios persistentes
  - Reinicio automatico tras crash.
  - Logs rotados.

- [ ] **(P2, M)** Reverse proxy (nginx)
  - Servir frontend estatico.
  - Proxy `/api` al backend.
  - SSL con Let's Encrypt.

---

## 10. Calidad de la extraccion IA

- [x] **(P1, M)** Mejorar prompt para detectar documentos no-factura
  - Hoy: si recibe un consolidado (caja chica del mes) extrae todo null y queda en REVIEW. Correcto pero ruidoso.
  - Mejora: Gemini puede devolver `tipo_documento: "FACTURA" | "REPORTE" | "OTRO"` y el pipeline decide.
  - Implementado: el prompt clasifica antes de extraer. El pipeline en `pipelineService.js` (paso 5.4) corta temprano si tipo != FACTURA, escribe motivo en `documents.error_message` con prefijo `[REPORTE]` o `[OTRO]`, marca status REVIEW y emite trace VALIDATION_DONE/SKIPPED. UI del detalle pinta el mensaje en ambar (no rojo) cuando status=REVIEW. Fallback a FACTURA si Gemini omite el campo (compatibilidad).

- [ ] **(P2, M)** Comparar OCR de pdf-parse vs Tesseract con metrica de confianza
  - Si pdf-parse devuelve menos de X caracteres O ratio caracteres-alfanumericos baja, fallback a Tesseract.

- [x] **(P2, M)** Validaciones cruzadas
  - Verificar que `subtotal + impuesto_total = total` con tolerancia (1 colon).
  - Si no cuadra, marcar invoice en REVISION.
  - Implementado en `backend/src/services/validationService.js`: 3 chequeos (subtotal-descuento+impuesto=total, SUM(lineas)=total, base*pct/100=monto_iva por linea). Se corre en el stage VALIDATION_DONE despues de la conversion monetaria. Persiste en `ai_extractions` con purpose=VALIDATION. Marca `invoices.estado_extraccion='REVISION'` si hay discrepancias. La IA NUNCA corrige los valores - solo flagea. Detail endpoint expone el reporte; UI muestra una card "Validaciones cruzadas" (verde si OK, ambar con lista de issues si no).

---

## Como retomar este roadmap en una sesion futura

Cuando vuelva a abrir el proyecto, abrir este archivo y pedir a Claude:

> "Lee `ROADMAP.md`. Vamos a trabajar en el item **X** de la seccion **Y**. Antes de empezar, recordame que reglas del plan v2.1 afectan a esta tarea."

Claude debe responder con las restricciones aplicables (de `README.md` o de los memos en `memory/`), y luego planificar.

**Decisiones fijas que NO se replantean**: stack tecnologico (seccion 2 del plan), exclusiones (PHP, phpMyAdmin, Docker, otras IAs distintas de Gemini), reglas inviolables de extraccion IA y OCR.
