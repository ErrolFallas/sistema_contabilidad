/**
 * Limpieza programada de storage. Dos targets:
 *
 *  1. storage/temp - archivos temporales de OCR (capturas, redimensionados).
 *     Retencion corta por default (7 dias).
 *  2. storage/uploads - los archivos originales subidos. Solo se borran los que
 *     NO esten referenciados por ningun documents.storage_path activo.
 *     Retencion larga (30 dias) porque algunos pueden seguir en uso por la UI.
 *
 * Esta limpieza NO toca ninguna tabla. Solo archivos del disco.
 * La fila documents se considera fuente de verdad. Si un archivo de uploads
 * no aparece en documents.storage_path es porque el doc se elimino - lo
 * podemos borrar fisico tras la retencion.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { DIRS } = require('./storageService');
const { logger } = require('../lib/logger');

const DEFAULT_TEMP_RETENTION_DAYS = 7;
const DEFAULT_UPLOAD_RETENTION_DAYS = 30;

function olderThan(filePath, days) {
  const stat = fs.statSync(filePath);
  const ageMs = Date.now() - stat.mtimeMs;
  return ageMs > days * 24 * 60 * 60 * 1000;
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

async function getActiveStoragePaths() {
  const [rows] = await pool.query(
    `SELECT storage_path FROM documents WHERE storage_path IS NOT NULL`
  );
  return new Set(rows.map((r) => path.resolve(r.storage_path)));
}

async function cleanOldTempFiles({ retentionDays = DEFAULT_TEMP_RETENTION_DAYS } = {}) {
  const files = listFilesRecursive(DIRS.temp);
  let deleted = 0;
  let kept = 0;
  const errors = [];
  for (const f of files) {
    try {
      if (olderThan(f, retentionDays)) {
        fs.unlinkSync(f);
        deleted++;
      } else {
        kept++;
      }
    } catch (e) {
      errors.push({ file: f, message: e.message });
    }
  }
  return { scanned: files.length, deleted, kept, errors };
}

async function cleanOrphanedUploads({ retentionDays = DEFAULT_UPLOAD_RETENTION_DAYS } = {}) {
  const active = await getActiveStoragePaths();
  const files = listFilesRecursive(DIRS.uploads);
  let deleted = 0;
  let kept_referenced = 0;
  let kept_recent = 0;
  const errors = [];
  for (const f of files) {
    try {
      const resolved = path.resolve(f);
      if (active.has(resolved)) {
        kept_referenced++;
        continue;
      }
      if (!olderThan(f, retentionDays)) {
        kept_recent++;
        continue;
      }
      fs.unlinkSync(f);
      deleted++;
    } catch (e) {
      errors.push({ file: f, message: e.message });
    }
  }
  return {
    scanned: files.length,
    deleted,
    kept_referenced,
    kept_recent,
    errors,
  };
}

async function runAllCleanups(opts = {}) {
  const t0 = Date.now();
  const tempResult = await cleanOldTempFiles(opts.temp || {});
  const uploadsResult = await cleanOrphanedUploads(opts.uploads || {});
  const summary = {
    duration_ms: Date.now() - t0,
    temp: tempResult,
    uploads: uploadsResult,
  };
  logger.info(summary, 'storage cleanup completed');
  return summary;
}

/**
 * Reporta archivos huerfanos sin borrarlos. Dos tipos:
 *
 *  - missing_files:  documentos cuya storage_path apunta a un archivo que
 *                    no existe en disco. Sintoma: doc se movio fuera del
 *                    directorio (o lo borraron a mano).
 *  - orphan_files:   archivos en storage/uploads que NO estan referenciados
 *                    por ningun documents row. Sintoma: doc eliminado de BD
 *                    pero archivo quedo, o doc renombrado.
 *
 * Solo lectura. No borra. Para limpieza usar cleanOrphanedUploads().
 */
async function detectOrphans() {
  const [docs] = await pool.query(
    `SELECT id, original_filename, storage_path, status, received_at
       FROM documents
      WHERE storage_path IS NOT NULL
      ORDER BY id ASC`
  );

  const missingFiles = [];
  const activePaths = new Set();
  for (const d of docs) {
    const resolved = path.resolve(d.storage_path);
    activePaths.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingFiles.push({
        document_id: d.id,
        original_filename: d.original_filename,
        storage_path: d.storage_path,
        status: d.status,
        received_at: d.received_at,
      });
    }
  }

  const allFiles = listFilesRecursive(DIRS.uploads);
  const orphanFiles = [];
  for (const f of allFiles) {
    const resolved = path.resolve(f);
    if (activePaths.has(resolved)) continue;
    let size = null;
    let mtime = null;
    let ageDays = null;
    try {
      const st = fs.statSync(f);
      size = st.size;
      mtime = st.mtime;
      ageDays = Math.floor((Date.now() - st.mtimeMs) / (24 * 60 * 60 * 1000));
    } catch (_e) {}
    orphanFiles.push({
      file: path.relative(DIRS.uploads, f),
      full_path: f,
      size_bytes: size,
      modified_at: mtime,
      age_days: ageDays,
    });
  }

  return {
    scanned_documents: docs.length,
    scanned_files: allFiles.length,
    missing_files: {
      count: missingFiles.length,
      items: missingFiles,
    },
    orphan_files: {
      count: orphanFiles.length,
      items: orphanFiles,
      total_size_bytes: orphanFiles.reduce((s, o) => s + (o.size_bytes || 0), 0),
    },
  };
}

module.exports = {
  cleanOldTempFiles,
  cleanOrphanedUploads,
  runAllCleanups,
  detectOrphans,
  DEFAULT_TEMP_RETENTION_DAYS,
  DEFAULT_UPLOAD_RETENTION_DAYS,
};
