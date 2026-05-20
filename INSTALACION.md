# INSTALACION - DocScan Finance CR

Guia completa para clonar el repositorio y dejar la plataforma corriendo de cero.
Pensada para alguien que descarga el proyecto por primera vez.

> Si **ya** instalaste todo y solo queres volver a abrir el sistema dias despues,
> usa [`INICIO-RAPIDO.md`](INICIO-RAPIDO.md) en su lugar.

> **Importante de seguridad**
> Este repositorio NO contiene credenciales reales. Todos los secretos
> (passwords, API keys, tokens OAuth, token de n8n) viven SOLO en archivos
> `.env` locales que estan en `.gitignore`. Si abris el repo y no ves tus
> claves, es porque tenes que crearlas siguiendo esta guia.

---

## 1. Requisitos previos

Instala primero estos componentes (todos gratis):

| Software | Version minima | Donde |
|---|---|---|
| **Node.js** | 20+ | https://nodejs.org (descarga LTS) |
| **MySQL Server** | 8.x nativo Windows | https://dev.mysql.com/downloads/installer/ |
| **MySQL Workbench** | ultima | viene en el mismo instalador de MySQL |
| **Git** | cualquiera reciente | https://git-scm.com/download/win |
| **Cuenta Google** | personal | para Drive, Gmail, IA |
| (Opcional) **VS Code** | ultima | editor recomendado |

Verifica en PowerShell que cada uno funciona:

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

Estructura que veras al clonar:

```
proyecto_contabilidad/
├── README.md                  Vision general
├── INSTALACION.md             Este archivo
├── INICIO-RAPIDO.md           Para reabrir el sistema despues
├── TAREAS-PENDIENTES.md       Roadmap y mejoras
├── backend/                   API Express + MySQL + servicios
├── frontend/                  React + Vite + Tailwind (UI)
└── n8n-workflows/             JSON de workflows para importar en n8n
```

---

## 3. Obtener las credenciales (todas gratis)

Antes de configurar `.env`, abri cuentas y conseguí estos paquetes de claves:

### 3.1 GEMINI_API_KEY (Google AI Studio)

1. Anda a https://aistudio.google.com/app/apikey con tu cuenta Google.
2. Click **Create API key**.
3. Copia el valor (`AIzaSy...`). Lo vas a pegar en el `.env` mas adelante.

Esta misma API key te sirve para tres cosas dentro del sistema (extraccion, busqueda inteligente y respuestas en lenguaje natural). No hace falta otra.

### 3.2 Google OAuth (Drive + Gmail)

1. Anda a https://console.cloud.google.com/
2. Crea un proyecto nuevo (o usa uno existente).
3. **APIs & Services -> Library** -> habilita:
   - `Google Drive API`
   - `Gmail API`
4. **APIs & Services -> OAuth consent screen**:
   - User type: `External`.
   - En `Testing` agrega tu correo como Test user (mientras la app esta en modo testing los refresh tokens duran 7 dias).
   - Scopes minimos: `auth/drive`, `auth/gmail.modify`.
5. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   - Application type: `Web application`.
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Anota `Client ID` y `Client Secret` (los vas a poner en `.env`).

### 3.3 Generar secretos locales

Estos los generas VOS, deben ser cadenas largas y aleatorias:

- `JWT_SECRET` - cualquier string de 32+ caracteres aleatorios.
- `N8N_INGEST_TOKEN` - otra cadena aleatoria, distinta a la anterior.

Comando rapido en PowerShell para generar uno:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | % {[char]$_})
```

Ejecutalo dos veces (una para JWT_SECRET, otra para N8N_INGEST_TOKEN).

---

## 4. Configurar el backend (`backend/.env`)

```powershell
cd backend
copy .env.example .env
npm install
```

Abri `backend/.env` y completa TODOS estos campos:

```env
# Base de datos (5 mas abajo)
DB_PASSWORD=<una password fuerte propia que vas a definir en MySQL>

# IA
GEMINI_API_KEY=<la key de 3.1>

# Google OAuth
GOOGLE_CLIENT_ID=<el client id de 3.2>
GOOGLE_CLIENT_SECRET=<el client secret de 3.2>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Tokens locales (de 3.3)
JWT_SECRET=<cadena aleatoria larga>
N8N_INGEST_TOKEN=<otra cadena aleatoria larga>

