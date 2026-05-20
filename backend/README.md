# Backend - DocScan Finance CR

API REST en Node.js + Express. Implementa el procesamiento documental contable end-to-end definido en el Plan Maestro v2.1.

## Que hace

- Expone API REST autenticada por JWT.
- Recibe documentos por tres canales:
  - **MANUAL**: `POST /api/documents/upload` (multipart, autenticacion JWT).
  - **DRIVE**: `POST /api/integrations/poll-drive` (autenticacion `X-N8N-Token`, disparado por n8n cada 40 s o por la UI del admin).
  - **GMAIL**: `POST /api/integrations/poll-gmail` (idem).
- Ejecuta pipeline: hash + dedup binario -> OCR -> IA (clasifica + extrae) -> dedup por numero de factura -> validaciones aritmeticas + conversion monetaria -> MySQL -> Excel -> indexado para busqueda inteligente.
- Persiste auditoria completa: `raw_ocr`, `ai_extractions`, `processing_trace`, `excel_mapping`, `manual_edits`, `rag_documents`, `rag_queries`.
- Gestion de usuarios con roles ADMIN/USUARIO y limite de 3 administradores simultaneos.
- Conexion OAuth con Google para Drive y Gmail desde la UI del admin.
- Genera la plantilla Excel "Reintegro de Caja Chica" en `storage/processed/`.
- Cron diario de limpieza de almacenamiento + endpoint manual de mantenimiento.
- Logs estructurados con pino + request_id por request.
- 32 tests automatizados con vitest + supertest.

## Estructura

```
backend/
├── package.json
├── .env.example
├── vitest.config.js
├── tests/                              tests automatizados (vitest + supertest)
│   ├── setup.js                        carga .env, silencia pino, cierra pool al final
│   ├── helpers.js                      getApp + loginAsAdmin
│   ├── health.test.js
│   ├── auth.test.js
│   ├── documents.test.js
│   ├── dashboard.test.js
│   ├── traceability.test.js
│   └── rag.test.js
├── templates/
│   └── Reintegro.xlsx                  machote del Reintegro de Caja Chica
├── storage/                            git-ignored
│   ├── uploads/                        archivos recibidos
│   ├── ocr/                            volcados OCR en disco (futuro)
│   ├── processed/                      Reintegro_actualizado.xlsx + sidecar .session
│   ├── errors/                         archivos que fallaron el pipeline
│   └── temp/                           scratch de procesos intermedios
└── src/
    ├── server.js                       entry point: app + ping MySQL + cron de limpieza
    ├── app.js                          configuracion Express + montaje de rutas
    ├── lib/
    │   └── logger.js                   pino root logger con redact de secretos
    ├── config/
    │   └── env.js                      carga .env y expone config tipado
    ├── db/
    │   ├── pool.js                     mysql2 pool con verificacion
    │   ├── migrate.js                  runner de migrations
    │   ├── seed.js                     crea ADMIN bootstrap
    │   └── migrations/                 *.sql aplicados en orden
    ├── middleware/
    │   ├── auth.js                     JWT, requireRole, ingestTokenRequired
    │   ├── upload.js                   multer + filtro mime
    │   ├── requestLogger.js            req.id + req.log + X-Request-Id
    │   └── errorHandler.js             notFound + handler global
    ├── controllers/
    │   ├── authController.js           login + me + change password
    │   ├── googleAuthController.js     authorize, callback, status, disconnect
    │   ├── documentsController.js      upload, list (filtros), detail, trace, download, remove, bulkRemove, resetReintegro, reprocess
    │   ├── usersController.js          list, create, update (con limite 3 ADMIN)
    │   ├── integrationsController.js   pollDrive, pollGmail, ensureDriveStructure, fetchCurrency, listCurrency
    │   ├── dashboardController.js      stats (totales, IVA por tarifa, top proveedores, mensual)
    │   ├── traceabilityController.js   vista global + stats (by_status, by_stage, stage_durations)
    │   ├── editsController.js          PATCH invoices/lines + listEdits (audit en manual_edits)
    │   ├── ragController.js            query, reindex one/all, status, history
    │   └── adminController.js          runStorageCleanup + listOrphans
    ├── routes/
    │   ├── healthRoutes.js             /api/health
    │   ├── authRoutes.js               /api/auth/*
    │   ├── documentsRoutes.js          /api/documents/*
    │   ├── usersRoutes.js              /api/users/*
    │   ├── integrationsRoutes.js       /api/integrations/*
    │   ├── dashboardRoutes.js          /api/dashboard/*
    │   ├── traceabilityRoutes.js       /api/traceability/*
    │   ├── invoicesRoutes.js           /api/invoices/:id (PATCH)
    │   ├── invoiceLinesRoutes.js       /api/invoice-lines/:id (PATCH)
    │   ├── ragRoutes.js                /api/rag/*
    │   └── adminRoutes.js              /api/admin/storage/*
    └── services/
        ├── hashService.js              SHA256 + documentHashFull
        ├── traceService.js             withStage, traceStart/end/instant
        ├── storageService.js           rutas de storage
        ├── storageCleanupService.js    cleanOldTempFiles + cleanOrphanedUploads + detectOrphans
        ├── ocrService.js               pdf-parse + sharp + tesseract.js
        ├── geminiService.js            cliente Gemini con prompt restrictivo (clasificacion + extraccion)
        ├── currencyService.js          tipo de cambio Hacienda CR
        ├── validationService.js        chequeos aritmeticos cruzados (subtotal+IVA=total, etc)
        ├── excelService.js             ExcelJS para machote Reintegro
        ├── pipelineService.js          orquesta todo el flujo
        ├── ragService.js               chunking + embeddings + cosine + chat con contexto
        ├── googleOAuthService.js       authorize URL + tokens + refresh
        ├── driveService.js             listar, descargar, mover en Drive
        └── gmailService.js             listar UNREAD, descargar adjunto, markAsRead
```

