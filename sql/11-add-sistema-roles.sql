-- Roles internos por sistema (permisos dentro de cada app)
USE SSOMOBO;

CREATE TABLE IF NOT EXISTS sistemaRoleSSO
(
    id          INT          NOT NULL AUTO_INCREMENT,
    sistema_id  INT          NOT NULL,
    codigo      VARCHAR(50)  NOT NULL COMMENT 'Nombre del client role en Keycloak',
    nombre      VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    is_default  TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_sistemaRole_codigo (sistema_id, codigo),
    KEY idx_sistemaRole_sistema (sistema_id),
    CONSTRAINT fk_sistemaRole_sistema FOREIGN KEY (sistema_id) REFERENCES sistemaSSO (id) ON DELETE CASCADE
)
    COLLATE = utf8_bin
    COMMENT = 'Roles internos de cada sistema/aplicacion';

-- Vinculo usuario-sistema con rol interno
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'userSSO_sistema' AND COLUMN_NAME = 'sistema_role_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE userSSO_sistema ADD COLUMN sistema_role_id INT NULL AFTER sistema_id',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'userSSO_sistema' AND CONSTRAINT_NAME = 'fk_userSSO_sistema_role'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE userSSO_sistema ADD CONSTRAINT fk_userSSO_sistema_role FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Roles por defecto para MoboNet (si existe)
INSERT INTO sistemaRoleSSO (sistema_id, codigo, nombre, descripcion, is_default)
SELECT s.id, r.codigo, r.nombre, r.descripcion, r.is_default
FROM sistemaSSO s
CROSS JOIN (
    SELECT 'usuario' AS codigo, 'Usuario' AS nombre, 'Acceso estandar' AS descripcion, 1 AS is_default
    UNION ALL SELECT 'admin', 'Administrador', 'Gestion completa en la app', 0
    UNION ALL SELECT 'consulta', 'Consulta', 'Solo lectura', 0
) r
WHERE s.client_id = 'mobonet'
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion);
