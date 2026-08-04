-- Migración: agrega roleSSO y columna rol en userSSO (instalaciones existentes)
USE SSOMOBO;

CREATE TABLE IF NOT EXISTS roleSSO
(
    id          TINYINT      NOT NULL,
    nombre      VARCHAR(50)  NOT NULL,
    descripcion VARCHAR(255) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_roleSSO_nombre (nombre)
)
    COLLATE = utf8_bin;

INSERT INTO roleSSO (id, nombre, descripcion) VALUES
    (1, 'Admin',   'Administrador del sistema SSO'),
    (2, 'Usuario', 'Usuario estándar de aplicaciones')
ON DUPLICATE KEY UPDATE
    nombre      = VALUES(nombre),
    descripcion = VALUES(descripcion);

SET @has_rol := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'userSSO'
      AND COLUMN_NAME = 'rol'
);

SET @sql_add_rol := IF(
    @has_rol = 0,
    'ALTER TABLE userSSO ADD COLUMN rol TINYINT NOT NULL DEFAULT 2 COMMENT ''FK roleSSO: 1=Admin, 2=Usuario'' AFTER enabled',
    'SELECT ''Columna rol ya existe'' AS info'
);

PREPARE stmt FROM @sql_add_rol;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE userSSO SET rol = 1 WHERE user = 'admin';
UPDATE userSSO SET rol = 2 WHERE rol IS NULL OR rol NOT IN (1, 2);

SET @has_fk := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'userSSO'
      AND CONSTRAINT_NAME = 'fk_userSSO_rol'
);

SET @sql_fk := IF(
    @has_fk = 0,
    'ALTER TABLE userSSO ADD CONSTRAINT fk_userSSO_rol FOREIGN KEY (rol) REFERENCES roleSSO (id)',
    'SELECT ''FK fk_userSSO_rol ya existe'' AS info'
);

PREPARE stmt2 FROM @sql_fk;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
