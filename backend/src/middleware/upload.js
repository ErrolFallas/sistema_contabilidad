const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DIRS, ensureDirs, safeFilename } = require('../services/storageService');

ensureDirs();

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/xml',
  'text/xml',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRS.uploads),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext);
    const safe = safeFilename(base);
    cb(null, `${ts}_${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype) || /\.(pdf|jpg|jpeg|png|xml)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  },
});

module.exports = { upload };
