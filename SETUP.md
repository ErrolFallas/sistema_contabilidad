# DocScan Finance CR - Setup Fase 1

Implementacion v2.1 del Plan Maestro. Esta fase entrega la fundacion end-to-end (backend Express + MySQL + frontend React + n8n) lista para que la Fase 2 agregue OCR/Gemini/Excel/RAG/Chatbot encima.

## 1. Stack instalado

- **Backend** `Node.js + Express` con `mysql2`, `exceljs`, `multer`, `tesseract.js`, `pdf-parse`, `sharp`, `fast-xml-parser`, `@google/generative-ai`, `googleapis`, `axios`, `node-cron`, `jsonwebtoken`, `bcryptjs`, `helmet`, `cors`, `zod`, `express-rate-limit`, `dotenv`. Dev: `nodemon`.
- **Frontend** `React 19 + Vite + TailwindCSS v3` con `react-router-dom`, `@tanstack/react-query`, `axios`, `zustand`, `react-hook-form`, `zod`, `recharts`.
- **n8n** levantado via `npx n8n` (sin Docker, sin instalacion global).
- **MySQL nativo Windows** (servicio del SO + Workbench).
- IA: Gemini (Google AI Studio) - SDK instalado, API key pendiente.

## 2. Paso 1 obligatorio: bootstrap MySQL (UNA sola vez)

Abrir MySQL Workbench conectado como `root` y ejecutar el script:

```
backend/src/db/migrations/000_create_user_and_db.sql
```

Eso crea:
- Base de datos `docscan_finance`
- Usuario `app_user@localhost` con password `AppUser_DocScan_2026!` (coincide con `backend/.env`)
- GRANTS sobre la base.

Si quiere otra password, cambiela tanto en el SQL como en `backend/.env` (campo `DB_PASSWORD`).

## 3. Paso 2: aplicar migraciones y seed

```powershell
cd backend
npm run db:migrate
npm run db:seed
```

`db:migrate` crea las 16 tablas del modelo (`documents`, `invoices`, `invoice_lines`, `raw_ocr`, `raw_xml`, `ai_extractions`, `processing_trace`, `excel_mapping`, `manual_edits`, `rag_documents`, `rag_queries`, `currency_rates`, `users`, `clients`, `income_invoices`, `payments`, `chatbot_queries`).

`db:seed` crea el usuario ADMIN bootstrap:
- Email:    `admin@docscan.local`
- Password: `ChangeMe123!`

