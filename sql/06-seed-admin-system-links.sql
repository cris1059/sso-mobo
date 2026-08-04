-- Vincula el usuario admin a todos los sistemas existentes
USE SSOMOBO;

INSERT INTO userSSO_sistema (user, sistema_id, linked_by)
SELECT 'admin', s.id, 'admin'
FROM sistemaSSO s
WHERE EXISTS (SELECT 1 FROM userSSO u WHERE u.user = 'admin')
ON DUPLICATE KEY UPDATE linked_by = VALUES(linked_by);
