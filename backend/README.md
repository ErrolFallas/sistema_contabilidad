# Backend - DocScan Finance CR

API REST en Node.js + Express. Implementa el procesamiento documental contable end-to-end definido en el Plan Maestro v2.1.

## Que hace

- Expone API REST autenticada por JWT.
- Recibe documentos por tres canales:
  - **MANUAL**: `POST /api/documents/upload` (multipart, autenticacion JWT).
  - **DRIVE**: `POST /api/integrations/poll-drive` (autenticacion `X-N8N-Token`, disparado por n8n cada 40 s o por la UI del admin).
  - **GMAIL**: `POST /api/integrations/poll-gmail` (idem).
- Ejecuta pipeline: hash + dedup -> OCR -> Gemini -> validacion + conversion monetaria -> MySQL -> Excel.
- Persiste auditoria completa: `raw_ocr`, `ai_extractions`, `processing_trace`, `excel_mapping`, `manual_edits`.
- Gestion de usuarios con roles ADMIN/USUARIO y limite de 3 administradores simultaneos.
- Conexion OAuth con Google para Drive y Gmail desde la UI del admin.
- Genera la plantilla Excel "Reintegro de Caja Chica" en `storage/processed/`.

## Estructura

```
backend/
├── package.json
├── .env.example
├── templates/
│   └── Reintegro.xlsx                  machote del Reintegro de Caja Chica
├── storage/                            git-ignored
│   ├── uploads/                        archivos recibidos
│   ├── ocr/                            (futuro) volcados OCR en disco
│   ├── processed/                      Reintegro_actualizado.xlsx + sidecar .session
│   ├── errors/                         archivos que fallaron el pipeline
│   └── temp/                           scratch de procesos intermedios
└── src/
    ├── server.js                       entry point: arranca app + verifica MySQL
    ├── app.js                          configuracion de Express + montaje de rutas
    ├── config/
    │   └── env.js                      carga .env y expone config tipado
    ├── db/
    │   ├── pool.js                     mysql2 pool con verificacion
    │   ├── migrate.js                  runner de migrations
    │   ├── seed.js                     crea ADMIN bootstrap
    │   └── migrations/                 *.sql aplicados en orden alfabetico
    │       ├── 000_create_user_and_db.sql      (manual, una vez como root)
    │       ├── 001_initial_schema.sql
    │       ├── 002_google_credentials.sql
    │       └── 003_widen_gmail_attachment_id.sql
    ├── middleware/
    │   ├── auth.js                     JWT, requireRole, ingestTokenRequired
    │   ├── upload.js                   multer + filtro mime
    │   └── errorHandler.js             notFound + handler global
    ├── controllers/
    │   ├── authController.js           login + me
    │   ├── googleAuthController.js     authorize, callback, status, disconnect
    │   ├── documentsController.js      upload, list, detail, trace, downloadReintegro, remove, resetReintegro, bulkRemove
    │   ├── usersController.js          list, create, update (con limite 3 ADMIN)
    │   └── integrationsController.js   pollDrive, pollGmail, ensureDriveStructure, fetchCurrency, listCurrency
    ├── routes/
    │   ├── healthRoutes.js             /api/health
    │   ├── authRoutes.js               /api/auth/*
    │   ├── documentsRoutes.js          /api/documents/*
    │   ├── usersRoutes.js              /api/users/*
    │   └── integrationsRoutes.js       /api/integrations/*
    └── services/
        ├── hashService.js              SHA256 + documentHashFull
        ├── traceService.js             withStage, traceStart/end/instant
        ├── storageService.js           rutas de storage
        ├── ocrService.js               pdf-parse + sharp + tesseract.js
        ├── geminiService.js            cliente Gemini con prompt restrictivo
        ├── currencyService.js          tipo de cambio Hacienda CR
        ├── excelService.js             ExcelJS para machote Reintegro
        ├── pipelineService.js          orquesta todo el flujo
        ├── googleOAuthService.js       authorize URL + tokens + refresh
        ├── driveService.js             listar, descargar, mover en Drive
        └── gmailService.js             listar UNREAD, descargar adjunto, markAsRead
```

## Como poner en marcha

### Requisitos previos

- Node.js 20+
- MySQL Server nativo Windows (servicio MySQL80)
- MySQL Workbench (para ejecutar el SQL de bootstrap)

### Instalacion

```powershell
cd backend
npm install
cp .env.example .env       # editar variables
```

### Base de datos

1. Abrir MySQL Workbench como **root**.
2. Ejecutar `src/db/migrations/000_create_user_and_db.sql`. Esto crea la base `docscan_finance` y el usuario `app_user`.
3. Aplicar el resto de migraciones y seed:

```powershell
npm run db:migrate
npm run db:seed
```

`db:seed` crea el usuario ADMIN bootstrap. Las credenciales se toman de `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` del `.env`. **Cambielas tras el primer login.**

### Arrancar

```powershell
npm run dev     # nodemon, hot reload
# o
npm start       # produccion
```

Backend escucha en `http://localhost:3000`. Verifique:

```powershell
curl http://localhost:3000/api/health
```

## Variables de entorno (`.env`)

Plantilla completa en `.env.example`. Cada variable:

