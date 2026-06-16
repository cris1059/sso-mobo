-- Restaura el sistema MoboNet (mobonet.localhost) si ya se ejecutó la migración 05 sin él
USE mobonet;

INSERT INTO sistemaSSO (client_id, nombre, owner, redirect_uris, web_origins, enabled) VALUES
    ('mobonet', 'MoboNet Portal', NULL, '["http://mobonet.localhost/*"]', '+', 1)
ON DUPLICATE KEY UPDATE
    nombre        = VALUES(nombre),
    redirect_uris = VALUES(redirect_uris),
    web_origins   = VALUES(web_origins),
    enabled       = VALUES(enabled);

INSERT INTO userSSO_sistema (user, sistema_id, linked_by)
SELECT 'admin', s.id, 'admin'
FROM sistemaSSO s
WHERE s.client_id = 'mobonet'
  AND EXISTS (SELECT 1 FROM userSSO u WHERE u.user = 'admin')
ON DUPLICATE KEY UPDATE linked_by = VALUES(linked_by);
