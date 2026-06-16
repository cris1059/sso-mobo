-- Catálogo de roles SSO
USE mobonet;

CREATE TABLE IF NOT EXISTS roleSSO
(
    id          TINYINT      NOT NULL
        COMMENT '1=Admin, 2=Usuario, 3=developAdmin',
    nombre      VARCHAR(50)  NOT NULL,
    descripcion VARCHAR(255) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_roleSSO_nombre (nombre)
)
    COLLATE = utf8_bin
    COMMENT = 'Roles del sistema SSO MOBO';

INSERT INTO roleSSO (id, nombre, descripcion) VALUES
    (1, 'Admin',        'Administrador del sistema SSO'),
    (2, 'Usuario',      'Usuario estandar de aplicaciones'),
    (3, 'developAdmin', 'Administrador de uno o mas sistemas SSO')
ON DUPLICATE KEY UPDATE
    nombre      = VALUES(nombre),
    descripcion = VALUES(descripcion);
