---
name: feedback-onedrive-npm-lock
description: OneDrive + npm cache produce ECOMPROMISED Lock compromised. Mantener herramientas pesadas fuera de OneDrive.
metadata:
  type: feedback
---

Instalar paquetes npm grandes (n8n, electron, etc.) dentro de carpetas sincronizadas por OneDrive provoca el error `npm error code ECOMPROMISED / Lock compromised` aun con `--legacy-peer-deps`. OneDrive intenta sincronizar archivos del `node_modules` mientras npm aun esta escribiendolos, y el verificador de integridad de npm aborta.

**Why:** Reproducido dos veces en este proyecto (sesion 2026-05-17 instalando n8n via npx en OneDrive, y reintento aun con cache en `C:\npm-cache` mientras `cwd` seguia bajo OneDrive). Solo funciono cuando tanto `cwd` como `node_modules` quedaron en `C:\n8n-runtime` (fuera de OneDrive).

**How to apply:** Para cualquier instalacion npm grande en este equipo, crear el directorio fuera de OneDrive (`C:\<nombre>-runtime`) y correr `npm install` desde alli. Si la app debe vivir en el proyecto, considerar un junction o variable de entorno apuntando al runtime externo. El cache de npm tambien debe estar fuera de OneDrive: `npm config set cache "C:/npm-cache" --location=user`.
