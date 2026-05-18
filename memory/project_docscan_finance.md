---
name: project-docscan-finance
description: Plataforma DocScan Finance CR - estado, stack y reglas clave del proyecto contable con OCR/Gemini/MySQL.
metadata:
  type: project
---

Proyecto `proyecto_contabilidad` implementa el Plan Maestro v2.1 (DocScan Finance CR + Tax IVA Intelligence CR + Smart Accounting AI).

**Stack inviolable** (seccion 2 del plan v2.1):
- Backend Node.js + Express con mysql2 + ExcelJS + Multer + tesseract.js + pdf-parse + sharp + fast-xml-parser + @google/generative-ai + googleapis + jsonwebtoken + bcryptjs.
- Frontend React 19 + Vite + TailwindCSS v3 + react-router-dom + @tanstack/react-query + axios + zustand + react-hook-form + zod + recharts.
- MySQL **nativo** Windows (servicio del SO, NO Docker). Admin via MySQL Workbench.
- n8n instalado localmente en `C:\n8n-runtime` (fuera de OneDrive por bug `ECOMPROMISED Lock compromised`). Reemplaza el `npx n8n` del plan; misma intencion.
- IA unica: Gemini (Google AI Studio). NO OpenAI, NO Claude API, NO Vision API.

**Excluidos (no usar bajo ninguna circunstancia):** PHP, phpMyAdmin, Docker/Podman/contenedores, cualquier BD distinta de MySQL, cualquier IA distinta de Gemini, Gemini como motor OCR.

**Separacion estricta n8n vs Backend** (seccion 14 del plan):
- n8n SOLO triggers e ingesta (Drive scheduler 40s, Gmail scheduler 40s, BCCR diario, reproceso errores). Llama HTTP al backend con header `x-n8n-token`.
- Backend Node maneja TODO: OCR, Gemini, MySQL, ExcelJS, RAG, chatbot, JWT, trazabilidad.

**Reglas IA inviolables** (seccion 5):
- Gemini NO inventa, infiere, estima ni completa. Campos ausentes = NULL literal.
- OCR (Tesseract) NO corrige ni reordena. `raw_ocr` es inmutable.
- Excel = reporte. MySQL = fuente unica. Si machote no existe -> detener proceso (NO crear alternativa).
- Hash documental SHA256(archivo + numero_factura + fecha + proveedor) previene duplicados Drive vs Gmail.
- Edicion manual nunca sobrescribe original (tabla `manual_edits`).

**Machote Excel:** `backend/templates/Reintegro.xlsx`. Hoja unica `"Reintegro de Viaticos"`. Encabezados en fila 13 (C-L): Fecha, Proveedor, Cedula, No. Factura, Descripcion, Moneda, Monto factura, Monto Gravado, % IVA, Monto IVA. Filas de datos: 14-31. Totales: 32-33.

**Tarifas IVA CR** (seccion 5.3): 0% canasta basica, 1% medicamentos, 2% turismo, 4% salud privada, 13% general, EXENTO. Si no certeza -> marcar `REVISION_MANUAL`, NO inferir.

**Bootstrap admin:** `admin@docscan.local` / `ChangeMe123!` (cambiar tras primer login).

**Usuario MySQL:** `app_user@localhost` con password en `backend/.env` (`DB_PASSWORD`). El SQL bootstrap esta en `backend/src/db/migrations/000_create_user_and_db.sql` y se ejecuta UNA vez como root en Workbench.

**Fase 1 completada:** fundacion end-to-end - backend Express en :3000 con MySQL+JWT, frontend React en :5173 con login y rutas protegidas, n8n en :5678, 16 tablas creadas, machote copiado, stub `/api/documents/ingest` protegido con `N8N_INGEST_TOKEN`.

**Fase 2 pendiente:** OCR pipeline (tesseract.js+pdf-parse+sharp), cliente Gemini con prompt restrictivo, parser XML Hacienda, generador ExcelJS (modo REINTEGRO + IVA_ANALISIS), conversion BCCR, RAG, chatbot, modulos React (gestion documental, RAG, chat, trazabilidad, edicion, admin), 4 workflows n8n (DriveIngest, GmailIngest, TipoCambioBCCR, ReprocesoErrores), OAuth callback Google.

**Why:** El plan v2.1 (Downloads/Plan_Maestro_v2.1.docx) es rector. No desviarse del stack sin pedir.
**How to apply:** Antes de instalar libs o anadir servicios, verificar contra exclusiones del plan. Antes de tocar la regla IA o el modelo de datos, releer secciones 5-8.