## Como poner en marcha

Detalle paso a paso para clonar desde cero en [`../INSTALACION.md`](../INSTALACION.md). Para reabrir tras un cierre limpio: [`../INICIO-RAPIDO.md`](../INICIO-RAPIDO.md).

Resumen rapido:

```powershell
cd backend
npm install
copy .env.example .env       # editar variables
# (UNA vez) ejecutar 000_create_user_and_db.sql en MySQL Workbench como root
npm run db:migrate
npm run db:seed
npm run dev                  # puerto 3000
```

## Variables de entorno (`.env`)

Plantilla completa en `.env.example`. Cada variable:

| Variable | Para que |
|---|---|
| `NODE_ENV` | development / production |
| `PORT` | Puerto HTTP (default 3000) |
| `LOG_LEVEL` | Nivel pino: trace/debug/info/warn/error/fatal/silent. Default: debug en dev, info en prod. |
| `GEMINI_API_KEY` | API key de Google AI Studio |
| `GEMINI_MODEL` | Modelo de extraccion/chat (default `gemini-2.5-flash`) |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth 2.0 Web Client de Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` |
| `DRIVE_ROOT_FOLDER_NAME` | Nombre de la carpeta raiz en Drive (`DocScanFinanceCR`) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | Conexion MySQL |
| `JWT_SECRET` | Firma de tokens JWT (string aleatorio largo) |
| `JWT_EXPIRES_IN` | Duracion del token (`8h`) |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | Admin inicial de seed |
| `N8N_INGEST_TOKEN` | Token compartido con n8n para los polls |
| `BCCR_INDICADOR_VENTA/COMPRA` | IDs de indicadores BCCR (default 318/317) |
| `STORAGE_DIR` | Carpeta base de storage (`./storage`) |
| `EXCEL_TEMPLATE_REINTEGRO` | Ruta del machote (`./templates/Reintegro.xlsx`) |

**Nunca** versiones el `.env` real (esta en `.gitignore`).

## Endpoints REST principales

### Autenticacion

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| POST | `/api/auth/login` | publica | - |
| GET | `/api/auth/me` | JWT | cualquiera |
| PATCH | `/api/auth/password` | JWT | cualquiera (cambia su propio password) |
| GET | `/api/auth/google/status` | JWT | cualquiera |
| POST | `/api/auth/google/authorize` | JWT | ADMIN |
| GET | `/api/auth/google/callback` | publica (Google redirige) | - |
| POST | `/api/auth/google/disconnect` | JWT | ADMIN |

### Documentos

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| POST | `/api/documents/upload` | JWT | cualquiera |
| GET | `/api/documents?status=...&source=...&from=...&to=...&search=...` | JWT | cualquiera |
| GET | `/api/documents/:id` | JWT | cualquiera |
| GET | `/api/documents/:id/trace` | JWT | cualquiera |
| GET | `/api/documents/:id/edits` | JWT | cualquiera |
| GET | `/api/documents/reintegro/download` | JWT | cualquiera |
| POST | `/api/documents/:id/reprocess` | JWT | ADMIN |
| DELETE | `/api/documents/:id` | JWT | ADMIN |
| DELETE | `/api/documents/reintegro/reset` | JWT | ADMIN |
| DELETE | `/api/documents` (header `X-Confirm-Bulk-Delete: ELIMINAR`) | JWT | ADMIN |
| POST | `/api/documents/ingest` | `X-N8N-Token` | - |

### Edicion auditada

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| PATCH | `/api/invoices/:id` | JWT | ADMIN |
| PATCH | `/api/invoice-lines/:id` | JWT | ADMIN |

### Panel principal

| Metodo | Ruta | Auth |
|---|---|---|
| GET | `/api/dashboard/stats` | JWT |

### Trazabilidad

| Metodo | Ruta | Auth |
|---|---|---|
| GET | `/api/traceability?status=...&source=...&current_stage=...&from=...&to=...` | JWT |

### Consulta inteligente (RAG)

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| GET | `/api/rag/status` | JWT | cualquiera |
| POST | `/api/rag/query` | JWT | cualquiera |
| GET | `/api/rag/history` | JWT | cualquiera |
| POST | `/api/rag/reindex/:id` | JWT | ADMIN |
| POST | `/api/rag/reindex-all` | JWT | ADMIN |

### Usuarios

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| GET | `/api/users` | JWT | ADMIN |
| POST | `/api/users` | JWT | ADMIN |
| PATCH | `/api/users/:id` | JWT | ADMIN |

### Integraciones (n8n + admin)

| Metodo | Ruta | Auth |
|---|---|---|
| POST | `/api/integrations/poll-drive` | `X-N8N-Token` |
| POST | `/api/integrations/poll-gmail` | `X-N8N-Token` |
| POST | `/api/integrations/currency-fetch` | `X-N8N-Token` |
| POST | `/api/integrations/drive/ensure-folders` | JWT ADMIN |
| POST | `/api/integrations/drive/poll` | JWT ADMIN |
| POST | `/api/integrations/gmail/poll` | JWT ADMIN |
| POST | `/api/integrations/currency/fetch` | JWT ADMIN |
| GET | `/api/integrations/currency` | JWT |

### Administracion del almacenamiento

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| POST | `/api/admin/storage/cleanup` | JWT | ADMIN |
| GET | `/api/admin/storage/orphans` | JWT | ADMIN |

## Pipeline documental

```
processFile(file)
   |
   v
 1. fileSha256(filePath)
 2. SELECT documents WHERE document_hash = ?      -- dedup binario
 3. INSERT documents (status='PROCESSING')        -- trace FILE_RECEIVED
 4. runOcrForDocument()                           -- trace OCR_START/OCR_DONE
       - PDF nativo -> pdf-parse
       - PDF escaneado -> rasterizar + sharp + tesseract.js
       - Imagen -> sharp + tesseract.js
       - INSERT raw_ocr (inmutable)
 5. extractInvoiceFromOcr()                       -- trace GEMINI_START/GEMINI_DONE
       - INSERT ai_extractions (prompt + respuesta + modelo + duracion)
       - Devuelve tipo_documento (FACTURA/REPORTE/OTRO) ademas de los campos
 5.4 Branch por tipo_documento:
       - Si es REPORTE u OTRO -> documents.status='REVIEW', error_message
         con prefijo [REPORTE] o [OTRO], skip excel. Return.
 5.5 Dedup por numero de factura + proveedor:
       - SELECT invoices WHERE numero_factura+proveedor coincide
       - Si match -> documents.status='DUPLICATE', skip excel. Return.
 6. INSERT invoices + invoice_lines                -- trace MYSQL_DONE
 6.5 Indexa async para RAG (no bloquea respuesta)
 7. currencyService.ensureRate()                   -- dentro de VALIDATION_DONE
       - UPDATE invoices SET tipo_cambio, total_colones (si moneda <> CRC)
 7.5 validationService.runArithmeticValidation()
       - subtotal - descuento + impuesto_total = total
       - SUM(line.total) = invoice.total
       - base * porcentaje/100 = monto_iva por linea
       - INSERT ai_extractions (purpose=VALIDATION) con issues
       - Si hay issues -> invoices.estado_extraccion = 'REVISION'
 8. appendToReintegro()                            -- trace EXCEL_START/EXCEL_DONE
       - Solo si invoice tiene datos extraibles
       - INSERT excel_mapping por celda
 9. UPDATE documents SET status='COMPLETED' o 'REVIEW'
