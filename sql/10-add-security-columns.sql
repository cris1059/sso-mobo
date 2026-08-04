-- Seguridad SSO: primer inicio, recuperación y 2FA por rol/sistema
USE SSOMOBO;

-- PrimerInicio: 1 = debe cambiar contraseña en el próximo login
ALTER TABLE userSSO
    ADD COLUMN PrimerInicio TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=debe cambiar contraseña en el próximo login' AFTER enabled;

-- Usuarios existentes conservan su contraseña actual (no forzar cambio retroactivo)
UPDATE userSSO SET PrimerInicio = 0 WHERE PrimerInicio = 1;

-- 2FA obligatorio según rol SSO
ALTER TABLE roleSSO
    ADD COLUMN require_2fa TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1=exige OTP TOTP en login' AFTER descripcion;

-- Admin exige 2FA por defecto
UPDATE roleSSO SET require_2fa = 1 WHERE id = 1;

-- 2FA obligatorio según sistema
ALTER TABLE sistemaSSO
    ADD COLUMN require_2fa TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1=exige OTP TOTP al acceder a este sistema' AFTER enabled;
