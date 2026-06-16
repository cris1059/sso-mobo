-- Tabla maestra de usuarios SSO en la BD MoboNet
-- Ejecutar: .\scripts\create-userSSO-table.ps1

USE mobonet;

CREATE TABLE IF NOT EXISTS userSSO
(
    user       VARCHAR(100) NOT NULL
        COMMENT 'Nombre de usuario / login',
    pass_hash  VARCHAR(255) NULL
        COMMENT 'Contraseña hasheada con bcrypt ($2y$...)',
    name       VARCHAR(100) NULL,
    last_name  VARCHAR(100) NULL,
    email      VARCHAR(150) NULL,
    jobD       VARCHAR(100) NULL,
    birth_date DATE         NULL,
    intrDate   DATE         NULL,
    area       VARCHAR(100) NULL,
    dept       VARCHAR(100) NULL,
    store      VARCHAR(100) NULL,
    division   VARCHAR(100) NULL,
    region     VARCHAR(100) NULL,
    gen        VARCHAR(20)  NULL,
    enabled    TINYINT(1)   NOT NULL DEFAULT 1
        COMMENT '1=activo, 0=bloqueado',
    rol        TINYINT      NOT NULL DEFAULT 2
        COMMENT 'FK a roleSSO: 1=Admin, 2=Usuario',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user),
    UNIQUE KEY uk_userSSO_email (email),
    KEY idx_userSSO_enabled (enabled),
    KEY idx_userSSO_area (area),
    KEY idx_userSSO_rol (rol),
    CONSTRAINT fk_userSSO_rol FOREIGN KEY (rol) REFERENCES roleSSO (id)
)
    COLLATE = utf8_bin
    COMMENT = 'Catálogo maestro de usuarios SSO MOBO';
