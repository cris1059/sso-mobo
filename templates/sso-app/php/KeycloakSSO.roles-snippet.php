<?php
/**
 * Fragmentos para integrar en KeycloakSSO.php de apps PHP.
 * Ver templates/sso-app/README.md
 */
require_once __DIR__ . '/SsoAppRoles.php';

// Tras leer $clientRoles del token:
$internalRoles = SsoAppRoles::internalRoles($clientRoles);
$primaryRole   = SsoAppRoles::primaryRole($clientRoles);
$_SESSION['sso_client_roles']   = $clientRoles;
$_SESSION['sso_internal_roles'] = $internalRoles;
$_SESSION['sso_primary_role']   = $primaryRole;

// En callback de login, sesión de la app:
// $session['sso_roles'] = $internalRoles;
// $session['sso_role']  = $primaryRole;

// Restringir pantallas:
// if (!SsoAppRoles::hasRole(KeycloakSSO::getClientRolesFromSession(), 'admin')) { ... }
