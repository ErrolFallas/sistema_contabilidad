# DocScan Finance CR

Plataforma documental contable inteligente para Costa Rica. Procesa facturas (PDF, JPG, PNG, XML de Hacienda) provenientes de Google Drive, Gmail o carga manual, las extrae con OCR + IA controlada, persiste en MySQL, completa una plantilla Excel de Reintegro de Caja Chica y expone consultas, edicion auditada y trazabilidad desde un panel web.

## Vision general

```
Drive / Gmail / Carga manual
        |
        v
   n8n (cron 40 s) ---> Backend Node.js -+-> OCR (Tesseract local o pdf-parse)
                                         |
                                         +-> Gemini (extraccion estricta + clasificacion IVA)
                                         |
                                         +-> MySQL (auditoria completa)
                                         |
                                         +-> Excel (modo Reintegro)
                                         |
                                         +-> Hacienda CR (tipo de cambio diario)
                                         v
                                    React + Tailwind (UI)
```

## Stack tecnologico (Plan Maestro v2.1)

| Capa | Tecnologia |
|---|---|
| Backend | Node.js 20+ / Express |
| Backend libs | mysql2, ExcelJS, Multer, tesseract.js, pdf-parse v2, sharp, fast-xml-parser, @google/generative-ai, googleapis, axios, jsonwebtoken, bcryptjs, helmet, cors, zod |
| Frontend | React 19 + Vite + TailwindCSS v3 + React Router + @tanstack/react-query + axios + Zustand + react-hook-form + zod + recharts |
| IA | Gemini (Google AI Studio - tier gratuito) - extraccion, clasificacion IVA, RAG, chat |
| Base de datos | MySQL Server nativo Windows + MySQL Workbench |
| Automatizacion | n8n via npm install local (sin Docker) |
| OAuth | Google OAuth 2.0 (Drive + Gmail) |
| Tipo cambio | API publica del Ministerio de Hacienda CR (republica BCCR) |

**No se utiliza** PHP, phpMyAdmin, Docker/Podman/contenedores, ningun servicio IA distinto de Gemini, ningun motor OCR distinto de Tesseract local. Excel es solo reporte/exportacion; MySQL es la fuente unica de verdad.

## Estructura del repositorio

```
proyecto_contabilidad/
├── README.md                  (este archivo)
├── ROADMAP.md                 lista de pendientes para futuras sesiones
├── SETUP.md                   guia detallada de instalacion paso a paso
├── backend/
│   ├── README.md              guia tecnica backend
│   ├── package.json
│   ├── templates/             machotes Excel (Reintegro.xlsx)
│   ├── storage/               uploads/ ocr/ processed/ errors/ temp/  (git-ignored)
│   ├── .env.example           plantilla de variables (.env real esta en .gitignore)
│   └── src/
│       ├── server.js
│       ├── app.js
│       ├── config/env.js
│       ├── db/
│       │   ├── pool.js
│       │   ├── migrate.js     'npm run db:migrate'
│       │   ├── seed.js        'npm run db:seed'
│       │   └── migrations/    *.sql aplicados en orden
│       ├── middleware/
│       ├── controllers/
│       ├── routes/
│       └── services/
├── frontend/
│   ├── README.md              guia tecnica frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx, App.jsx, index.css
│       ├── services/api.js    cliente axios + JWT interceptor
│       ├── auth/              AuthContext + ProtectedRoute
│       ├── layouts/           AppLayout con sidebar
│       └── pages/             Login, Dashboard, Documents, Detail, Users, GoogleAdmin, ...
└── n8n-workflows/             JSON importables: DriveIngest, GmailIngest, TipoCambioBCCR
```

## Acceso para un usuario final

1. El administrador del sistema le entrega correo y contrasena temporal.
2. Visite **http://localhost:5173** (en entorno local) o la URL desplegada.
3. Inicie sesion. La aplicacion no permite registro publico: solo un admin puede crearle cuenta.
4. Segun su rol vera:
   - **USUARIO**: dashboard, gestion documental (subir y consultar), consulta RAG, chatbot, trazabilidad.
   - **ADMIN**: ademas registrar/gestionar usuarios, conexion Google, eliminar documentos, reiniciar Reintegro.
5. El sistema solo permite **3 administradores simultaneos**.

## Como poner en marcha en un equipo nuevo (desarrollador)

Lea [`SETUP.md`](SETUP.md) para el paso a paso completo. Resumen:

1. Instalar **Node.js 20+** y **MySQL Server** nativo Windows + MySQL Workbench.
2. Clonar el repositorio.
3. Backend:
   ```powershell
   cd backend
   npm install
   cp .env.example .env          # editar credenciales
   ```
4. En MySQL Workbench, ejecutar `backend/src/db/migrations/000_create_user_and_db.sql` como root (una sola vez) para crear la base y el usuario.
5. Aplicar migraciones y seed:
   ```powershell
   npm run db:migrate
   npm run db:seed
   npm run dev                   # backend en :3000
   ```
6. Frontend:
   ```powershell
   cd ../frontend
   npm install
   cp .env.example .env
   npm run dev                   # frontend en :5173
   ```
7. n8n (instalado fuera de la carpeta del proyecto para evitar conflictos con OneDrive):
   ```powershell
   mkdir C:\n8n-runtime
   cd C:\n8n-runtime
   npm init -y
   npm install n8n --legacy-peer-deps
   .\node_modules\.bin\n8n start  # :5678
   ```
