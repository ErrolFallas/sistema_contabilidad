# INSTALACION - DocScan Finance CR

Guia completa para clonar el repositorio y dejar la plataforma corriendo de cero.
Pensada para alguien que descarga el proyecto por primera vez.

> **Importante de seguridad**
> Este repositorio NO contiene credenciales reales. Todos los secretos
> (passwords, API keys, tokens OAuth, token de n8n) viven SOLO en archivos
> `.env` locales que estan en `.gitignore`. Si abre el repo y no ve sus
> claves, es porque debe crearlas siguiendo esta guia.

---

## 1. Requisitos previos

Instale primero estos componentes (todos gratis):

| Software | Version minima | Donde |
|---|---|---|
| **Node.js** | 20+ | https://nodejs.org (descargue LTS) |
| **MySQL Server** | 8.x nativo Windows | https://dev.mysql.com/downloads/installer/ |
| **MySQL Workbench** | ultima | viene en el mismo instalador de MySQL |
| **Git** | cualquiera reciente | https://git-scm.com/download/win |
| **Cuenta Google** | personal | para Drive, Gmail, Gemini |
| (Opcional) **VS Code** | ultima | editor recomendado |

Verifique en PowerShell que cada uno funciona:

```powershell
node --version       # debe ser >= v20
npm --version
git --version
mysql --version
```

No se requiere Docker, ni PHP, ni phpMyAdmin, ni servicios de pago.

---

## 2. Clonar el repositorio

```powershell
cd C:\donde\quiera\tener\el\proyecto
git clone <URL-del-repo> proyecto_contabilidad
cd proyecto_contabilidad
```

Estructura que vera al clonar:

```
proyecto_contabilidad/
├── backend/                 API Express + MySQL + servicios
├── frontend/                React + Vite + Tailwind (UI)
├── n8n-workflows/           JSON de workflows para importar en n8n
├── README.md                Vision general
├── SETUP.md                 Guia tecnica detallada
├── ROADMAP.md               Trabajo pendiente
└── INSTALACION.md           Este archivo
```

---

## 3. Obtener las credenciales (todas gratis)

Antes de configurar `.env`, abra cuentas y obtenga estos 3 paquetes de claves:

### 3.1 GEMINI_API_KEY (Google AI Studio)

1. Vaya a https://aistudio.google.com/app/apikey con su cuenta Google.
2. Click **Create API key**.
3. Copie el valor (`AIzaSy...`). Lo pegara en el `.env` mas adelante.

### 3.2 Google OAuth (Drive + Gmail)

1. Vaya a https://console.cloud.google.com/
2. Cree un proyecto nuevo (o use uno existente).
3. **APIs & Services -> Library** -> habilite:
   - `Google Drive API`
   - `Gmail API`
4. **APIs & Services -> OAuth consent screen**:
   - User type: `External`.
   - En `Testing` agregue su correo como Test user.
   - Scopes minimos: `auth/drive.readonly`, `auth/gmail.modify`.
5. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   - Application type: `Web application`.
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Anote `Client ID` y `Client Secret` (los pondra en `.env`).

### 3.3 Generar secretos locales

Estos los genera USTED, deben ser cadenas largas y aleatorias:

- `JWT_SECRET` - cualquier string de 32+ caracteres aleatorios.
- `N8N_INGEST_TOKEN` - otra cadena aleatoria, distinta a la anterior.

Comando rapido en PowerShell para generar uno:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | % {[char]$_})
```

Ejecutelo dos veces (una para JWT_SECRET, otra para N8N_INGEST_TOKEN).

---

## 4. Configurar el backend (`backend/.env`)

```powershell
cd backend
copy .env.example .env
npm install
```

Abra `backend/.env` y complete TODOS estos campos:

```env
# Base de datos (4.1 mas abajo)
DB_PASSWORD=<una password fuerte propia que usted definira en MySQL>

# IA
GEMINI_API_KEY=<la key de 3.1>

# Google OAuth
GOOGLE_CLIENT_ID=<el client id de 3.2>
GOOGLE_CLIENT_SECRET=<el client secret de 3.2>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Tokens locales (de 3.3)
JWT_SECRET=<cadena aleatoria larga>
N8N_INGEST_TOKEN=<otra cadena aleatoria larga>

