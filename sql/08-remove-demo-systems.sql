-- Elimina sistemas demo node-app y php-app (Keycloak + MoboNet)
USE mobonet;

DELETE FROM userSSO_sistema
WHERE sistema_id IN (SELECT id FROM sistemaSSO WHERE client_id IN ('node-app', 'php-app'));

DELETE FROM sistemaSSO WHERE client_id IN ('node-app', 'php-app');
