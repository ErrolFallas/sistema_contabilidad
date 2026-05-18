/**
 * Servicio Google Drive - seccion 2.1 + 3.1 del Plan Maestro v2.1.
 *
 * Responsabilidades:
 *   - Asegurar estructura: /<root>/Facturas, /Procesadas, /Errores,
 *     /PlantillasExcel, /OCR, /Temporal (crear si no existen, reutilizar
 *     parcial, no duplicar).
 *   - Listar archivos nuevos en /Facturas desde la ultima sincronizacion.
 *   - Descargar binario por fileId.
 *   - Mover archivo a /Procesadas o /Errores tras procesarlo.
 *
 * MIME-types permitidos: PDF, JPG, PNG (Fase 2). XML llegara despues.
 */
const { google } = require('googleapis');
const oauthService = require('./googleOAuthService');
const { config } = require('../config/env');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ACCEPT_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

async function getDrive() {
  const auth = await oauthService.getAuthenticatedClient();
  return google.drive({ version: 'v3', auth });
}

async function findFolder(drive, name, parentId) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 10,
    spaces: 'drive',
  });
  return res.data.files?.[0] || null;
}

async function ensureFolder(drive, name, parentId) {
  const found = await findFolder(drive, name, parentId);
  if (found) return found;
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id, name',
  });
  return res.data;
}

/**
 * Asegura la estructura obligatoria. Devuelve { rootId, subfolders: { Facturas, Procesadas, ... } }.
 */
async function ensureFolderStructure() {
  const drive = await getDrive();
  const root = await ensureFolder(drive, config.drive.rootFolder, null);
  const subfolders = {};
  for (const sub of config.drive.subfolders) {
    const f = await ensureFolder(drive, sub.trim(), root.id);
    subfolders[sub.trim()] = f.id;
  }
  await oauthService.setDriveFolderId(root.id);
  return { rootId: root.id, subfolders };
}

async function getOrEnsureStructure() {
  // Idempotente y barato: si ya conocemos rootId lo reusamos; si no, lo creamos.
  const cred = await oauthService.getStoredCredential();
  if (cred?.drive_folder_id) {
    const drive = await getDrive();
    // Verificar que sigue existiendo y leer subcarpetas conocidas.
    try {
      await drive.files.get({ fileId: cred.drive_folder_id, fields: 'id, name' });
      const subfolders = {};
      for (const sub of config.drive.subfolders) {
        const f = await findFolder(drive, sub.trim(), cred.drive_folder_id);
        if (f) subfolders[sub.trim()] = f.id;
      }
      // Si falta alguna subcarpeta, completarla (idempotente).
      for (const sub of config.drive.subfolders) {
        if (!subfolders[sub.trim()]) {
          const f = await ensureFolder(drive, sub.trim(), cred.drive_folder_id);
          subfolders[sub.trim()] = f.id;
        }
      }
      return { rootId: cred.drive_folder_id, subfolders };
    } catch (_e) {
      // Cayo el folderId guardado, recrear.
    }
  }
  return ensureFolderStructure();
}

async function listNewInvoices({ sinceIso = null } = {}) {
  const drive = await getDrive();
  const { subfolders } = await getOrEnsureStructure();
  const facturasId = subfolders['Facturas'];
  if (!facturasId) throw new Error('Carpeta /Facturas no disponible en Drive.');

  const filters = [
    `'${facturasId}' in parents`,
    'trashed = false',
    `(${ACCEPT_MIME.map((m) => `mimeType = '${m}'`).join(' or ')})`,
  ];
  if (sinceIso) {
    filters.push(`modifiedTime > '${sinceIso}'`);
  }
  const res = await drive.files.list({
    q: filters.join(' and '),
    fields: 'files(id, name, mimeType, size, modifiedTime, createdTime)',
    pageSize: 100,
    orderBy: 'modifiedTime asc',
  });
  return res.data.files || [];
}

async function downloadFile(fileId) {
  const drive = await getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, parents',
  });
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return {
    buffer: Buffer.from(res.data),
    name: meta.data.name,
    mime: meta.data.mimeType,
    size: meta.data.size,
    parents: meta.data.parents,
  };
}

async function moveFile(fileId, newParentName) {
  const drive = await getDrive();
  const { subfolders } = await getOrEnsureStructure();
  const targetParent = subfolders[newParentName];
  if (!targetParent) throw new Error(`Subcarpeta Drive desconocida: ${newParentName}`);
  const meta = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (meta.data.parents || []).join(',');
  await drive.files.update({
    fileId,
    addParents: targetParent,
    removeParents: previousParents,
    fields: 'id, parents',
  });
}

module.exports = {
  ensureFolderStructure,
  getOrEnsureStructure,
  listNewInvoices,
  downloadFile,
  moveFile,
};