# Admin bootstrap (se usa solo en el primer arranque, luego cambialo en la UI)
BOOTSTRAP_ADMIN_EMAIL=admin@docscan.local
BOOTSTRAP_ADMIN_PASSWORD=<una password temporal fuerte>
```

> El backend valida estos secretos al arrancar y se **niega a iniciar** si
> `DB_PASSWORD`, `JWT_SECRET` o `N8N_INGEST_TOKEN` estan vacios.

---

## 5. Crear la base de datos MySQL

Esto se hace UNA sola vez en MySQL Workbench como `root`.

### 5.1 Editar el script SQL con tu password

Abri `backend/src/db/migrations/000_create_user_and_db.sql`.
Busca la linea:

```sql
IDENTIFIED BY '__REEMPLAZAR_CON_DB_PASSWORD_DEL_ENV__';
```

Reemplaza el placeholder por la MISMA password que pusiste en `DB_PASSWORD`
de `backend/.env`. Tienen que coincidir exactamente.

> No hagas commit del archivo con tu password real. Es solo edicion local.

### 5.2 Ejecutar el script

1. Abri MySQL Workbench.
2. Conectate como `root`.
3. `File -> Open SQL Script`, selecciona `backend/src/db/migrations/000_create_user_and_db.sql`.
4. Ejecuta todo (rayo grande arriba).

Esto crea la base `docscan_finance` y el usuario `app_user@localhost`.

### 5.3 Aplicar migraciones y seed

Volve a la carpeta `backend` y ejecuta:

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
a `http://localhost:3000`. Si tu backend correra en otro puerto, ajustalo.

---

## 7. Instalar n8n fuera del proyecto

n8n debe instalarse FUERA de OneDrive / del repo (la sincronizacion de
OneDrive rompe los locks de npm). Usa una carpeta fuera de OneDrive,
por ejemplo `C:\n8n-runtime`:

```powershell
mkdir C:\n8n-runtime
cd C:\n8n-runtime
npm init -y
npm install n8n --legacy-peer-deps
```

---

## 8. Arrancar los 3 servicios

Abri **3 terminales PowerShell** en paralelo.

### Terminal A - Backend (puerto 3000)

```powershell
cd C:\ruta\al\proyecto\backend
npm run dev
```

Verifica: abre http://localhost:3000/api/health y debe responder JSON con
`checks.mysql = "ok"`.

### Terminal B - Frontend (puerto 5173)

```powershell
cd C:\ruta\al\proyecto\frontend
npm run dev
```

Verifica: abre http://localhost:5173 y deberias ver la pantalla de login.

### Terminal C - n8n (puerto 5678)

```powershell
cd C:\n8n-runtime
.\node_modules\.bin\n8n start
```

Verifica: abri http://localhost:5678 y crea tu usuario admin de n8n (es un
admin local de n8n, no tiene nada que ver con el ADMIN de la app).

---

## 9. Importar los workflows de n8n

1. Abri http://localhost:5678 y entra con tu usuario admin de n8n.
2. Click **+ Add workflow** -> los tres puntos arriba a la derecha -> **Import from File**.
3. Selecciona uno de los 3 JSON de `proyecto_contabilidad/n8n-workflows/`:
   - `DriveIngest.json` - poll a Google Drive cada 40s.
   - `GmailIngest.json` - poll a Gmail cada 40s.
   - `TipoCambioBCCR.json` - consulta el tipo de cambio diario a las 08:00.
4. **OBLIGATORIO en cada workflow**: abri el nodo `POST /api/integrations/...`
   y en el header `X-N8N-Token` reemplaza el placeholder
   `REEMPLAZAR_CON_N8N_INGEST_TOKEN_DE_BACKEND_ENV` por el valor real de
   `N8N_INGEST_TOKEN` que pusiste en `backend/.env`.
5. Activa cada workflow con el toggle de arriba a la derecha.

Si no cambias el token, el backend rechazara las llamadas con 401.

---

## 10. Primer login y conexion de Google

