-- Vinculación puesto ↔ sistema (acceso SSO por puesto)
USE SSOMOBO;

CREATE TABLE IF NOT EXISTS orgPuesto_sistema
(
    puesto_id       INT          NOT NULL,
    sistema_id      INT          NOT NULL,
    sistema_role_id INT          NULL,
    linked_by       VARCHAR(100) NULL COMMENT 'Quién configuró el vínculo puesto-sistema',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (puesto_id, sistema_id),
    KEY idx_orgPuesto_sistema_sistema (sistema_id),
    CONSTRAINT fk_orgPuesto_sistema_puesto
        FOREIGN KEY (puesto_id) REFERENCES orgPuesto (id) ON DELETE CASCADE,
    CONSTRAINT fk_orgPuesto_sistema_sistema
        FOREIGN KEY (sistema_id) REFERENCES sistemaSSO (id) ON DELETE CASCADE,
    CONSTRAINT fk_orgPuesto_sistema_role
        FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE SET NULL
)
    COLLATE = utf8_bin
    COMMENT = 'Sistemas asignados a un puesto; se propagan a userSSO_sistema';
