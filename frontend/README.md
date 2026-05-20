# Frontend - DocScan Finance CR

SPA en React + Vite + TailwindCSS que consume la API REST del backend.

## Que hace

- Login con JWT y sesion persistida en `localStorage`.
- Rutas protegidas por rol (ADMIN / USUARIO).
- Modulos visibles segun rol.
- Sidebar colapsable en desktop, overlay en mobile.
- Auto-refresh de datos via react-query (5-15 s segun pagina).

| Modulo (en orden del sidebar) | Ruta | Para quien |
|---|---|---|
| Panel principal | `/` | todos |
| Gestion documental | `/documents` | todos |
| Detalle de documento | `/documents/:id` | todos |
| Consulta inteligente (RAG) | `/rag` | todos |
| Trazabilidad | `/traceability` | todos |
| Mi cuenta | `/profile` | todos |
| Registrar usuario | `/admin/users/new` | ADMIN |
| Gestionar usuarios | `/admin/users` | ADMIN |
| Conexion Google | `/admin/google` | ADMIN |

**Modulo oculto del sidebar:** `Chatbot contable` (ruta `/chatbot` existe con placeholder; el link esta comentado en `AppLayout.jsx` hasta que el modulo se implemente).

## Estructura

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── vitest.config.js
├── tests/
│   ├── setup.js                   importa jest-dom y stub de matchMedia
│   └── LoginPage.test.jsx         4 tests de LoginPage (render, validacion, login, error)
├── .env.example
└── src/
    ├── main.jsx                    arranque React + QueryClient + AuthProvider
    ├── App.jsx                     definicion de rutas
    ├── index.css                   tailwind base
    ├── services/
    │   └── api.js                  axios + JWT interceptor + redirect 401 -> /login
    ├── auth/
    │   ├── AuthContext.jsx         user, login, logout, me en GET /api/auth/me
    │   └── ProtectedRoute.jsx      bloqueo por sesion + rol
    ├── layouts/
    │   └── AppLayout.jsx           sidebar (colapsable en desktop, overlay en mobile) + outlet
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx       cards + 4 graficos (recharts) + errores recientes + ultimos docs
        ├── DocumentsPage.jsx       filtros, drag&drop, lista con scroll sticky, eliminar, reset, bulk delete
        ├── DocumentDetailPage.jsx  factura editable + lineas editables + validaciones cruzadas + historial de cambios + ubicacion Excel + OCR + timeline + reprocesar
        ├── TraceabilityPage.jsx    vista global con filtros + tabla sticky + panel de stats
        ├── RagPage.jsx             buscador semantico con respuesta + fuentes citadas + estado del indice + reindexar (admin)
        ├── ProfilePage.jsx         datos personales + cambiar password propio
        ├── UsersAdminPage.jsx      tabla usuarios + modal de edicion + limite 3 ADMIN
        ├── RegisterUserPage.jsx    formulario nuevo usuario
        ├── GoogleAdminPage.jsx     OAuth Google + estructura Drive + polls manuales + tipo de cambio + mantenimiento de almacenamiento (limpieza + huerfanos)
        └── Placeholder.jsx         pagina para modulos pendientes (chatbot)
```

## Como poner en marcha

### Requisitos previos

- Node.js 20+
- Backend corriendo en `http://localhost:3000`

### Instalacion

```powershell
cd frontend
npm install
cp .env.example .env
```

### Arrancar

```powershell
npm run dev      # Vite dev server, hot reload, puerto 5173
```

### Build de produccion

```powershell
npm run build    # genera dist/
npm run preview  # sirve dist/ en :5173 para probar
```

### Tests

```powershell
npm test            # corre una vez
npm run test:watch  # watch mode
```

## Variables de entorno (`.env`)

| Variable | Para que |
|---|---|
| `VITE_API_BASE_URL` | URL del backend. Default `http://localhost:3000` |

Solo variables con prefijo `VITE_` se exponen al cliente.

