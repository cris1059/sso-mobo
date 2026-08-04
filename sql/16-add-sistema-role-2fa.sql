-- Step-up 2FA configurable por rol interno de cada sistema.
-- Es retrocompatible: todos los roles existentes quedan desactivados.
USE SSOMOBO;

SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sistemaRoleSSO'
      AND COLUMN_NAME = 'require_2fa'
);
SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE sistemaRoleSSO ADD COLUMN require_2fa TINYINT(1) NOT NULL DEFAULT 0 AFTER is_default',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
