-- ============================================================
-- DocScan Finance CR - Bootstrap MySQL
-- Ejecutar UNA SOLA VEZ como root en MySQL Workbench.
-- Crea la base de datos, el usuario dedicado y los permisos.
-- ============================================================

-- 1. Crear base de datos
CREATE DATABASE IF NOT EXISTS docscan_finance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. Crear usuario dedicado (cambiar password si lo desea)
--    La password usada aqui DEBE coincidir con DB_PASSWORD del .env
CREATE USER IF NOT EXISTS 'app_user'@'localhost'
  IDENTIFIED BY 'AppUser_DocScan_2026!';

-- 3. Permisos sobre la base
GRANT ALL PRIVILEGES ON docscan_finance.* TO 'app_user'@'localhost';

FLUSH PRIVILEGES;

-- 4. Verificacion
SELECT
  User, Host
FROM mysql.user
WHERE User = 'app_user';

SHOW GRANTS FOR 'app_user'@'localhost';