8. Importar workflows desde `n8n-workflows/` y activarlos.

## Credenciales necesarias

Todas se obtienen gratis. Detalles en [`SETUP.md`](SETUP.md):

| Credencial | Fuente | Para que |
|---|---|---|
| GEMINI_API_KEY | https://aistudio.google.com/app/apikey | Extraccion IA |
| GOOGLE_CLIENT_ID / SECRET | https://console.cloud.google.com (OAuth 2.0 Web client) | Drive + Gmail |
| N8N_INGEST_TOKEN | Generado al instalar (cualquier string aleatorio largo) | Auth n8n -> Backend |
| JWT_SECRET | Generado al instalar (cualquier string aleatorio largo) | Sesiones JWT |
| Hacienda CR API | Publica, sin token | Tipo de cambio CRC/USD |

**Nada de esto se guarda en git**. El `.env` real esta en `.gitignore`.

## Reglas inviolables (Plan Maestro v2.1)

### Extraccion IA

- **Solo extrae lo visible**. Prohibido inventar, inferir, estimar, completar, aproximar o corregir.
- Campos no presentes en el documento -> `null`.
- Calcular aritmeticamente sobre datos visibles (ej. `monto_iva = base x tarifa/100`) **si esta permitido** porque es matematica determinista, no inferencia.

### OCR

- No corrige, interpreta, resume ni reordena. Preserva texto, saltos, orden y estructura tal cual.
- El resultado se guarda en `raw_ocr` (inmutable).
- Gemini **nunca** se usa como motor OCR.

### Persistencia

- **MySQL es la fuente unica**. Excel es solo reporte/exportacion.
- El machote Excel debe existir; si no existe, el proceso se detiene.
- Hash documental SHA256 previene duplicados entre Drive y Gmail.
- Conversion monetaria nunca recalcula historicos (snapshot inmutable por factura).

### Trazabilidad

- Cada etapa registra inicio, fin, duracion y resultado en `processing_trace`.
- Toda edicion manual queda en `manual_edits` sin sobreescribir el original.
- Esta prohibido eliminar historial; los endpoints de "eliminar documento" actuan en cascada sobre los registros del documento eliminado, pero la auditoria de Reintegros anteriores se preserva.

### Gmail

- Solo procesa correos UNREAD con adjuntos.
- Marca como leido **unicamente** si todos los adjuntos del correo se procesaron sin error.
- Si algun adjunto falla, el correo queda UNREAD para reintentarse en el siguiente poll.

### Drive

- Estructura obligatoria: `/DocScanFinanceCR/{Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal}`.
- Idempotente: si existe se reutiliza; si falta parcialmente se completa; si no existe se crea.
- Tras procesar, el archivo se mueve a `/Procesadas` o `/Errores`.

### n8n

- **Solo dispara**. Nunca toca MySQL, OCR, IA ni Excel directamente.
- Auth por header `X-N8N-Token`.
- Workflows incluidos: `DriveIngest` (40 s), `GmailIngest` (40 s), `TipoCambioBCCR` (08:00 diario).

### Usuarios y autenticacion

- JWT obligatorio para todas las rutas excepto `/api/auth/login` y el callback OAuth de Google.
- Maximo 3 administradores simultaneos.
- Un admin no puede degradarse a si mismo ni desactivar su propia cuenta.
- No se puede degradar al ultimo administrador activo.

## Restricciones formales del proyecto (extracto)

Esta prohibido:

- Usar Excel como fuente principal de datos.
- Modificar el contenido de `raw_ocr` despues de persistido.
- Sobreescribir valores originales en `invoices` o `invoice_lines` (los cambios van a `manual_edits`).
- Inferir datos de IA, recalcular historicos, releer correos ya procesados.
- Crear plantillas Excel alternativas (debe usarse el machote existente).
- Eliminar registros de auditoria.
- Usar PHP, phpMyAdmin, Docker o cualquier IA distinta de Gemini.
- Permitir SQL libre desde el chatbot (cuando se implemente: solo SELECT parametrizado con whitelist de intenciones).

## Comandos rapidos

```powershell
# Backend
cd backend
npm run dev          # nodemon hot reload, puerto 3000
npm run db:migrate   # aplica .sql en migrations/
npm run db:seed      # crea usuario ADMIN inicial

# Frontend
cd frontend
npm run dev          # Vite, puerto 5173
npm run build        # produccion

# n8n (instalado en C:\n8n-runtime para evitar OneDrive)
cd C:\n8n-runtime
.\node_modules\.bin\n8n start   # puerto 5678
```

## Salud del sistema

`GET /api/health` devuelve estado de cada dependencia:

```json
{
  "service": "docscan-finance-backend",
  "env": "development",
  "checks": {
    "mysql": "ok",
    "gemini": "configured",
    "google_oauth": "configured",
    "n8n_token": "configured"
  }
}
```

## Documentos relacionados

- [`SETUP.md`](SETUP.md) - instalacion paso a paso de cero
- [`ROADMAP.md`](ROADMAP.md) - tareas pendientes y futuras
- [`backend/README.md`](backend/README.md) - detalle tecnico del backend
- [`frontend/README.md`](frontend/README.md) - detalle tecnico del frontend
- [`n8n-workflows/README.md`](n8n-workflows/README.md) - como importar y activar los workflows
