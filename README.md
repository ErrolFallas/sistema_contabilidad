# DocScan Finance CR

Plataforma documental contable para Costa Rica. Procesa facturas (PDF, imagen) recibidas por Google Drive, Gmail o carga manual: las lee con OCR, las interpreta con IA, las valida aritmeticamente, las anota en una hoja Excel de Reintegro de Caja Chica y permite consultarlas en lenguaje natural desde un panel web.

## Documentos guia (para humanos)

| Archivo | Cuando leerlo |
|---|---|
| [`INSTALACION.md`](INSTALACION.md) | **Primer uso**: clonaste el repo y queres dejar todo corriendo de cero. |
| [`INICIO-RAPIDO.md`](INICIO-RAPIDO.md) | **Ya lo instalaste**: queres volver a abrir el sistema un dia despues, una semana despues, etc. |
| [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md) | Lista viva de items completados e ideas futuras. Marca `[x]`/`[ ]`. |
| [`backend/README.md`](backend/README.md) | Detalle tecnico del backend (endpoints, servicios, modelo de datos). |
| [`frontend/README.md`](frontend/README.md) | Detalle tecnico del frontend (rutas, componentes, patrones). |
| [`n8n-workflows/README.md`](n8n-workflows/README.md) | Como importar y activar los workflows de n8n. |

## Que hace en una vista

```
Drive / Gmail / Carga manual
        |
        v
   n8n (cron 40s)  ─► Backend Node.js ─┬─► OCR (tesseract o pdf-parse)
                                       │
                                       ├─► IA (extraccion estricta + clasificacion IVA)
                                       │
                                       ├─► Validacion aritmetica (subtotal+IVA=total)
                                       │
                                       ├─► MySQL (auditoria completa)
                                       │
                                       ├─► Excel (Reintegro de Caja Chica)
                                       │
                                       ├─► Indexado para busqueda inteligente
                                       │
                                       └─► Hacienda CR (tipo de cambio diario)
                                       v
                                React + Tailwind (UI)
```

## Stack

| Capa | Tecnologia |
|---|---|
| Backend | Node.js 20+ / Express |
| Frontend | React 19 + Vite + TailwindCSS v3 |
| Base de datos | MySQL Server nativo Windows |
| Automatizacion | n8n (instalado por npm fuera del repo) |
| IA | Gemini (tier gratuito de Google AI Studio) - extraccion + embeddings + chat |
| OAuth | Google OAuth 2.0 (Drive + Gmail) |
| Tipo cambio | API publica del Ministerio de Hacienda CR |
| Logs | pino + pino-pretty |
| Tests | vitest + supertest (backend), vitest + @testing-library (frontend) |

**No usamos** PHP, phpMyAdmin, Docker, otras IAs distintas de Gemini, ni motores OCR distintos a Tesseract. Excel es solo reporte; MySQL es la fuente unica de verdad.

## Estructura

```
proyecto_contabilidad/
├── README.md                  este archivo
├── INSTALACION.md             guia primera vez
├── INICIO-RAPIDO.md           guia retomar sesion
├── TAREAS-PENDIENTES.md       roadmap + items completados
├── backend/                   API Express + MySQL + servicios
├── frontend/                  React + Vite + Tailwind (UI)
└── n8n-workflows/             JSON importables: DriveIngest, GmailIngest, TipoCambioBCCR
```

## Secciones de la UI (http://localhost:5173)

Para todos los usuarios autenticados:

| Seccion | Ruta | Que hace |
|---|---|---|
| **Panel principal** | `/` | Vista rapida: contadores por estado, IVA por tarifa, top proveedores, evolucion mensual, tipo de cambio del dia. |
| **Gestion documental** | `/documents` | Lista de facturas, filtros, subir manualmente, abrir el detalle de cada una. |
| **Consulta inteligente** | `/rag` | Preguntar al sistema en espanol sobre las facturas; la IA responde citando las facturas usadas. |
| **Trazabilidad** | `/traceability` | Vista global del estado de cada factura en el pipeline (lectura -> IA -> validacion -> Excel). |
| **Mi cuenta** | `/profile` | Tus datos y cambio de password. |

Solo para ADMIN:

| Seccion | Ruta | Que hace |
|---|---|---|
| Registrar usuario | `/admin/users/new` | Crear cuentas para el equipo (USUARIO o ADMIN). |
| Gestionar usuarios | `/admin/users` | Editar nombre, rol y estado; maximo 3 ADMIN activos. |
| Conexion Google | `/admin/google` | Conectar Drive + Gmail, tipo de cambio, mantenimiento de archivos. |

> El **Chatbot contable** (`/chatbot`) esta oculto del menu hasta que el modulo se implemente. Ver [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md).

## Reglas inviolables

- **IA solo extrae lo visible.** Prohibido inventar, inferir, estimar, completar, aproximar o corregir. Campos no presentes = `null`. Edicion humana queda en `manual_edits`.
- **OCR no se modifica** despues de persistido (`raw_ocr` es inmutable).
- **MySQL es la fuente unica.** Excel es solo reporte y debe regenerarse si la fuente cambia.
- **Dedup por hash + numero de factura.** Si re-escaneas la misma factura, queda como `DUPLICATE`. Si el original fue eliminado, el rescan se procesa normalmente.
- **n8n solo orquesta** (cron + HTTP). Nunca toca MySQL, OCR, IA ni Excel directamente.
- **Conversion monetaria no se recalcula** sobre facturas viejas (snapshot inmutable).
- **Maximo 3 administradores** activos al mismo tiempo.
- **Validaciones aritmeticas no corrigen.** Si subtotal+IVA != total, el sistema marca la invoice como `REVISION` pero deja los valores extraidos intactos.

## Comandos rapidos

```powershell
# Backend
cd backend; npm run dev            # puerto 3000
cd backend; npm test               # corre 32 tests

# Frontend
cd frontend; npm run dev           # puerto 5173
cd frontend; npm test              # 4 tests UI

# n8n (instalado en C:\n8n-runtime - fuera del repo)
cd C:\n8n-runtime; .\node_modules\.bin\n8n start   # puerto 5678
```

## Salud del sistema

`GET http://localhost:3000/api/health` devuelve el estado:

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

## Seguridad: nada de secretos en el repo

El `.env` real esta en `.gitignore`. Si abris el repo y no ves credenciales, **es asi a proposito**. Tenes que crearlas siguiendo [`INSTALACION.md`](INSTALACION.md). Si necesitas rotarlas en algun momento, ver la seccion "Hardening" de [`TAREAS-PENDIENTES.md`](TAREAS-PENDIENTES.md).
