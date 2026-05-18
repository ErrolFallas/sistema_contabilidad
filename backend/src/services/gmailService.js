/**
 * Servicio Gmail - seccion 2.1 + 3.1 del Plan Maestro v2.1.
 *
 * Restricciones:
 *   - Procesar UNICAMENTE correos UNREAD con HAS_ATTACHMENT.
 *   - No procesar correos leidos. No reabrir correos procesados.
 *   - Procesar UNICAMENTE adjuntos (no el cuerpo).
 *   - Marcar el correo como leido al finalizar.
 *   - Registrar origen documental (source_type='GMAIL').
 *
 * Adjuntos aceptados: PDF, JPG, PNG.
 */
const { google } = require('googleapis');
const oauthService = require('./googleOAuthService');

const ACCEPT_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const ACCEPT_EXT = /\.(pdf|jpe?g|png)$/i;

async function getGmail() {
  const auth = await oauthService.getAuthenticatedClient();
  return google.gmail({ version: 'v1', auth });
}

/**
 * Devuelve [{ messageId, threadId, subject, from, attachments: [{ filename, mimeType, attachmentId, size }] }, ...]
 */
async function listUnreadWithAttachments({ maxResults = 25 } = {}) {
  const gmail = await getGmail();
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread has:attachment',
    maxResults,
  });
  const messages = list.data.messages || [];
  const out = [];
  for (const m of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'full',
    });
    const headers = detail.data.payload?.headers || [];
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
    const attachments = collectAttachments(detail.data.payload);
    if (attachments.length === 0) continue;
    out.push({
      messageId: m.id,
      threadId: m.threadId,
      subject,
      from,
      attachments,
    });
  }
  return out;
}

function collectAttachments(part, acc = []) {
  if (!part) return acc;
  if (part.filename && part.body?.attachmentId) {
    const mime = part.mimeType || '';
    const okMime = ACCEPT_MIME.includes(mime);
    const okExt = ACCEPT_EXT.test(part.filename);
    if (okMime || okExt) {
      acc.push({
        filename: part.filename,
        mimeType: mime,
        attachmentId: part.body.attachmentId,
        size: part.body.size,
      });
    }
  }
  if (Array.isArray(part.parts)) {
    for (const sub of part.parts) collectAttachments(sub, acc);
  }
  return acc;
}

async function downloadAttachment(messageId, attachmentId) {
  const gmail = await getGmail();
  const att = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const b64url = att.data.data || '';
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

async function markAsRead(messageId) {
  const gmail = await getGmail();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

module.exports = { listUnreadWithAttachments, downloadAttachment, markAsRead };