# Admin bootstrap (se usa solo en el primer arranque, luego cambielo en la UI)
BOOTSTRAP_ADMIN_EMAIL=admin@docscan.local
BOOTSTRAP_ADMIN_PASSWORD=<una password temporal fuerte>
```

> El backend ahora valida estos secretos al arrancar y se **niega a iniciar**
> si `DB_PASSWORD`, `JWT_SECRET` o `N8N_INGEST_TOKEN` estan vacios.

---

## 5. Crear la base de datos MySQL

Esto se hace UNA sola vez en MySQL Workbench como `root`.

### 5.1 Editar el script SQL con su password

Abra `backend/src/db/migrations/000_create_user_and_db.sql`.
Busque la linea:

```sql
IDENTIFIED BY '__REEMPLAZAR_CON_DB_PASSWORD_DEL_ENV__';
```

Reemplace el placeholder por la MISMA password que puso en `DB_PASSWORD`
de `backend/.env`. Tienen que coincidir exactamente.

> No haga commit del archivo con su password real. Es solo edicion local.

### 5.2 Ejecutar el script

1. Abra MySQL Workbench.
2. Conectese como `root`.
3. `File -> Open SQL Script`, seleccione `backend/src/db/migrations/000_create_user_and_db.sql`.
4. Ejecute todo (rayo grande arriba).

Esto crea la base `docscan_finance` y el usuario `app_user@localhost`.

### 5.3 Aplicar migraciones y seed

Vuelva a la carpeta `backend` y ejecute:

```powershell
npm run db:migrate
npm run db:seed
```

`db:migrate` crea las tablas. `db:seed` crea el usuario ADMIN inicial con
las credenciales de `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

---

## 6. Configurar el frontend (`frontend/.env`)

```powershell
cd ..\frontend
copy .env.example .env
npm install
```

El `frontend/.env` solo necesita la URL del backend, ya viene apuntando
a `http://localhost:3000`. Si su backend correra en otro puerto, ajustelo.

---

## 7. Instalar n8n fuera del proyecto

n8n debe instalarse FUERA de OneDrive / del repo (la sincronizacion de
OneDrive rompe los locks de npm). Use una carpeta fuera de OneDrive,
por ejemplo `C:\n8n-runtime`:

```powershell
mkdir C:\n8n-runtime
cd C:\n8n-runtime
npm init -y
npm install n8n --legacy-peer-deps
```

---

## 8. Arrancar los 3 servicios

Abra **3 terminales PowerShell** en paralelo.

### Terminal A - Backend (puerto 3000)

```powershell
cd C:\ruta\al\proyecto\backend
npm run dev
```

Verifique: abra http://localhost:3000/api/health y debe responder JSON con
`checks.mysql = "ok"`.

### Terminal B - Frontend (puerto 5173)

```powershell
cd C:\ruta\al\proyecto\frontend
npm run dev
```

Verifique: abra http://localhost:5173 y debe ver la pantalla de login.

### Terminal C - n8n (puerto 5678)

```powershell
cd C:\n8n-runtime
.\node_modules\.bin\n8n start
```

Verifique: abra http://localhost:5678 y cree su usuario admin de n8n.

---

## 9. Importar los workflows de n8n

1. Abra http://localhost:5678 y entre con su usuario admin de n8n.
2. Click **+ Add workflow** -> los tres puntos arriba a la derecha -> **Import from File**.
3. Seleccione uno de los 3 JSON de `proyecto_contabilidad/n8n-workflows/`:
   - `DriveIngest.json` - poll a Google Drive cada 40s.
   - `GmailIngest.json` - poll a Gmail cada 40s.
   - `TipoCambioBCCR.json` - consulta el tipo de cambio diario a las 08:00.
4. **OBLIGATORIO en cada workflow**: abra el nodo `POST /api/integrations/...`
   y en el header `X-N8N-Token` reemplace el placeholder
   `REEMPLAZAR_CON_N8N_INGEST_TOKEN_DE_BACKEND_ENV` por el valor real de
   `N8N_INGEST_TOKEN` que puso en `backend/.env`.
5. Active cada workflow con el toggle de arriba a la derecha.

Si no cambia el token, el backend rechazara las llamadas con 401.

---

## 10. Primer login y conexion de Google

1. Vaya a http://localhost:5173.
2. Entre con el correo y password de `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
3. Cambie la password del admin desde **Administracion -> Gestionar usuarios**
   (recomendado antes de cualquier otra cosa).
4. Vaya a **Administracion -> Conexion Google**.
5. Click **Conectar Google** y autorice Drive + Gmail con la cuenta que
   contiene las facturas.
6. Click **Crear / verificar estructura** para que el sistema arme la
   jerarquia `/DocScanFinanceCR/{Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal}`
   en Drive.

---

## 11. Secciones de la pagina web

Una vez logueado, la barra lateral muestra estas secciones (URLs relativas
a http://localhost:5173):

### Para todos los usuarios

| Seccion | Ruta | Que hace |
|---|---|---|
| **Dashboard** | `/` | Resumen: estado del sistema, contadores, salud del backend. |
| **Gestion documental** | `/documents` | Lista todas las facturas procesadas, subir archivos manualmente, ver detalle por documento (`/documents/:id`). |
| **Consulta RAG** | `/rag` | Busqueda semantica sobre el contenido OCR y XML de las facturas (Fase 2). |
| **Chatbot contable** | `/chatbot` | Asistente conversacional que traduce preguntas a SQL parametrizado seguro (Fase 2). |
| **Trazabilidad** | `/traceability` | Timeline por documento mostrando cada etapa del pipeline (OCR -> IA -> BD -> Excel) (Fase 2). |

### Solo para ADMIN (aparece la sub-seccion "Administracion")

| Seccion | Ruta | Que hace |
|---|---|---|
| **Registrar usuario** | `/admin/users/new` | Alta de un nuevo usuario (USUARIO o ADMIN) con correo, nombre y password temporal. |
| **Gestionar usuarios** | `/admin/users` | Listar, editar, activar/desactivar y cambiar rol de usuarios. Limite global: maximo 3 ADMIN simultaneos. |
| **Conexion Google** | `/admin/google` | Conectar/desconectar la cuenta Google, crear/verificar la estructura de carpetas en Drive y disparar polls manuales de Drive y Gmail. |

### Login y rutas publicas

| Ruta | Que hace |
|---|---|
| `/login` | Pantalla de login. Unica ruta publica. No hay registro publico: solo un admin crea usuarios. |

---

## 12. Comandos rapidos (cheat sheet)

```powershell
# Backend
cd backend
npm run dev            # arranque con nodemon, hot reload, puerto 3000
npm start              # produccion
npm run db:migrate     # aplica nuevas migraciones SQL
npm run db:seed        # crea/actualiza el admin bootstrap