| Variable | Para que |
|---|---|
| `NODE_ENV` | development / production |
| `PORT` | Puerto HTTP (default 3000) |
| `GEMINI_API_KEY` | API key de Google AI Studio |
| `GEMINI_MODEL` | Modelo Gemini (default `gemini-2.5-flash`) |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth 2.0 Web Client de Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` |
| `DRIVE_ROOT_FOLDER_NAME` | Nombre de la carpeta raiz en Drive (`DocScanFinanceCR`) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | Conexion MySQL |
| `JWT_SECRET` | Firma de tokens JWT (string aleatorio largo) |
| `JWT_EXPIRES_IN` | Duracion del token (`8h`) |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | Admin inicial de seed |
| `N8N_INGEST_TOKEN` | Token compartido con n8n para los polls |
| `EXCEL_TEMPLATE_REINTEGRO` | Ruta del machote (`./templates/Reintegro.xlsx`) |

**Nunca** versione el `.env` real (esta en `.gitignore`).

## Endpoints REST principales

### Autenticacion

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| POST | `/api/auth/login` | publica | - |
| GET | `/api/auth/me` | JWT | cualquiera |
| GET | `/api/auth/google/status` | JWT | cualquiera |
| POST | `/api/auth/google/authorize` | JWT | ADMIN |
| GET | `/api/auth/google/callback` | publica (Google redirige) | - |
| POST | `/api/auth/google/disconnect` | JWT | ADMIN |

### Documentos

| Metodo | Ruta | Auth | Rol |
|---|---|---|---|
| POST | `/api/documents/upload` | JWT | cualquiera |
| GET | `/api/documents` | JWT | cualquiera |
| GET | `/api/documents/:id` | JWT | cualquiera |
| GET | `/api/documents/:id/trace` | JWT | cualquiera |
| GET | `/api/documents/reintegro/download` | JWT | cualquiera |
| DELETE | `/api/documents/:id` | JWT | ADMIN |
| DELETE | `/api/documents/reintegro/reset` | JWT | ADMIN |
| DELETE | `/api/documents` (header `X-Confirm-Bulk-Delete: ELIMINAR`) | JWT | ADMIN |
| POST | `/api/documents/ingest` | `X-N8N-Token` | - |

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

## Pipeline documental

```
processFile(file)
   |
   v
 1. fileSha256(filePath)
 2. SELECT documents WHERE document_hash = ?      -- dedup
 3. INSERT documents (status='PROCESSING')        -- trace FILE_RECEIVED
 4. runOcrForDocument()                           -- trace OCR_START/OCR_DONE
       - PDF nativo -> pdf-parse
       - PDF escaneado -> rasterizar + sharp + tesseract.js
       - Imagen -> sharp + tesseract.js
       - INSERT raw_ocr (inmutable)
 5. extractInvoiceFromOcr()                       -- trace GEMINI_START/GEMINI_DONE
       - INSERT ai_extractions (prompt+response+score+modelo)
 6. INSERT invoices + invoice_lines                -- trace MYSQL_DONE
 7. currencyService.ensureRate()                   -- trace VALIDATION_DONE
       - UPDATE invoices SET tipo_cambio, total_colones (si moneda <> CRC)
 8. appendToReintegro()                            -- trace EXCEL_START/EXCEL_DONE
       - Solo si invoice tiene datos extraibles
       - INSERT excel_mapping por celda
 9. UPDATE documents SET status='COMPLETED' o 'REVIEW'
```

Cualquier error en una etapa: documento queda en `ERROR` y `processing_trace` registra el detalle. n8n reintentara en el siguiente poll.

## Servicios externos

- **Gemini** (`@google/generative-ai`): extraccion estructurada de facturas con prompt restrictivo. Tier gratuito de Google AI Studio.
- **Hacienda CR** (`api.hacienda.go.cr/indicadores/tc/dolar`): tipo de cambio USD diario. Sin token.
- **Google Drive API v3**: listar carpeta `/Facturas`, descargar archivos, mover a `/Procesadas` o `/Errores`.
- **Google Gmail API v1**: listar UNREAD con `has:attachment`, descargar adjuntos, marcar como leido.

## Seguridad

- Todas las rutas excepto `/login` y el callback OAuth requieren JWT Bearer.
- Endpoints de integracion usan token compartido `X-N8N-Token`.
- bcryptjs con cost 12 para passwords.
- helmet + cors + express-rate-limit (300 req/min por IP en `/api/`).
- Validacion de entrada con zod.
- Multer limita uploads a 25 MB y filtra mime types permitidos.
- bulk delete requiere header de confirmacion explicito.
- Backend nunca expone `password_hash` en ninguna respuesta.

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

## Como diagnosticar problemas

1. `GET /api/health` -> verifica MySQL, credenciales Gemini/Google/n8n.
2. `GET /api/documents/:id/trace` -> timeline detallado del documento, etapa fallida marcada como ERROR.
3. Revisar logs del proceso `npm run dev`: errores con stack en development.
4. Inspeccionar `processing_trace.message` para detalle del error.
5. Si un documento queda en `PROCESSING` mucho tiempo, el OCR escaneado puede tardar 30-90 s; consultar la traza.

## Reglas inviolables (recordatorio rapido)

- IA solo extrae lo visible (null si no esta).
- OCR no se edita despues de persistido.
- Excel es solo reporte; MySQL es la fuente.
- Hash documental previene duplicados Drive vs Gmail.
- Maximo 3 administradores activos.
- Conversion monetaria no se recalcula sobre facturas viejas.
- Gmail solo se marca como leido si todos los adjuntos pasaron sin error.
- n8n nunca toca MySQL/OCR/IA/Excel directamente; solo dispara los endpoints.
