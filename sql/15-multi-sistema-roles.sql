-- Múltiples roles internos por vínculo usuario↔sistema y puesto↔sistema
USE SSOMOBO;

CREATE TABLE IF NOT EXISTS userSSO_sistema_role
(
    user            VARCHAR(100) NOT NULL,
    sistema_id      INT          NOT NULL,
    sistema_role_id INT          NOT NULL,
    PRIMARY KEY (user, sistema_id, sistema_role_id),
    KEY idx_ussr_sistema (sistema_id),
    KEY idx_ussr_role (sistema_role_id),
    CONSTRAINT fk_ussr_link
        FOREIGN KEY (user, sistema_id) REFERENCES userSSO_sistema (user, sistema_id) ON DELETE CASCADE,
    CONSTRAINT fk_ussr_role
        FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE CASCADE
)
    COLLATE = utf8_bin
    COMMENT = 'Roles internos asignados a un usuario en un sistema';

CREATE TABLE IF NOT EXISTS orgPuesto_sistema_role
(
    puesto_id       INT NOT NULL,
    sistema_id      INT NOT NULL,
    sistema_role_id INT NOT NULL,
    PRIMARY KEY (puesto_id, sistema_id, sistema_role_id),
    KEY idx_opsr_sistema (sistema_id),
    KEY idx_opsr_role (sistema_role_id),
    CONSTRAINT fk_opsr_link
        FOREIGN KEY (puesto_id, sistema_id) REFERENCES orgPuesto_sistema (puesto_id, sistema_id) ON DELETE CASCADE,
    CONSTRAINT fk_opsr_role
        FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE CASCADE
)
    COLLATE = utf8_bin
    COMMENT = 'Roles internos de la política puesto↔sistema';

-- Migrar rol único existente
INSERT IGNORE INTO userSSO_sistema_role (user, sistema_id, sistema_role_id)
SELECT user, sistema_id, sistema_role_id
FROM userSSO_sistema
WHERE sistema_role_id IS NOT NULL;

INSERT IGNORE INTO orgPuesto_sistema_role (puesto_id, sistema_id, sistema_role_id)
SELECT puesto_id, sistema_id, sistema_role_id
FROM orgPuesto_sistema
WHERE sistema_role_id IS NOT NULL;