# Frontend
cd frontend
npm run dev            # Vite dev server, puerto 5173
npm run build          # build de produccion en dist/
npm run preview        # sirve el build

# n8n
cd C:\n8n-runtime
.\node_modules\.bin\n8n start   # interfaz en http://localhost:5678

# Salud del sistema
curl http://localhost:3000/api/health
```

---

## 13. Resolucion de problemas frecuentes

| Sintoma | Causa probable | Solucion |
|---|---|---|
| Backend no arranca, dice "Variables obligatorias ausentes en .env" | Falta `DB_PASSWORD`, `JWT_SECRET` o `N8N_INGEST_TOKEN` en `backend/.env` | Complete los valores y reinicie. |
| `/api/health` muestra `mysql: "fail"` | Password de `.env` no coincide con la del usuario `app_user` en MySQL | Verifique que `DB_PASSWORD` del `.env` == password del `CREATE USER` en el SQL. |
| n8n da 401 al hacer poll | El workflow JSON tiene el placeholder, no el token real | Edite el nodo HTTP Request y ponga el `N8N_INGEST_TOKEN` real. |
| Frontend no se conecta al backend | Puerto distinto o CORS | Verifique que el backend este en `:3000` o ajuste `VITE_API_BASE_URL` en `frontend/.env`. |
| n8n falla con `ECOMPROMISED Lock compromised` | Esta instalado dentro de OneDrive | Reinstale en `C:\n8n-runtime` (fuera de OneDrive). |
| Login dice "credenciales invalidas" en primer arranque | No corrio `npm run db:seed` | Ejecute `npm run db:seed` desde `backend/`. |

---

## 14. Que NUNCA debe hacer

- **Nunca** commitear archivos `.env` reales. El `.gitignore` raiz los bloquea, pero verifique con `git status` antes de cada commit.
- **Nunca** commitear el SQL de bootstrap (`000_create_user_and_db.sql`) con su password real. Edite localmente, no haga commit con el valor reemplazado.
- **Nunca** poner el `N8N_INGEST_TOKEN` real dentro de los JSON de `n8n-workflows/`. El token va en `.env` y se inyecta en el workflow desde la UI de n8n cuando se importa.
- **Nunca** subir la carpeta `.claude/` ni `npm-cache/` (estan ignoradas).
- **Nunca** usar la password de bootstrap (`BOOTSTRAP_ADMIN_PASSWORD`) en produccion mas alla del primer login. Cambiela inmediatamente desde la UI.
- **Nunca** compartir las API keys de Gemini o de Google OAuth en chats, screenshots ni issues publicos. Si se filtra alguna, revoquela y genere una nueva.

---

## 15. Si va a desplegar fuera de localhost

Cosas a cambiar antes de exponer la app a internet:

1. `GOOGLE_REDIRECT_URI` en `.env` y en Google Cloud Console.
2. `BACKEND_BASE_URL` en `backend/.env`.
3. `VITE_API_BASE_URL` en `frontend/.env`.
4. URLs en los workflows de n8n (`http://localhost:3000/...` -> URL publica).
5. Regenerar TODOS los secretos (`JWT_SECRET`, `N8N_INGEST_TOKEN`, `DB_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`).
6. Verificar HTTPS, firewall, backups de MySQL, rate limits.

---

## 16. Documentos relacionados

- [`README.md`](README.md) - vision general del sistema y reglas inviolables.
- [`SETUP.md`](SETUP.md) - guia tecnica detallada (incluye estructura completa del proyecto).
- [`ROADMAP.md`](ROADMAP.md) - pendientes y futuras fases.
- [`backend/README.md`](backend/README.md) - detalle tecnico del backend.
- [`frontend/README.md`](frontend/README.md) - detalle tecnico del frontend.
- [`n8n-workflows/README.md`](n8n-workflows/README.md) - como importar y activar los workflows.
