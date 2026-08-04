USE SSOMOBO;

CREATE TABLE IF NOT EXISTS auditSSO (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sistema_id INT NOT NULL,
    actor_user VARCHAR(100) NOT NULL,
    actor_rol TINYINT NULL,
    accion VARCHAR(120) NOT NULL,
    metodo VARCHAR(10) NOT NULL,
    ruta VARCHAR(500) NOT NULL,
    detalle JSON NULL,
    ip VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_auditSSO_sistema_fecha (sistema_id, created_at),
    KEY idx_auditSSO_actor_fecha (actor_user, created_at),
    CONSTRAINT fk_auditSSO_sistema FOREIGN KEY (sistema_id)
        REFERENCES sistemaSSO (id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
