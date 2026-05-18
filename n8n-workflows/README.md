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
2. Corre el pipeline OCR -> Gemini -> MySQL -> Excel.
3. Para Drive: mueve a `/Procesadas` o `/Errores`.
4. Para Gmail: marca el correo como leido.

## Como importar

1. Abra n8n en http://localhost:5678 (la primera vez crea su usuario admin n8n).
2. Click **+ Add workflow** (o `Ctrl+N`).
3. Click los tres puntos arriba a la derecha > **Import from File**.
4. Seleccione `DriveIngest.json`.
5. (Importante) **Verifique el header `X-N8N-Token`**: el valor del JSON es el del `.env` del backend (`N8N_INGEST_TOKEN`). Si lo cambia en `.env`, debe actualizarlo aqui tambien.
6. Click **Active** (toggle arriba a la derecha) para activarlo.
7. Repita con `GmailIngest.json`.

## Pre-requisitos

Antes de activar los workflows, en la app:

1. Login como admin -> **Administracion -> Conexion Google**.
2. Click **Conectar Google** -> autorizar Drive + Gmail (en la cuenta que tiene la carpeta de facturas).
3. Click **Crear / verificar estructura** para crear `/DocScanFinanceCR/{Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal}` en Drive.
4. (Opcional) Click **Poll Drive ahora** / **Poll Gmail ahora** para verificar que todo funciona antes de delegar a n8n.

## Notas

- El `Authorization` por header `X-N8N-Token` reemplaza JWT en estos endpoints porque
  n8n no inicia sesion como usuario. El token vive en `.env` (`N8N_INGEST_TOKEN`).
- Si renueva el token en `.env`, debe rehacer el header en los dos workflows.
- Los workflows `TipoCambioBCCR` y `ReprocesoErrores` mencionados en el plan v2.1 (seccion 14.4)
  se agregan en una sub-fase posterior.
