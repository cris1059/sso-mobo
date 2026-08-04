-- Rol developAdmin + tablas sistemaSSO y userSSO_sistema
USE SSOMOBO;

INSERT INTO roleSSO (id, nombre, descripcion) VALUES
    (3, 'developAdmin', 'Administrador de uno o mas sistemas SSO')
ON DUPLICATE KEY UPDATE
    nombre      = VALUES(nombre),
    descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS sistemaSSO
(
    id             INT          NOT NULL AUTO_INCREMENT,
    client_id      VARCHAR(100) NOT NULL
        COMMENT 'ID del cliente OIDC en Keycloak (realm mobo)',
    nombre         VARCHAR(150) NOT NULL,
    owner          VARCHAR(100) NULL
        COMMENT 'userSSO.user del developAdmin propietario; NULL = creado por Admin',
    redirect_uris  TEXT         NOT NULL
        COMMENT 'JSON array de redirect URIs',
    web_origins    VARCHAR(255) NOT NULL DEFAULT '+',
    kc_client_uuid VARCHAR(36)  NULL
        COMMENT 'UUID interno del cliente en Keycloak',
    enabled        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_sistemaSSO_client_id (client_id),
    KEY idx_sistemaSSO_owner (owner),
    CONSTRAINT fk_sistemaSSO_owner FOREIGN KEY (owner) REFERENCES userSSO (user) ON DELETE SET NULL
)
    COLLATE = utf8_bin
    COMMENT = 'Catalogo maestro de sistemas/aplicaciones SSO';

CREATE TABLE IF NOT EXISTS userSSO_sistema
(
    user       VARCHAR(100) NOT NULL,
    sistema_id INT          NOT NULL,
    linked_by  VARCHAR(100) NULL
        COMMENT 'userSSO.user que creo la vinculacion',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user, sistema_id),
    KEY idx_userSSO_sistema_sistema (sistema_id),
    CONSTRAINT fk_userSSO_sistema_user FOREIGN KEY (user) REFERENCES userSSO (user) ON DELETE CASCADE,
    CONSTRAINT fk_userSSO_sistema_sistema FOREIGN KEY (sistema_id) REFERENCES sistemaSSO (id) ON DELETE CASCADE
)
    COLLATE = utf8_bin
    COMMENT = 'Vinculacion usuario <-> sistema (acceso SSO)';

-- Sistemas iniciales (owner NULL = globales / Admin)
INSERT INTO sistemaSSO (client_id, nombre, owner, redirect_uris, web_origins, enabled) VALUES
    ('mobonet', 'MoboNet Portal', NULL, '["http://mobonet.localhost/*"]', '+', 1)
ON DUPLICATE KEY UPDATE
    nombre        = VALUES(nombre),
    redirect_uris = VALUES(redirect_uris),
    web_origins   = VALUES(web_origins),
    enabled       = VALUES(enabled);
