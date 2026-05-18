-- ============================================================
-- DocScan Finance CR - Esquema inicial v2.1
-- Plan Maestro v2.1 - Plataforma Inteligente de Procesamiento Documental
-- Charset: utf8mb4 / Engine: InnoDB
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. users  (Autenticacion JWT + roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(190) NULL,
  role            ENUM('ADMIN','USUARIO') NOT NULL DEFAULT 'USUARIO',
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at   TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. documents  (Repositorio documental maestro)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_hash          CHAR(64) NOT NULL,
  source_type            ENUM('DRIVE','GMAIL','MANUAL') NOT NULL,
  original_filename      VARCHAR(500) NOT NULL,
  mime_type              VARCHAR(120) NOT NULL,
  file_size              BIGINT UNSIGNED NULL,
  drive_file_id          VARCHAR(190) NULL,
  gmail_message_id       VARCHAR(190) NULL,
  gmail_attachment_id    VARCHAR(190) NULL,
  storage_path           VARCHAR(500) NULL,
  duplicate_document_id  BIGINT UNSIGNED NULL,
  status                 ENUM(
                            'PENDING','PROCESSING','OCR_DONE','EXTRACTED',
                            'VALIDATED','PERSISTED','EXCEL_DONE','COMPLETED',
                            'DUPLICATE','REVIEW','ERROR'
                         ) NOT NULL DEFAULT 'PENDING',
  doc_kind               ENUM('PDF_NATIVO','PDF_ESCANEADO','IMAGE','XML_HACIENDA','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  error_message          TEXT NULL,
  uploaded_by_user_id    BIGINT UNSIGNED NULL,
  received_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at           TIMESTAMP NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_documents_hash (document_hash),
  KEY idx_documents_status (status),
  KEY idx_documents_source (source_type),
  KEY idx_documents_drive (drive_file_id),
  KEY idx_documents_gmail (gmail_message_id),
  CONSTRAINT fk_documents_dup FOREIGN KEY (duplicate_document_id) REFERENCES documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_documents_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. raw_ocr  (OCR completo, inmutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_ocr (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   BIGINT UNSIGNED NOT NULL,
  engine        VARCHAR(60) NOT NULL DEFAULT 'tesseract.js',
  language      VARCHAR(20) NOT NULL DEFAULT 'spa',
  ocr_text      LONGTEXT NOT NULL,
  page_count    INT UNSIGNED NULL,
  confidence    DECIMAL(5,4) NULL,
  duration_ms   INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_raw_ocr_document (document_id),
  CONSTRAINT fk_raw_ocr_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3b. raw_xml  (XML Hacienda CR, inmutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_xml (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   BIGINT UNSIGNED NOT NULL,
  xml_content   LONGTEXT NOT NULL,
  xml_type      VARCHAR(80) NULL,
  parsed_json   JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_raw_xml_document (document_id),
  CONSTRAINT fk_raw_xml_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. ai_extractions  (Historial IA)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_extractions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   BIGINT UNSIGNED NOT NULL,
  purpose       ENUM('EXTRACT_INVOICE','CLASSIFY_IVA','RAG','CHATBOT','VALIDATION') NOT NULL,
  model         VARCHAR(120) NOT NULL,
  prompt        LONGTEXT NOT NULL,
  request_payload  JSON NULL,
  response_raw  LONGTEXT NULL,
  response_json JSON NULL,
  score         DECIMAL(5,4) NULL,
  duration_ms   INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_doc (document_id),
  CONSTRAINT fk_ai_extractions_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. invoices  (Facturas de gasto extraidas)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id         BIGINT UNSIGNED NOT NULL,
  proveedor_nombre    VARCHAR(255) NULL,
  proveedor_cedula    VARCHAR(50) NULL,
  proveedor_tipo_cedula ENUM('FISICA','JURIDICA','DIMEX','NITE') NULL,
  numero_factura      VARCHAR(80) NULL,
  fecha_emision       DATE NULL,
  moneda              ENUM('CRC','USD','EUR') NULL,
  tipo_cambio         DECIMAL(14,6) NULL,
  tipo_cambio_fecha   DATE NULL,
  subtotal            DECIMAL(14,2) NULL,
  descuento           DECIMAL(14,2) NULL,
  impuesto_total      DECIMAL(14,2) NULL,
  total               DECIMAL(14,2) NULL,
  total_colones       DECIMAL(14,2) NULL,
  descripcion         TEXT NULL,
  actividad_economica VARCHAR(190) NULL,
  estado_extraccion   ENUM('OK','FALTANTE','REVISION') NOT NULL DEFAULT 'OK',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoices_document (document_id),
  KEY idx_invoices_numero (numero_factura),
  KEY idx_invoices_proveedor (proveedor_cedula),
  CONSTRAINT fk_invoices_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. invoice_lines  (Detalle por linea con clasificacion IVA)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id               BIGINT UNSIGNED NOT NULL,
  linea_num                INT UNSIGNED NULL,
  producto                 TEXT NULL,
  categoria_fiscal         VARCHAR(190) NULL,
  cantidad                 DECIMAL(14,4) NULL,
  precio_unitario          DECIMAL(14,4) NULL,
  base_gravable            DECIMAL(14,2) NULL,
  tarifa_iva               ENUM('0','1','2','4','13','EXENTO','REVISION') NULL,
  porcentaje_iva           DECIMAL(5,2) NULL,
  monto_iva                DECIMAL(14,2) NULL,
  subtotal                 DECIMAL(14,2) NULL,
  total                    DECIMAL(14,2) NULL,
  clasificacion_confianza  DECIMAL(5,4) NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lines_invoice (invoice_id),
  KEY idx_lines_tarifa (tarifa_iva),
  CONSTRAINT fk_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. processing_trace  (Trazabilidad por etapa)
-- ============================================================
CREATE TABLE IF NOT EXISTS processing_trace (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   BIGINT UNSIGNED NOT NULL,
  stage         ENUM(
                  'FILE_RECEIVED','HASH_CHECK','OCR_START','OCR_DONE',
                  'XML_PARSE','GEMINI_START','GEMINI_DONE',
                  'IVA_CLASSIFY','VALIDATION_DONE','MYSQL_DONE',
                  'EXCEL_START','EXCEL_DONE','ERROR'
                ) NOT NULL,
  status        ENUM('STARTED','OK','ERROR','SKIPPED') NOT NULL,
  message       TEXT NULL,
  started_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at      TIMESTAMP(3) NULL,
  duration_ms   INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_trace_doc (document_id),
  KEY idx_trace_stage (stage),
  CONSTRAINT fk_trace_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. excel_mapping  (Ubicacion exacta en Excel)
-- ============================================================
CREATE TABLE IF NOT EXISTS excel_mapping (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id   BIGINT UNSIGNED NOT NULL,
  invoice_id    BIGINT UNSIGNED NULL,
  template_type ENUM('REINTEGRO','IVA_ANALISIS') NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  sheet_name    VARCHAR(120) NOT NULL,
  row_num       INT UNSIGNED NOT NULL,
  col_letter    VARCHAR(8) NOT NULL,
  cell_ref      VARCHAR(16) NOT NULL,
  field_name    VARCHAR(120) NULL,
  value_written TEXT NULL,
  written_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_excel_doc (document_id),
  KEY idx_excel_invoice (invoice_id),
  KEY idx_excel_template (template_type),
  CONSTRAINT fk_excel_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_excel_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. manual_edits  (Correcciones auditadas - nunca sobrescriben)
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_edits (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id     BIGINT UNSIGNED NOT NULL,
  invoice_id      BIGINT UNSIGNED NULL,
  line_id         BIGINT UNSIGNED NULL,
  field_name      VARCHAR(120) NOT NULL,
  original_value  TEXT NULL,
  new_value       TEXT NULL,
  reason          TEXT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_edits_doc (document_id),
  KEY idx_edits_user (user_id),
  CONSTRAINT fk_edits_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_edits_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices(id)  ON DELETE SET NULL,
  CONSTRAINT fk_edits_line     FOREIGN KEY (line_id)     REFERENCES invoice_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_edits_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. rag_documents  (Chunks indexados para RAG)
-- ============================================================
CREATE TABLE IF NOT EXISTS rag_documents (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id  BIGINT UNSIGNED NOT NULL,
  chunk_index  INT UNSIGNED NOT NULL,
  chunk_text   LONGTEXT NOT NULL,
  embedding    JSON NULL,
  token_count  INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rag_doc (document_id),
  FULLTEXT KEY ft_rag_chunk (chunk_text),
  CONSTRAINT fk_rag_doc_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. rag_queries  (Historial de consultas RAG)
-- ============================================================
CREATE TABLE IF NOT EXISTS rag_queries (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NULL,
  question        TEXT NOT NULL,
  answer          TEXT NULL,
  matched_chunks  JSON NULL,
  duration_ms     INT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ragq_user (user_id),
  CONSTRAINT fk_ragq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. currency_rates  (Tipo de cambio diario BCCR - inmutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS currency_rates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha         DATE NOT NULL,
  moneda        ENUM('USD','EUR') NOT NULL,
  tipo          ENUM('VENTA','COMPRA') NOT NULL,
  valor         DECIMAL(14,6) NOT NULL,
  fuente        VARCHAR(80) NOT NULL DEFAULT 'BCCR',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_currency_fecha (fecha, moneda, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. clients  (Clientes - ingresos)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre             VARCHAR(255) NOT NULL,
  cedula             VARCHAR(50) NOT NULL,
  tipo_cedula        ENUM('FISICA','JURIDICA','DIMEX','NITE') NULL,
  estado_hacienda    VARCHAR(80) NULL,
  contacto_email     VARCHAR(190) NULL,
  contacto_telefono  VARCHAR(60) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_cedula (cedula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. income_invoices  (Facturas de ingreso)
-- ============================================================
CREATE TABLE IF NOT EXISTS income_invoices (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id         BIGINT UNSIGNED NOT NULL,
  numero_factura    VARCHAR(80) NOT NULL,
  fecha_emision     DATE NOT NULL,
  fecha_vencimiento DATE NULL,
  moneda            ENUM('CRC','USD','EUR') NOT NULL DEFAULT 'CRC',
  monto_total       DECIMAL(14,2) NOT NULL,
  estado            ENUM('PAGADA','PENDIENTE','VENCIDA') NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago        DATE NULL,
  document_id       BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_income_client (client_id),
  KEY idx_income_estado (estado),
  KEY idx_income_fecha (fecha_emision),
  CONSTRAINT fk_income_client   FOREIGN KEY (client_id)   REFERENCES clients(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_income_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. payments  (Cobros aplicados a income_invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  income_invoice_id BIGINT UNSIGNED NOT NULL,
  monto             DECIMAL(14,2) NOT NULL,
  fecha             DATE NOT NULL,
  metodo            ENUM('TRANSFERENCIA','EFECTIVO','CHEQUE','SINPE','TARJETA') NOT NULL,
  referencia        VARCHAR(190) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_invoice (income_invoice_id),
  CONSTRAINT fk_payments_invoice FOREIGN KEY (income_invoice_id) REFERENCES income_invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. chatbot_queries  (Bitacora del chatbot contable)
-- ============================================================
CREATE TABLE IF NOT EXISTS chatbot_queries (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                BIGINT UNSIGNED NOT NULL,
  pregunta_natural       TEXT NOT NULL,
  consulta_estructurada  JSON NULL,
  sql_ejecutado          TEXT NULL,
  respuesta              TEXT NULL,
  duracion_ms            INT UNSIGNED NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chatbot_user (user_id),
  CONSTRAINT fk_chatbot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
