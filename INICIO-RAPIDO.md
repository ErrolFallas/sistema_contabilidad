# INICIO RAPIDO - DocScan Finance CR

Guia para cuando **ya instalaste** el sistema una vez (siguiendo
[`INSTALACION.md`](INSTALACION.md)) y queres volver a abrirlo dias o semanas
despues. Apuntes en orden de "¿que reviso primero?".

> Si es la **primera vez** que abris el proyecto, no uses esta guia.
> Anda a [`INSTALACION.md`](INSTALACION.md).

---

## 1. Que se preserva automaticamente (no toques)

Lo bueno de estar instalado: estas cosas siguen funcionando sin reconfigurar.

| Cosa | Donde vive | Estado tras apagar la PC |
|---|---|---|
| Usuarios | MySQL (tabla `users`) | Persiste. Sigues siendo admin con la misma password. |
| Facturas procesadas | MySQL + Drive + `storage/uploads/` | Persisten. La UI las vuelve a mostrar al loguear. |
| Conexion con Google (Drive/Gmail) | MySQL (tabla `google_credentials`) | Persiste. NO hace falta reconectar. |
| Tipo de cambio diario | MySQL (tabla `currency_rates`) | Persiste; el cron diario lo actualiza solo. |
| Indice de busqueda inteligente (RAG) | MySQL (tabla `rag_documents`) | Persiste con sus embeddings. |
| Configuracion (`.env`) | Archivo local | Persiste. No tocar a menos que rotes secretos. |
| Workflows de n8n importados | SQLite de n8n (en `%USERPROFILE%\.n8n\`) | Persisten. No hay que volver a importar. |

---

## 2. Arrancar los servicios (3 terminales)

```powershell
# Terminal 1 - Backend
cd C:\ruta\al\proyecto\backend
npm run dev
# Verifica: http://localhost:3000/api/health responde con checks.mysql = "ok"

# Terminal 2 - Frontend
cd C:\ruta\al\proyecto\frontend
npm run dev
# Verifica: http://localhost:5173 muestra el login

# Terminal 3 - n8n
cd C:\n8n-runtime
.\node_modules\.bin\n8n start
# Verifica: http://localhost:5678 carga
```

> Si MySQL como servicio del SO esta detenido, arrancalo desde
> **services.msc** (busca "MySQL80") o `Start-Service MySQL80` en PowerShell
> con permisos de administrador.

---

## 3. Cosas que SI necesitas tocar al volver

### 3.1 n8n: activar los workflows

n8n **recuerda** los workflows pero su estado "activo" puede no persistir
entre reinicios de la PC, especialmente si reinstalas n8n o si crasheo. Si
los workflows aparecen con el toggle apagado:

1. Abri http://localhost:5678 y entra con el admin local de n8n.
2. Click cada uno de los workflows (`DriveIngest`, `GmailIngest`, `TipoCambioBCCR`).
3. Mira el toggle de arriba a la derecha:
   - Si esta en **Active** (verde) - todo bien, el cron esta corriendo.
   - Si esta en **Inactive** - activalo.

**Como saber que estan corriendo bien:**
- Anda a la pagina **Trazabilidad** de la app cuando subas o llegue una factura nueva: deberias ver el documento entrar al pipeline.
- En n8n: cada workflow tiene una pestana "Executions" con el historial de los polls.

### 3.2 Hard refresh del navegador

Si abriste el sistema antes en este mismo navegador, puede haber cache vieja
de Vite. Forzar recarga con **Ctrl+Shift+R**.

### 3.3 Sesion expirada en la UI

El JWT dura 8 horas. Si pasaron mas, el primer click te redirige a `/login`.
Volve a entrar.

---

## 4. Cosas que NO hace falta tocar al volver

| Tentacion | Por que NO es necesario |
|---|---|
| Volver a conectar Google | El refresh token esta en MySQL. La pagina **Administracion -> Conexion Google** debe mostrar "Conectado" desde el primer click. |
| Reindexar facturas para RAG | Los embeddings estan persistidos. Solo reindexa si cambiaste algo en el motor (ej. modelo de embedding) o si una factura quedo sin indexar (el panel lateral de `/rag` te lo dice). |
| Volver a importar los workflows de n8n | Los workflows viven en la base SQLite de n8n (`%USERPROFILE%\.n8n\database.sqlite`). Si la borraste o reinstalaste n8n, si hace falta. |
| Cambiar el `.env` | Solo si rotaste alguna credencial. La mayoria del tiempo no tocar. |
| Aplicar migraciones | Solo si bajaste una version nueva del repo con migraciones nuevas. Si lo haces, `cd backend; npm run db:migrate`. |
| Crear el usuario admin | Ya existe. Login con el correo y password que pusiste la primera vez. |

---

## 5. Saber que esta sano (orden recomendado)

Una vez que arranques los tres servicios:

1. **Backend salud**: abre http://localhost:3000/api/health
   - `mysql: "ok"` - base de datos conectada.
   - `gemini: "configured"` - clave de IA presente.
   - `google_oauth: "configured"` - credenciales OAuth en el `.env`.
   - `n8n_token: "configured"` - token compartido configurado.

2. **Frontend**: abre http://localhost:5173/login y entra con tu cuenta.
   - Si te logueas, el JWT funciona.
   - Vas al **Panel principal** y ves contadores reales > 0.

3. **Google conectado**: anda a **Administracion -> Conexion Google**.
   - Si dice "Conectado a tu-correo@gmail.com" - todo bien.
   - Click "Poll Drive ahora" o "Poll Gmail ahora" para confirmar que se puede leer.

4. **n8n activo**: http://localhost:5678 -> los 3 workflows con toggle verde.

5. **Tipo de cambio**: en **Administracion -> Conexion Google**, scroll hasta la tabla de "Tipo de cambio". Si la ultima fecha es de **hoy** o de **ayer**, el cron diario esta corriendo. Si es muy vieja, click "Consultar tipo cambio".

---

## 6. Si algo no anda

| Sintoma | Primer chequeo |
|---|---|
| El backend no arranca | Mira la terminal: ¿pide variables `.env`? ¿MySQL caido? Arranca MySQL desde **services.msc**. |
| Login falla con "credenciales invalidas" | Si nunca cambiaste el password del bootstrap, usa el de `BOOTSTRAP_ADMIN_PASSWORD` del `.env`. Si lo cambiaste y no lo recordas, mira **Resolucion** abajo. |
| Pagina lenta despues de muchos cambios | Es nodemon/Vite acumulando recargas. Cierra las 3 terminales y volve a abrirlas. Ctrl+Shift+R en el browser. |
| Una factura no aparece en el Reintegro | Anda a **Trazabilidad**, buscala. El mensaje de la etapa actual te dice por que (DUPLICATE, REVIEW por validacion, REPORTE clasificado por IA, ERROR transitorio). |
| n8n no esta procesando | http://localhost:5678 -> verifica que los workflows esten **Active**. Mira la pestaña "Executions" del workflow afectado para ver si los polls salieron con error 401 (token mal). |
| RAG dice "Todavia no hay facturas preparadas" | Anda a `/rag` y, si sos ADMIN, click "Volver a preparar todas". Indexa los embeddings de cada factura cargada. |

### Resolucion de password olvidado del admin

Si nadie del equipo recuerda la password del unico ADMIN:

```powershell
cd backend
# Edita BOOTSTRAP_ADMIN_EMAIL/PASSWORD en .env con un NUEVO email temporal
# (no el mismo, porque seed solo crea si no existe)
# Por ejemplo: BOOTSTRAP_ADMIN_EMAIL=admin2@docscan.local
npm run db:seed
# Logueate con ese nuevo correo. Despues podes:
#  - Eliminar el admin viejo desde "Gestionar usuarios"
#  - O reactivar/cambiar su password manualmente en MySQL Workbench
```

---

## 7. Apagar todo limpiamente

```
# En cada terminal: Ctrl+C
# Eso es todo. MySQL queda corriendo como servicio del SO.
```

Los procesos no dejan huellas: archivos persistidos (`storage/`, `templates/`,
MySQL, SQLite de n8n) ya estan en disco. Al volver a abrir, todo sigue donde
lo dejaste.

---

## 8. Documentos relacionados

- [`README.md`](README.md) - vision general.
- [`INSTALACION.md`](INSTALACION.md) - primera instalacion desde cero.
- [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md) - roadmap y mejoras.
- [`backend/README.md`](backend/README.md) - detalle tecnico del backend.
- [`frontend/README.md`](frontend/README.md) - detalle tecnico del frontend.