```

Cualquier error en una etapa: documento queda en `ERROR` y `processing_trace` registra el detalle. n8n reintentara en el siguiente poll, o admin puede usar `POST /api/documents/:id/reprocess` desde la UI.

## Servicios externos

- **Gemini** (`@google/generative-ai`): extraccion estructurada con prompt restrictivo + embeddings (`gemini-embedding-001`) + chat con contexto para RAG. Tier gratuito de Google AI Studio. Una sola API key cubre los tres usos.
- **Hacienda CR** (`api.hacienda.go.cr/indicadores/tc/dolar`): tipo de cambio USD diario. Sin token.
- **Google Drive API v3**: listar carpeta `/Facturas`, descargar archivos, mover a `/Procesadas` o `/Errores`.
- **Google Gmail API v1**: listar UNREAD con `has:attachment`, descargar adjuntos, marcar como leido.

## Seguridad

- Todas las rutas excepto `/login` y el callback OAuth requieren JWT Bearer.
- Endpoints de integracion usan token compartido `X-N8N-Token`.
- bcryptjs para passwords.
- helmet + cors + express-rate-limit (300 req/min por IP en `/api/`).
- Validacion de entrada con zod.
- Multer limita uploads a 25 MB y filtra mime types permitidos.
- bulk delete requiere header de confirmacion explicito.
- Backend nunca expone `password_hash` en ninguna respuesta.
- Logger pino redacta `Authorization`, `X-N8N-Token`, `Cookie`, `password`, `token`, secretos del env (`JWT_SECRET`, `N8N_INGEST_TOKEN`, `DB_PASSWORD`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`).
- Header `X-Request-Id` (UUID v4) en cada respuesta para trazabilidad cliente <-> servidor.
- Cambio de password propio: backend valida el password actual con bcrypt antes de hashear el nuevo.