1. Anda a http://localhost:5173.
2. Entra con el correo y password de `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
3. **Cambia la password del admin** desde el footer izquierdo del sidebar
   (donde ves tu nombre y rol) -> **Mi cuenta** -> cambiar password.
4. Anda a **Administracion -> Conexion Google**.
5. Click **Conectar Google** y autoriza Drive + Gmail con la cuenta que
   contiene las facturas. Vas a ser redirigido al callback OAuth y volver con
   un mensaje de exito.
6. Click **Crear / verificar estructura** para que el sistema arme la
   jerarquia `/DocScanFinanceCR/{Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal}`
   en tu Drive.

---

## 11. Secciones de la pagina web

Una vez logueado, la barra lateral muestra estas secciones (URLs relativas
a http://localhost:5173):

### Para todos los usuarios autenticados

| Seccion | Ruta | Que hace |
|---|---|---|
| **Panel principal** | `/` | Vista rapida del estado contable: contadores, IVA por tarifa, top proveedores, evolucion mensual, tipo de cambio del dia. Refresca solo. |
| **Gestion documental** | `/documents` | Subi facturas en PDF o foto. La IA las lee y las anota en tu Reintegro. Tiene filtros por estado, origen, fecha y busqueda por proveedor/numero. Cada documento abre un detalle (`/documents/:id`) con OCR, factura extraida, lineas, validaciones aritmeticas, mapeo Excel, historial de ediciones y timeline. |
| **Consulta inteligente** | `/rag` | Hacele preguntas a la IA sobre tus facturas en espanol. Por ejemplo: "¿cuales fueron mis compras de ferreteria en mayo?". Cita las facturas usadas; nunca inventa datos. |
| **Trazabilidad** | `/traceability` | Vista global del pipeline para cada documento. Filtros por estado, origen y etapa actual. Util si una factura no aparece en el Reintegro y queres saber por que. |
| **Mi cuenta** | `/profile` | Tus datos y cambio de password propio. |

### Solo para ADMIN

| Seccion | Ruta | Que hace |
|---|---|---|
| **Registrar usuario** | `/admin/users/new` | Alta de un nuevo usuario (USUARIO o ADMIN) con correo, nombre y password temporal. |
| **Gestionar usuarios** | `/admin/users` | Listar, editar, activar/desactivar y cambiar rol de usuarios. Limite global: maximo 3 ADMIN simultaneos. Un admin no puede sacarse a si mismo del rol ni desactivarse. |
| **Conexion Google** | `/admin/google` | Conectar/desconectar Google, crear/verificar estructura Drive, polls manuales, tipo de cambio diario y mantenimiento de almacenamiento (escanear archivos huerfanos, ejecutar limpieza). |

### Acciones de admin en el detalle de un documento

Adentro de `/documents/:id`, los administradores tambien pueden:

- **Editar** los campos de la factura o sus lineas (todo queda en `manual_edits`, el valor original se preserva).
- **Reprocesar** el documento (borra rastros previos y vuelve a correr OCR + IA + validacion + Excel sobre el mismo archivo; util si Gemini fallo por saturacion temporal o si queres re-evaluar con cambios en el prompt).

### Rutas publicas

| Ruta | Que hace |
|---|---|
| `/login` | Unica ruta publica. No hay registro publico: solo un admin crea usuarios. |

### Modulo oculto

- `/chatbot` - asistente conversacional con whitelist de intenciones SQL. Ruta existe con placeholder; el link del sidebar esta oculto hasta que el modulo se implemente.

---

## 12. Comandos rapidos (cheat sheet)

```powershell
# Backend
cd backend
npm run dev            # arranque con nodemon, hot reload, puerto 3000
npm start              # produccion
npm run db:migrate     # aplica nuevas migraciones SQL
npm run db:seed        # crea/actualiza el admin bootstrap
npm test               # corre 32 tests automatizados

