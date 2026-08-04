# Integrar roles internos en apps PHP

1. Copia `SsoAppRoles.php` a `core/SsoAppRoles.php` de tu app.
2. En `KeycloakSSO.php`:
   - `require_once __DIR__ . '/SsoAppRoles.php';`
   - Tras leer `$clientRoles`, calcula `internal_roles` y `primary_role`.
   - Guarda en `$_SESSION['sso_internal_roles']` y `$_SESSION['sso_primary_role']`.
3. En el callback de login, mete en la sesión de la app:
   ```php
   'sso_roles' => $sso['internal_roles'],
   'sso_role'  => $sso['primary_role'],
   ```
4. Para restringir pantallas:
   ```php
   if (!KeycloakSSO::hasInternalRole('admin')) { /* denegar */ }
   ```

Roles en token: `access` (entrar) + rol interno (`usuario`, `admin`, `consulta`, …).

# Apps Node

Copia `node/sso-roles.js` y usa `hasInternalRole(decodedAccessToken, CLIENT_ID, 'admin')`.

# Secreto del cliente (consola admin → Sistemas)

Es el **client secret OIDC** de Keycloak. La app backend lo usa en `/token` para intercambiar el código de login por tokens. **No va en el navegador.** Guárdalo en `sso-config.php`, `.env` o variables del servidor.
