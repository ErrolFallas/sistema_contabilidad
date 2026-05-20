/**
 * Integraciones n8n -> Backend.
 * n8n SOLO actua como scheduler: dispara cada 40s estos endpoints.
 * El backend hace todo (descarga Drive/Gmail, OCR, IA, Excel, persistencia).
 * Cumple seccion 14 del plan (n8n nunca toca MySQL, OCR, IA ni Excel).
 *
 * Autenticacion: header X-N8N-Token con N8N_INGEST_TOKEN.
 */
const fs = require('fs');
const path = require('path');
const driveService = require('../services/driveService');
const gmailService = require('../services/gmailService');
const oauthService = require('../services/googleOAuthService');
const pipelineService = require('../services/pipelineService');
const currencyService = require('../services/currencyService');
const { DIRS, ensureDirs, safeFilename } = require('../services/storageService');

function persistBuffer(buffer, originalName) {
  ensureDirs();
  const ts = Date.now();
  const ext = path.extname(originalName) || '';
  const base = path.basename(originalName, ext);
  const filename = `${ts}_${safeFilename(base)}${ext}`;
  const fullPath = path.join(DIRS.uploads, filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

async function pollDrive(req, res, next) {
  try {
    const cred = await oauthService.getStoredCredential();
    if (!cred) return res.status(412).json({ error: 'NotConnected', message: 'Google no conectado' });

    const sinceIso = cred.last_drive_sync
      ? new Date(cred.last_drive_sync).toISOString()
      : null;

    const files = await driveService.listNewInvoices({ sinceIso });
    const results = [];

    for (const f of files) {
      try {
        const { buffer, name, mime } = await driveService.downloadFile(f.id);
        const fullPath = persistBuffer(buffer, name);
        const out = await pipelineService.processFile({
          filePath: fullPath,
          originalFilename: name,
          mimeType: mime,
          fileSize: buffer.length,
          source_type: 'DRIVE',
          drive_file_id: f.id,
        });
        // Mover archivo en Drive
        const target = out.status === 'ERROR' ? 'Errores' : 'Procesadas';
        try {
          await driveService.moveFile(f.id, target);
        } catch (e) {
          req.log.warn({ drive_file_id: f.id, target, err: e.message }, 'drive move failed');
        }
        results.push({ file: name, status: out.status, document_id: out.document_id });
      } catch (e) {
        results.push({ file: f.name, status: 'ERROR', error: e.message });
        try { await driveService.moveFile(f.id, 'Errores'); } catch (_e) {}
      }
    }

    await oauthService.updateDriveSync();
    res.json({ source: 'DRIVE', count: files.length, processed: results });
  } catch (e) {
    next(e);
  }
}

async function pollGmail(req, res, next) {
  try {
    const cred = await oauthService.getStoredCredential();
    if (!cred) return res.status(412).json({ error: 'NotConnected', message: 'Google no conectado' });

    const messages = await gmailService.listUnreadWithAttachments();
    const results = [];

    for (const m of messages) {
      const msgResults = [];
      for (const att of m.attachments) {
        try {
          const buffer = await gmailService.downloadAttachment(m.messageId, att.attachmentId);
          const fullPath = persistBuffer(buffer, att.filename);
          const out = await pipelineService.processFile({
            filePath: fullPath,
            originalFilename: att.filename,
            mimeType: att.mimeType,
            fileSize: buffer.length,
            source_type: 'GMAIL',
            gmail_message_id: m.messageId,
            gmail_attachment_id: att.attachmentId,
          });
          msgResults.push({ filename: att.filename, status: out.status, document_id: out.document_id });
        } catch (e) {
          msgResults.push({ filename: att.filename, status: 'ERROR', error: e.message });
        }
      }
      // Marcar como leido SOLO si todos los adjuntos quedaron en estado terminal
      // exitoso (COMPLETED o DUPLICATE). Si hubo ERROR, el correo queda UNREAD
      // para que el siguiente poll lo reintente tras corregir el problema.
      const allOk = msgResults.every((r) => r.status === 'COMPLETED' || r.status === 'DUPLICATE');
      let marked = false;
      if (allOk) {
        try {
          await gmailService.markAsRead(m.messageId);
          marked = true;
        } catch (e) {
          req.log.warn({ gmail_message_id: m.messageId, err: e.message }, 'gmail markAsRead failed');
        }
      }
      results.push({
        messageId: m.messageId,
        subject: m.subject,
        from: m.from,
        attachments: msgResults,
        marked_as_read: marked,
      });
    }

    await oauthService.updateGmailSync();
    res.json({ source: 'GMAIL', count: messages.length, processed: results });
  } catch (e) {
    next(e);
  }
}

async function ensureDriveStructure(req, res, next) {
  try {
    const out = await driveService.ensureFolderStructure();
    res.json(out);
  } catch (e) {
    next(e);
  }
}

async function fetchCurrency(req, res, next) {
  try {
    const out = await currencyService.fetchTodayFromHacienda();
    res.json({ fetched: true, ...out });
  } catch (e) {
    next(e);
  }
}

async function listCurrency(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 365);
    const rates = await currencyService.listRecent(limit);
    res.json({ items: rates, count: rates.length });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  pollDrive,
  pollGmail,
  ensureDriveStructure,
  fetchCurrency,
  listCurrency,
};
