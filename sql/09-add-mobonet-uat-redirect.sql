-- Agrega URLs UAT al sistema mobonet (conserva mobonet.localhost)
USE SSOMOBO;

UPDATE sistemaSSO
SET redirect_uris = '["http://mobonet.localhost/*", "http://uat.mobonet.mx/*"]'
WHERE client_id = 'mobonet';
