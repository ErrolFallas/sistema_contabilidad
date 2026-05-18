-- ============================================================
-- DocScan Finance CR - migration 002: google_credentials
-- Singleton: una credencial Google del sistema (refresh_token).
-- Permite hacer OAuth desde la UI sin tener que pegar tokens al .env.
-- ============================================================

CREATE TABLE IF NOT EXISTS google_credentials (
  id              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  google_email    VARCHAR(190) NOT NULL,
  refresh_token   TEXT NOT NULL,
  scopes          TEXT NULL,
  drive_folder_id VARCHAR(190) NULL,
  last_drive_sync TIMESTAMP NULL,
  last_gmail_sync TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