**No** pongas aqui ningun secreto. Las API keys (Gemini, Google OAuth, JWT) viven solo en el backend.

## Stack y librerias

| Tecnologia | Uso |
|---|---|
| React 19 | UI |
| Vite | bundler + dev server |
| TailwindCSS v3 | sistema de estilos |
| react-router-dom v7 | rutas |
| @tanstack/react-query | cache, refetch, mutations |
| axios | HTTP |
| zustand | (disponible para estado global, aun no usado) |
| react-hook-form + zod | formularios validados |
| recharts | graficos del dashboard |
| vitest + @testing-library/react + jsdom + user-event | tests UI |

## Patrones que se siguen

- **Cliente axios unico** en `services/api.js`. Interceptor de request agrega `Authorization: Bearer <token>`. Interceptor de response: si llega 401, limpia token y redirige a `/login`.
- **AuthContext** lee `/api/auth/me` al montar la app y mantiene `{ user, loading, login, logout }`. Provee al resto.
- **ProtectedRoute** envuelve rutas: si no hay sesion redirige a `/login`; si requiere rol y el usuario no lo tiene, muestra "Sin permiso".
- **React Query** para todas las lecturas. `staleTime` y `refetchInterval` cuando aplica (dashboard 15 s, listado documentos 5 s, traceability 5 s, trace 4 s).
- **Mutations** con `useMutation` para POST/PATCH/DELETE; en `onSuccess` invalidan queries afectadas.
- **Formularios** con `useForm` + `zodResolver`. Validacion del lado cliente identica al schema zod del backend. Forms con `noValidate` para que Zod controle todo.
- **Tablas largas** usan `overflow-auto` + `min-w-[Xrem]` con `sticky top-0` en thead y `sticky right-0` en columna de acciones. Border-separate + border-spacing-0 para que sticky funcione bien con borders.
- **Sidebar colapsable**: estado `sidebarCollapsed` en `AppLayout`, persistido en `localStorage`. Boton chevron-left dentro del header del sidebar para colapsar, boton flotante semitransparente en el borde izquierdo para reabrir.
- **Responsive**: breakpoint en `lg` (1024px). Bajo eso, sidebar es overlay con backdrop y body-scroll-lock. Padding de paginas pasa de `p-6` a `p-4 md:p-6`.

## Flujos importantes

### Login

1. Usuario llena `LoginPage` con email + password.
2. `useAuth().login(email, password)` -> `POST /api/auth/login`.
3. Backend devuelve JWT + objeto user.
4. Token se guarda en `localStorage.docscan_token`.
5. AuthContext actualiza estado, se redirige a la ruta solicitada o `/`.

### Subir documento (carga manual)

1. En `/documents`, drag & drop o seleccionar PDF/JPG/PNG.
2. Mutation -> `POST /api/documents/upload` con `multipart/form-data` y timeout 3 min.
3. Mientras procesa, la lista se sigue refrescando cada 5 s para mostrar el estado.
4. Cuando termina, el resultado se muestra arriba: status, invoice_id, fila Excel.

### Conectar Google (admin)

1. ADMIN -> sidebar -> "Conexion Google".
2. Click "Conectar Google" -> backend genera authorize URL y la abre en nueva pestana.
3. Usuario autoriza Drive + Gmail en Google.
4. Google redirige al backend `/api/auth/google/callback` -> guarda `refresh_token` en MySQL.
5. La UI hace polling cada 10 s a `/api/auth/google/status` y refleja "Conectado".

### Consulta inteligente (RAG)

1. Usuario escribe pregunta en `/rag` (max 1000 chars) y presiona "Preguntar".
2. Mutation -> `POST /api/rag/query` con timeout 90 s.
3. Backend embedde la pregunta, busca top-K chunks por similitud cosine, pasa contexto a Gemini.
4. Respuesta se renderiza arriba con las fuentes citadas (link a `/documents/:id` por cada doc usado).
5. Historial de consultas recientes se actualiza en panel debajo.

