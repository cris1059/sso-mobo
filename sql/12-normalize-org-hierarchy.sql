-- 12+13: Jerarquía organizacional normalizada con FKs
-- Árbol: orgDivision → orgArea → (orgRegion) → orgStore → orgPuesto
-- userSSO guarda solo IDs (division_id, area_id, region_id, store_id, puesto_id)
USE SSOMOBO;

CREATE TABLE IF NOT EXISTS orgDivision (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    UNIQUE KEY uk_orgDivision_nombre (nombre)
) COLLATE = utf8_bin COMMENT = 'Catálogo de divisiones SSO';

CREATE TABLE IF NOT EXISTS orgArea (
    id INT AUTO_INCREMENT PRIMARY KEY,
    division_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    UNIQUE KEY uk_orgArea_div_nombre (division_id, nombre),
    CONSTRAINT fk_orgArea_division FOREIGN KEY (division_id) REFERENCES orgDivision (id) ON DELETE CASCADE
) COLLATE = utf8_bin COMMENT = 'Catálogo de áreas por división';

CREATE TABLE IF NOT EXISTS orgRegion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL COMMENT 'Ej. R1, R14',
    nombre VARCHAR(100) NOT NULL COMMENT 'Ej. REGIÓN 1',
    UNIQUE KEY uk_orgRegion_codigo (codigo)
) COLLATE = utf8_bin COMMENT = 'Catálogo de regiones';

CREATE TABLE IF NOT EXISTS orgStore (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    area_id INT NULL COMMENT 'FK orgArea',
    region_id INT NULL COMMENT 'FK orgRegion',
    UNIQUE KEY uk_orgStore_nombre (nombre),
    CONSTRAINT fk_orgStore_area FOREIGN KEY (area_id) REFERENCES orgArea (id) ON DELETE SET NULL,
    CONSTRAINT fk_orgStore_region FOREIGN KEY (region_id) REFERENCES orgRegion (id) ON DELETE SET NULL
) COLLATE = utf8_bin COMMENT = 'Catálogo de sucursales / ubicaciones';

CREATE TABLE IF NOT EXISTS orgPuesto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    UNIQUE KEY uk_orgPuesto_nombre (nombre)
) COLLATE = utf8_bin COMMENT = 'Catálogo de puestos';

-- userSSO: columnas FK (aplicar con scripts/migrate-userSSO-org-fks.py)
-- division_id INT NOT NULL FK orgDivision
-- area_id     INT NOT NULL FK orgArea
-- region_id   INT NULL     FK orgRegion
-- store_id    INT NULL     FK orgStore
-- puesto_id   INT NOT NULL FK orgPuesto
-- Se eliminan columnas texto: division, area, region, store, jobD
