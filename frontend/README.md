# Frontend - DocScan Finance CR

SPA en React + Vite + TailwindCSS que consume la API REST del backend. Implementa todos los modulos definidos en el Plan Maestro v2.1.

## Que hace

- Login con JWT y sesion persistida en `localStorage`.
- Rutas protegidas por rol (ADMIN / USUARIO).
- Modulos visibles segun rol.

| Modulo | Ruta | Para quien |
|---|---|---|
| Dashboard | `/` | todos |
| Gestion documental | `/documents` | todos |
| Detalle de documento | `/documents/:id` | todos |
| Consulta RAG | `/rag` | todos (placeholder) |
| Chatbot contable | `/chatbot` | todos (placeholder) |
| Trazabilidad | `/traceability` | todos (placeholder, ya esta integrada en el detalle) |
| Registrar usuario | `/admin/users/new` | ADMIN |
| Gestionar usuarios | `/admin/users` | ADMIN |
| Conexion Google | `/admin/google` | ADMIN |

## Estructura

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
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
    │   └── AppLayout.jsx           sidebar + outlet
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx
        ├── DocumentsPage.jsx       carga drag&drop, lista, eliminar, reset Reintegro, bulk delete
        ├── DocumentDetailPage.jsx  factura + lineas + OCR + mapping Excel + timeline trace
        ├── UsersAdminPage.jsx      tabla usuarios + modal de edicion
        ├── RegisterUserPage.jsx    formulario nuevo usuario
        ├── GoogleAdminPage.jsx     OAuth Google + estructura Drive + polls manuales + tipo de cambio
        └── Placeholder.jsx         pagina para modulos pendientes (RAG, chatbot, etc.)
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

## Variables de entorno (`.env`)

| Variable | Para que |
|---|---|
| `VITE_API_BASE_URL` | URL del backend. Default `http://localhost:3000` |

Solo variables con prefijo `VITE_` se exponen al cliente.

**No** ponga aqui ningun secreto. Las API keys (Gemini, Google OAuth, JWT) viven solo en el backend.

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
| recharts | (disponible para graficos del dashboard, aun no usado) |

## Patrones que se siguen

- **Cliente axios unico** en `services/api.js`. Interceptor de request agrega `Authorization: Bearer <token>`. Interceptor de response: si llega 401, limpia token y redirige a `/login`.
- **AuthContext** lee `/api/auth/me` al montar la app y mantiene `{ user, loading, login, logout }`. Provee al resto.
- **ProtectedRoute** envuelve rutas: si no hay sesion redirige a `/login`; si requiere rol y el usuario no lo tiene, muestra "Sin permiso".
- **React Query** para todas las lecturas. `staleTime` y `refetchInterval` cuando aplica (dashboard 10 s, listado documentos 5 s, trace 4 s).
- **Mutations** con `useMutation` para POST/PATCH/DELETE; en `onSuccess` invalidan queries afectadas.
- **Formularios** con `useForm` + `zodResolver`. Validacion del lado cliente identica al schema zod del backend.
- **Tablas en tablas largas** usan `overflow-x-auto` + `min-w-[Xrem]` para no cortar columnas (Gestion documental tiene scroll horizontal cuando hay muchos campos).

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

### Eliminar todos (admin)

Triple cerradura:
1. Solo ADMIN ve el boton.
2. `confirm()` describe consecuencias.
3. `prompt()` exige escribir literalmente `ELIMINAR`.
4. Backend exige header `X-Confirm-Bulk-Delete: ELIMINAR`.

## Reglas que el frontend respeta

- Nunca guarda passwords ni tokens fuera de `localStorage.docscan_token`.
- Nunca expone API keys.
- No permite crear usuarios cuando ya hay 3 ADMIN.
- No permite que un admin se degrade a si mismo ni se desactive.
- En la edicion de usuarios, el rol y el switch de activo aparecen deshabilitados para la propia cuenta.
- En documentos: solo ADMIN ve los botones de eliminar y reset.

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

## Build y deploy

- `npm run build` genera `dist/` con assets cacheables.
- Servir `dist/` con cualquier servidor estatico (nginx, apache, vite preview).
- En produccion, ajustar `VITE_API_BASE_URL` a la URL real del backend.
- El backend ya tiene `cors: true`, pero en produccion conviene limitar origenes.

## Notas

- Tailwind v3 (no v4). Configuracion en `tailwind.config.js`.
- React 19. Strict Mode activado (puede causar doble render en dev, normal).
- Imports relativos con extension `.jsx` explicita.