### Edicion auditada (admin)

1. En `/documents/:id` ADMIN ve botones "Editar" en la card de factura y arriba de la tabla de lineas.
2. Click "Editar" -> inputs editables, campo "Razon del cambio" obligatorio.
3. Click "Guardar" -> mutation con diff respecto al valor actual + razon -> `PATCH /api/invoices/:id` o `/api/invoice-lines/:id`.
4. Backend valida, persiste en `manual_edits` (no pisa el valor original) y actualiza la tabla.
5. La card "Historial de cambios" muestra cada edit con diff rojo/verde + razon + autor + fecha.

### Reprocesar documento (admin)

1. Boton "Reprocesar" arriba a la derecha en `/documents/:id`.
2. Confirmacion -> mutation `POST /api/documents/:id/reprocess`.
3. Backend borra rastros previos (raw_ocr, ai_extractions, invoices, lines, mapping, trace) y vuelve a correr todo el pipeline contra el mismo archivo.
4. UI se invalida y muestra el nuevo resultado.

### Eliminar todos (admin)

Triple cerradura:
1. Solo ADMIN ve el boton.
2. `confirm()` describe consecuencias.
3. `prompt()` exige escribir literalmente `ELIMINAR`.
4. Backend exige header `X-Confirm-Bulk-Delete: ELIMINAR`.

### Cambiar password propio

1. Click en el footer del sidebar (nombre del usuario) -> `/profile`.
2. Formulario: password actual + nuevo + confirmar.
3. Validacion cliente con zod (min 8 chars, confirma matches, nuevo != actual).
4. Mutation -> `PATCH /api/auth/password`.
5. La sesion actual sigue valida; el cambio surtiria efecto en el proximo login.

## Reglas que el frontend respeta

- Nunca guarda passwords ni tokens fuera de `localStorage.docscan_token`.
- Nunca expone API keys.
- No permite crear usuarios cuando ya hay 3 ADMIN.
- No permite que un admin se degrade a si mismo ni se desactive.
- En la edicion de usuarios, el rol y el switch de activo aparecen deshabilitados para la propia cuenta.
- En documentos: solo ADMIN ve los botones de eliminar, reset y reprocesar.

## Restricciones

- No hay registro publico de usuarios. Solo un ADMIN crea usuarios.
- No se permite multi-tab login con sesiones distintas en el mismo navegador (mismo `localStorage`).
- Si el JWT expira (default 8 h) el siguiente request devuelve 401 y la app redirige a `/login`.

## Como agregar un nuevo modulo

1. Crear pagina en `src/pages/<NombrePage>.jsx`.
2. Registrar la ruta en `src/App.jsx` dentro del `<Route element={<AppLayout/>}>`.
3. Agregar `<NavLink>` en `src/layouts/AppLayout.jsx`.
4. Si requiere rol, envolver con `<ProtectedRoute roles={['ADMIN']}>`.
5. Si necesita data del backend, usar `useQuery` con queryKey unico.
6. Para tablas grandes, seguir el patron sticky header + sticky action column ya implementado en `/documents` y `/traceability`.

## Build y deploy

- `npm run build` genera `dist/` con assets cacheables.
- Servir `dist/` con cualquier servidor estatico (nginx, apache, vite preview).
- En produccion, ajustar `VITE_API_BASE_URL` a la URL real del backend.
- El backend ya tiene `cors: true`, pero en produccion conviene limitar origenes (ver TAREAS-PENDIENTES.md).

## Notas

- Tailwind v3 (no v4). Configuracion en `tailwind.config.js`.
- React 19. Strict Mode activado (puede causar doble render en dev, normal).
- Imports relativos con extension `.jsx` explicita.
- Status badges, source types, stages del pipeline (`COMPLETED`, `DRIVE`, `OCR_DONE`, etc.) se muestran en mayusculas inglesas porque son valores tecnicos del modelo de datos. Los textos descriptivos (titulos, subtitulos, mensajes) estan en espanol.