Cambielo despues del primer login. La password real esta en `backend/.env` (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`).

## 4. Paso 3: arrancar servicios

Tres terminales separadas (o tres tabs):

### Terminal A - Backend (puerto 3000)

```powershell
cd backend
npm run dev
```

Verifique: http://localhost:3000/api/health debe responder JSON con `checks.mysql = "ok"`.

### Terminal B - Frontend (puerto 5173)

```powershell
cd frontend
npm run dev
```

Verifique: http://localhost:5173 abre el login. Use `admin@docscan.local` / `ChangeMe123!`.

### Terminal C - n8n (puerto 5678)

```powershell
cd C:\n8n-runtime
.\node_modules\.bin\n8n start
```

**Nota:** n8n se instalo en `C:\n8n-runtime` (fuera de OneDrive) para evitar el bug `ECOMPROMISED Lock compromised` que produce el sync de OneDrive sobre el cache de npm. La instalacion local con `npm install n8n --legacy-peer-deps` reemplaza al `npx n8n` del plan; cumple la misma intencion (sin Docker, sin global install) y es estable.

Verifique: http://localhost:5678.

## 5. Credenciales pendientes - guia paso a paso

Todas se pegan en `backend/.env`. Reinicie el backend luego de pegarlas.

### 5.1 GEMINI_API_KEY (Google AI Studio - GRATIS)

1. Entre a https://aistudio.google.com/app/apikey con su cuenta Google.
2. Click `Create API key`.
3. Copie la key y peguela en `backend/.env`:
   ```
   GEMINI_API_KEY=AIzaSy...
   ```
4. Reinicie el backend (`Ctrl+C` y `npm run dev`).

El modelo por defecto es `gemini-2.5-flash` (rapido y dentro de cuota gratuita). Puede cambiarlo en `GEMINI_MODEL`.

### 5.2 Google OAuth (Drive + Gmail)

1. Vaya a https://console.cloud.google.com/
2. Cree un proyecto (o use uno existente).
3. `APIs & Services` -> `Library` -> habilite:
   - `Google Drive API`
   - `Gmail API`
4. `APIs & Services` -> `OAuth consent screen`:
   - User type: `External` (luego en `Testing` agregue su correo como Test user).
   - Scopes: `auth/drive.readonly`, `auth/gmail.modify`.
5. `APIs & Services` -> `Credentials` -> `Create credentials` -> `OAuth client ID`:
   - Application type: `Web application`.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`.
6. Copie `Client ID` y `Client Secret` a `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
7. La obtencion del `GOOGLE_REFRESH_TOKEN` se hace desde la app en Fase 2 (flujo OAuth implementado en `/api/auth/google`).

### 5.3 N8N_INGEST_TOKEN

Ya se genero un valor de desarrollo en `backend/.env`. Para produccion reemplacelo por uno aleatorio largo y use el mismo valor en los workflows de n8n al hacer HTTP requests al backend.

## 6. Workflows n8n a configurar (Fase 2)

Una vez n8n este corriendo, cree 4 workflows:

| Workflow | Trigger | Accion |
|---|---|---|
| **DriveIngest** | Schedule cada 40s | Listar archivos nuevos en `/Facturas` (Drive) -> `POST http://localhost:3000/api/documents/ingest` con header `x-n8n-token: <N8N_INGEST_TOKEN>` |
| **GmailIngest** | Schedule cada 40s | Buscar `UNREAD + HAS_ATTACHMENT` -> por adjunto `POST /api/documents/ingest` -> marcar correo como leido |
| **TipoCambioBCCR** | Schedule diario | Consultar BCCR -> `POST /api/currency-rates` |
| **ReprocesoErrores** | Schedule cada N min | Listar errores recuperables -> `POST /api/documents/{id}/reprocess` |

Reglas n8n (seccion 14.6 del plan):
- n8n SOLO hace triggers e ingesta.
- n8n NUNCA toca MySQL directamente.
- n8n NUNCA ejecuta OCR ni Gemini.
- n8n NUNCA genera Excel.
- Toda comunicacion al backend usa el header `x-n8n-token`.

## 7. Estructura del proyecto

```
proyecto_contabilidad/
├── backend/
│   ├── .env                         # Credenciales locales (NO versionar)
│   ├── .env.example
│   ├── package.json
│   ├── templates/
│   │   └── Reintegro.xlsx           # Machote copiado (hoja: "Reintegro de Viaticos")
│   ├── storage/                     # uploads, ocr, processed, errors, temp
│   └── src/
│       ├── server.js                # entry point
│       ├── app.js                   # Express config
│       ├── config/env.js            # carga .env
│       ├── db/
│       │   ├── pool.js              # mysql2 pool
│       │   ├── migrate.js           # `npm run db:migrate`
│       │   ├── seed.js              # `npm run db:seed`
│       │   └── migrations/
│       │       ├── 000_create_user_and_db.sql   # Ejecutar como root en Workbench
│       │       └── 001_initial_schema.sql       # Lo aplica db:migrate
│       ├── middleware/
│       │   ├── auth.js              # JWT + ingest token
│       │   └── errorHandler.js
│       ├── controllers/
│       │   └── authController.js
│       └── routes/
│           ├── healthRoutes.js      # /api/health
│           ├── authRoutes.js        # /api/auth/login, /api/auth/me
│           └── documentsRoutes.js   # /api/documents/ingest (stub Fase 1)
└── frontend/
    ├── package.json
    ├── vite.config.js               # proxy /api -> localhost:3000
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                  # rutas
        ├── index.css                # tailwind base
        ├── services/api.js          # axios + JWT interceptor
        ├── auth/
        │   ├── AuthContext.jsx
        │   └── ProtectedRoute.jsx
        ├── layouts/AppLayout.jsx    # sidebar + outlet
        └── pages/
            ├── LoginPage.jsx
            ├── DashboardPage.jsx    # cards + health check
            └── Placeholder.jsx      # modulos Fase 2
```

## 8. Comandos rapidos

```powershell
# Backend
cd backend
npm run dev          # nodemon, hot reload
npm start            # produccion
npm run db:migrate
npm run db:seed

# Frontend
cd frontend
npm run dev          # Vite dev server
npm run build        # produccion
npm run preview

# n8n (instalado en C:\n8n-runtime)
cd C:\n8n-runtime
.\node_modules\.bin\n8n start   # interfaz en http://localhost:5678
```

## 9. Que falta (Fase 2)

| Capa | Pendiente |
|---|---|
| OCR | Servicio `tesseract.js` + `pdf-parse` + `sharp` integrado al pipeline |
| IA | Cliente Gemini con prompt restrictivo (extraccion + IVA + RAG + chat) |
| XML | Parser `fast-xml-parser` para factura electronica Hacienda |
| Excel | Generador con `ExcelJS` para modos REINTEGRO e IVA_ANALISIS |
| Conversion | Cliente BCCR para tipo de cambio diario |
| Trazabilidad | Wiring completo de `processing_trace` por etapa |
| RAG | Chunking + embedding + busqueda |
| Chatbot | Whitelist de intenciones + Query Builder SQL seguro |
| Frontend | Modulos de Gestion documental, RAG, Chatbot, Trazabilidad, Edicion, Admin |
| n8n | 4 workflows: DriveIngest, GmailIngest, TipoCambioBCCR, ReprocesoErrores |
| OAuth | Flujo callback `/api/auth/google/callback` con refresh token persistente |

## 10. Reglas inviolables (del plan v2.1)

- IA **NO** inventa, infiere ni estima. Campos ausentes = `NULL`.
- OCR **NO** corrige ni reordena. `raw_ocr` es inmutable.
- Excel es **reporte**, nunca fuente. MySQL es la fuente unica.
- Excel machote: si no existe `templates/Reintegro.xlsx`, el proceso DEBE detenerse.
- Hash documental SHA256 evita duplicados Drive vs Gmail.
- n8n **solo** orquesta; toda logica corre en el backend.
- Conversion monetaria nunca recalcula historicos.
- Edicion manual nunca sobrescribe el original (tabla `manual_edits`).