# Frontend
cd frontend
npm run dev            # Vite dev server, puerto 5173
npm run build          # build de produccion en dist/
npm run preview        # sirve el build
npm test               # corre tests de UI

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
| Backend no arranca, dice "Variables obligatorias ausentes en .env" | Falta `DB_PASSWORD`, `JWT_SECRET` o `N8N_INGEST_TOKEN` en `backend/.env` | Completa los valores y reinicia. |
| `/api/health` muestra `mysql: "fail"` | Password de `.env` no coincide con la del usuario `app_user` en MySQL | Verifica que `DB_PASSWORD` del `.env` == password del `CREATE USER` en el SQL. |
| n8n da 401 al hacer poll | El workflow JSON tiene el placeholder, no el token real | Edita el nodo HTTP Request y pone el `N8N_INGEST_TOKEN` real. |
| Frontend no se conecta al backend | Puerto distinto o CORS | Verifica que el backend este en `:3000` o ajusta `VITE_API_BASE_URL` en `frontend/.env`. |
| n8n falla con `ECOMPROMISED Lock compromised` | Esta instalado dentro de OneDrive | Reinstalalo en `C:\n8n-runtime` (fuera de OneDrive). |
| Login dice "credenciales invalidas" en primer arranque | No corriste `npm run db:seed` | Ejecuta `npm run db:seed` desde `backend/`. |
| Una factura quedo en `REVIEW` con todo en null | Es un reporte/consolidado (no factura individual) o el OCR salio ilegible | Mira el detalle: el mensaje ambar te dice si la IA lo clasifico como `[REPORTE]` o `[OTRO]`. Si es FACTURA pero quedo en REVIEW, es porque las validaciones aritmeticas no cuadran (subtotal+IVA != total). |
| Una factura quedo en `DUPLICATE` | Ya existia otra con el mismo binario, o con el mismo `numero_factura + proveedor` | Mira el detalle, te dice cual es el documento original. Si era una version mejor del mismo archivo, eliminar el original primero y volver a subir. |
| El Excel descarga con warning de "registros recuperados" | Limitacion de ExcelJS con formatos condicionales | Los datos estan bien; aceptar el warning o pulsar "Si abrir" en Excel. |

---

## 14. Que NUNCA debe hacer

- **Nunca** commitear archivos `.env` reales. El `.gitignore` raiz los bloquea, pero verifica con `git status` antes de cada commit.
- **Nunca** commitear el SQL de bootstrap (`000_create_user_and_db.sql`) con tu password real. Edita localmente, no hagas commit con el valor reemplazado.
- **Nunca** poner el `N8N_INGEST_TOKEN` real dentro de los JSON de `n8n-workflows/`. El token va en `.env` y se inyecta en el workflow desde la UI de n8n cuando se importa.
- **Nunca** usar la password de bootstrap (`BOOTSTRAP_ADMIN_PASSWORD`) en produccion mas alla del primer login. Cambiala desde "Mi cuenta".
- **Nunca** compartir las API keys en chats, screenshots ni issues publicos. Si se filtra alguna, revocala y genera una nueva.

---

## 15. Si vas a desplegar fuera de localhost

Cosas a cambiar antes de exponer la app a internet:

1. `GOOGLE_REDIRECT_URI` en `.env` y en Google Cloud Console.
2. `BACKEND_BASE_URL` en `backend/.env`.
3. `VITE_API_BASE_URL` en `frontend/.env`.
4. URLs en los workflows de n8n (`http://localhost:3000/...` -> URL publica).
5. Regenerar TODOS los secretos (`JWT_SECRET`, `N8N_INGEST_TOKEN`, `DB_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`, las API keys).
6. Restringir CORS al dominio real (hoy `cors: true` acepta cualquier origen).
7. HTTPS + cookies con flags Secure y SameSite.
8. PM2 o systemd para mantener backend y n8n corriendo tras reinicio.
9. Backup periodico de MySQL.

Detalle de esta lista en la seccion "Hardening" de [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md).

---

## 16. Documentos relacionados

- [`README.md`](README.md) - vision general del sistema y reglas inviolables.
- [`INICIO-RAPIDO.md`](INICIO-RAPIDO.md) - guia para reabrir el sistema cuando ya esta instalado.
- [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md) - pendientes y futuras fases.
- [`backend/README.md`](backend/README.md) - detalle tecnico del backend.
- [`frontend/README.md`](frontend/README.md) - detalle tecnico del frontend.
- [`n8n-workflows/README.md`](n8n-workflows/README.md) - como importar y activar los workflows.
