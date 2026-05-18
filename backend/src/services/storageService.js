const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');

const DIRS = {
  uploads: path.join(config.storage.dir, 'uploads'),
  ocr: path.join(config.storage.dir, 'ocr'),
  processed: path.join(config.storage.dir, 'processed'),
  errors: path.join(config.storage.dir, 'errors'),
  temp: path.join(config.storage.dir, 'temp'),
};

function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function uploadPath(filename) {
  ensureDirs();
  return path.join(DIRS.uploads, filename);
}

function ocrTextPath(documentId) {
  ensureDirs();
  return path.join(DIRS.ocr, `doc_${documentId}.txt`);
}

function processedExcelPath() {
  ensureDirs();
  return path.join(DIRS.processed, 'Reintegro_actualizado.xlsx');
}

function safeFilename(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}

module.exports = { DIRS, ensureDirs, uploadPath, ocrTextPath, processedExcelPath, safeFilename };