## Tests automatizados

```powershell
npm test            # corre una vez
npm run test:watch  # modo watch para TDD
```

32 tests en 6 archivos:
- `health.test.js` - endpoint /api/health y X-Request-Id
- `auth.test.js` - login, /me, change password (error paths)
- `documents.test.js` - list con filtros, detail
- `dashboard.test.js` - stats con sanity checks
- `traceability.test.js` - list con filtros + stats
- `rag.test.js` - status + query rechazos + history (sin happy path para no quemar quota)

Tests usan vitest + supertest contra `buildApp()` sin abrir puerto. Pool MySQL cerrado en `afterAll`. CI/CD pendiente (necesita test DB).

## Tablas MySQL

`users`, `documents`, `invoices`, `invoice_lines`, `raw_ocr`, `raw_xml`, `ai_extractions`, `processing_trace`, `excel_mapping`, `manual_edits`, `rag_documents`, `rag_queries`, `currency_rates`, `clients`, `income_invoices`, `payments`, `chatbot_queries`, `google_credentials`.

Detalle de columnas y FKs en los archivos SQL de `src/db/migrations/`.

## Convenciones de codigo

- CommonJS (`require/module.exports`).
- async/await en todos los handlers.
- Errores con `status` numerico para que el handler global responda con el HTTP correcto.
- Servicios sin estado (sin singletons mutables) excepto el OAuth state cache.
- Validacion de input siempre con zod en controllers (no en services).
- Sin comentarios obvios; solo explicar **por que** cuando no es evidente.
- Tests requeridos para nuevos endpoints publicos (smoke + happy path + 1-2 error paths).

## Como diagnosticar problemas

1. `GET /api/health` -> verifica MySQL, credenciales Gemini/Google/n8n.
2. `GET /api/documents/:id/trace` -> timeline detallado, etapa fallida marcada como ERROR.
3. Mirar logs en la terminal de `npm run dev`. Cada request tiene un `req_id` UUID. Si una respuesta dio error 500, busca ese UUID en los logs para ver el stack completo.
4. Inspeccionar `processing_trace.message` para detalle del error.
5. Si un documento queda en `PROCESSING` mucho tiempo: OCR escaneado puede tardar 30-90 s; o Gemini saturado (espera y reintenta con "Reprocesar" desde el detalle).

## Reglas inviolables (recordatorio)

- IA solo extrae lo visible (null si no esta).
- OCR no se edita despues de persistido.
- Excel es solo reporte; MySQL es la fuente.
- Hash documental + dedup por numero de factura previene duplicados Drive vs Gmail vs re-escaneos.
- Maximo 3 administradores activos.
- Conversion monetaria no se recalcula sobre facturas viejas.
- Validaciones aritmeticas NO corrigen los valores; solo flagean (`estado_extraccion = 'REVISION'`).
- Edicion manual nunca borra el valor anterior (queda en `manual_edits`).
- Gmail solo se marca como leido si todos los adjuntos pasaron sin error.
- n8n nunca toca MySQL/OCR/IA/Excel directamente; solo dispara los endpoints.
