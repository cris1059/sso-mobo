-- 13: userSSO con llaves foráneas a catálogos org*
-- Ejecutar vía: py -3 scripts/migrate-userSSO-org-fks.py
-- Árbol: orgDivision → orgArea → orgRegion → orgStore → orgPuesto
USE SSOMOBO;

-- Resultado en userSSO:
--   division_id INT NOT NULL  → orgDivision(id)
--   area_id     INT NOT NULL  → orgArea(id)
--   region_id   INT NULL      → orgRegion(id)  ON DELETE SET NULL
--   store_id    INT NULL      → orgStore(id)   ON DELETE SET NULL
--   puesto_id   INT NOT NULL  → orgPuesto(id)
-- Columnas texto eliminadas: division, area, region, store, jobD
-- dept se conserva como VARCHAR (departamento interno)
