-- ============================================================
-- DocScan Finance CR - migration 003
-- Gmail attachment IDs son tokens largos (cientos de chars).
-- VARCHAR(190) era demasiado corto. Pasamos a TEXT.
-- ============================================================

ALTER TABLE documents
  MODIFY COLUMN gmail_attachment_id TEXT NULL;
