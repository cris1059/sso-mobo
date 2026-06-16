-- Migración: columna pass (texto plano) -> pass_hash (bcrypt)
USE mobonet;

SET @has_pass := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'mobonet'
      AND TABLE_NAME = 'userSSO'
      AND COLUMN_NAME = 'pass'
);

SET @sql := IF(
    @has_pass > 0,
    'ALTER TABLE userSSO CHANGE pass pass_hash VARCHAR(255) NULL COMMENT ''Contraseña hasheada con bcrypt ($2y$...)''',
    'SELECT ''Columna pass no existe, sin cambios'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
