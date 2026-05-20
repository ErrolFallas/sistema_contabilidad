# Workflows n8n - DocScan Finance CR

Workflows listos para importar en n8n. Implementan la seccion 14 del Plan Maestro v2.1:
**n8n solo es el cron que dispara los polls del backend cada 40 segundos**. n8n NO toca MySQL, NO hace OCR, IA ni Excel.

## Workflows incluidos

| Archivo | Funcion |
|---|---|
| `DriveIngest.json` | Cada 40 s: `POST http://localhost:3000/api/integrations/poll-drive` |
| `GmailIngest.json` | Cada 40 s: `POST http://localhost:3000/api/integrations/poll-gmail` |
| `TipoCambioBCCR.json` | Diario 08:00: `POST http://localhost:3000/api/integrations/currency-fetch` (consulta Hacienda CR y persiste tipo de cambio USD del dia) |

Cada poll en el backend:
1. Descarga archivos nuevos via Google API con sus propias credenciales OAuth.
2. Corre el pipeline OCR -> IA -> validacion + dedup + conversion -> MySQL -> Excel -> indexado RAG.
3. Para Drive: mueve a `/Procesadas` o `/Errores` segun resultado.
4. Para Gmail: marca el correo como leido **solo si todos los adjuntos pasaron sin error**.

## Como importar

1. Abri n8n en http://localhost:5678 (la primera vez crea su usuario admin n8n).
2. Click **+ Add workflow** (o `Ctrl+N`).
3. Click los tres puntos arriba a la derecha > **Import from File**.
4. Seleccione `DriveIngest.json`.
5. **OBLIGATORIO** - El JSON trae un placeholder `REEMPLAZAR_CON_N8N_INGEST_TOKEN_DE_BACKEND_ENV` en el header `X-N8N-Token`. Abri el nodo HTTP Request y reemplaza ese valor por el `N8N_INGEST_TOKEN` que definiste en `backend/.env`. Si no lo haces, el backend rechazara las llamadas con 401.
6. Click **Active** (toggle arriba a la derecha) para activarlo.
7. Repeti con `GmailIngest.json` y `TipoCambioBCCR.json`.

## Pre-requisitos

Antes de activar los workflows, en la app:

1. Login como admin -> **Administracion -> Conexion Google**.
2. Click **Conectar Google** -> autoriza Drive + Gmail (en la cuenta que tiene la carpeta de facturas).
3. Click **Crear / verificar estructura** para crear `/DocScanFinanceCR/{Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal}` en Drive.
4. (Opcional) Click **Poll Drive ahora** / **Poll Gmail ahora** para verificar que todo funciona antes de delegar a n8n.

## Notas

- El `Authorization` por header `X-N8N-Token` reemplaza JWT en estos endpoints porque
  n8n no inicia sesion como usuario. El token vive en `.env` (`N8N_INGEST_TOKEN`) y NUNCA en git.
- Si rotas el token en `.env`, debes rehacer el header en los tres workflows desde la UI de n8n.
- El backend tambien tiene un cron interno (`node-cron`) para limpieza diaria de `storage/temp` y `storage/uploads` huerfanos. Eso no usa n8n.
- Workflow `ReprocesoErrores` mencionado en el plan v2.1 (seccion 14.4) queda pendiente.
  Por ahora el reprocesamiento es manual desde la UI: ADMIN abre `/documents/:id` y pulsa "Reprocesar".

## Diagnostico cuando algo no anda

| Sintoma | Donde mirar |
|---|---|
| n8n da 401 en cada execution | Header `X-N8N-Token` mal copiado. Re-pega el valor del `.env`. |
| n8n da 412 "NotConnected" | Google OAuth desconectado. Reconecta desde `/admin/google` en la app. |
| Workflow desactivado tras reiniciar n8n | Reactivar manualmente con el toggle. |
| El backend dice "n8n_token: missing" en /api/health | `N8N_INGEST_TOKEN` vacio en el `.env` del backend. |
| Polls funcionan pero ninguna factura llega | Verifica que haya archivos en `/DocScanFinanceCR/Facturas` de Drive o correos UNREAD con adjuntos en Gmail. |

## Documentos relacionados

- [`../README.md`](../README.md) - vision general.
- [`../INSTALACION.md`](../INSTALACION.md) - guia primera vez (paso 9 cubre importacion de workflows).
- [`../INICIO-RAPIDO.md`](../INICIO-RAPIDO.md) - como reactivar workflows tras volver a abrir el sistema.
- [`../backend/README.md`](../backend/README.md) - endpoints REST que estos workflows consumen.
