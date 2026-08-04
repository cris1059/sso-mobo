<?php
/**
 * KeycloakSSO.php
 * Maneja el flujo OpenID Connect con Keycloak para MoboNet.
 * No requiere librerías externas — usa cURL nativo de PHP.
 */
require_once __DIR__ . '/sso-config.php';
require_once __DIR__ . '/SsoAppRoles.php';

class KeycloakSSO
{
    private static function kcBase()
    {
        return SSO_KC_BASE;
    }

    private static function redirectUri()
    {
        return SSO_REDIRECT_URI;
    }

    private static function clientId()
    {
        return SSO_CLIENT_ID;
    }

    private static function clientSecret()
    {
        return SSO_CLIENT_SECRET;
    }

    private static function clearSsoTokens()
    {
        unset(
            $_SESSION['sso_state'],
            $_SESSION['sso_access_token'],
            $_SESSION['sso_refresh_token'],
            $_SESSION['sso_id_token'],
            $_SESSION['sso_check_time']
        );
        unset($_SESSION['sso_client_roles'], $_SESSION['sso_internal_roles'], $_SESSION['sso_primary_role']);
    }

    private static function storeTokens(array $tokens)
    {
        $_SESSION['sso_access_token'] = $tokens['access_token'];
        if (!empty($tokens['refresh_token'])) {
            $_SESSION['sso_refresh_token'] = $tokens['refresh_token'];
        }
        if (!empty($tokens['id_token'])) {
            $_SESSION['sso_id_token'] = $tokens['id_token'];
        }
    }

    // ─── Roles internos (client roles excepto access) ───────────────────────
    public static function getClientRolesFromToken(array $payload): array
    {
        return $payload['resource_access'][self::clientId()]['roles'] ?? [];
    }

    public static function getClientRolesFromSession(): array
    {
        if (!empty($_SESSION['sso_client_roles']) && is_array($_SESSION['sso_client_roles'])) {
            return $_SESSION['sso_client_roles'];
        }
        if (empty($_SESSION['sso_access_token'])) {
            return [];
        }
        return self::getClientRolesFromToken(self::decodeJWT($_SESSION['sso_access_token']));
    }

    public static function getInternalRoles(array $clientRoles): array
    {
        return SsoAppRoles::internalRoles($clientRoles);
    }

    public static function getPrimaryInternalRole(array $clientRoles): ?string
    {
        return SsoAppRoles::primaryRole($clientRoles);
    }

    public static function hasInternalRole(string $codigo): bool
    {
        return SsoAppRoles::hasRole(self::getClientRolesFromSession(), $codigo);
    }

    public static function hasAnyInternalRole(array $codigos): bool
    {
        return SsoAppRoles::hasAnyRole(self::getClientRolesFromSession(), $codigos);
    }

    public static function requireInternalRole(string $codigo, ?string $message = null): void
    {
        if (!self::hasInternalRole($codigo)) {
            $msg = $message ?? 'No tienes permiso para esta sección (' . SsoAppRoles::label($codigo) . ').';
            header('Location: ' . SERVERURL . '?sso_error=' . urlencode($msg));
            exit;
        }
    }

    private static function persistRoleContext(array $clientRoles): void
    {
        $_SESSION['sso_client_roles'] = $clientRoles;
        $_SESSION['sso_internal_roles'] = self::getInternalRoles($clientRoles);
        $_SESSION['sso_primary_role'] = self::getPrimaryInternalRole($clientRoles);
    }

    // ─── Verifica rol access vigente en el token guardado ───────────────────
    public static function hasSystemAccess()
    {
        if (empty($_SESSION['sso_access_token'])) {
            return false;
        }
        $payload = self::decodeJWT($_SESSION['sso_access_token']);
        $clientRoles = $payload['resource_access'][self::clientId()]['roles'] ?? [];
        return in_array('access', $clientRoles, true);
    }

    // ─── Renueva el access token si expira y valida la sesión ───────────────
    public static function ensureSessionActive()
    {
        if (empty($_SESSION['sso_access_token'])) {
            return false;
        }

        if (self::accessTokenExpiringSoon($_SESSION['sso_access_token'])) {
            if (!self::refreshAccessToken()) {
                return self::isSessionValid();
            }
        }

        return self::isSessionValid();
    }

    // ─── Verifica si la sesión de Keycloak sigue activa ─────────────────────
    // Llama al endpoint userinfo — si devuelve 401, la sesión expiró
    public static function isSessionValid()
    {
        if (empty($_SESSION['sso_access_token'])) return false;

        $ch = curl_init(self::kcBase() . '/userinfo');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $_SESSION['sso_access_token']],
            CURLOPT_TIMEOUT        => 3,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code === 200;
    }

    // ─── Redirige al login de Keycloak ───────────────────────────────────────
    public static function redirectToLogin()
    {
        if (session_status() === PHP_SESSION_NONE) session_start();

        self::clearSsoTokens();

        $state = bin2hex(random_bytes(16));
        $_SESSION['sso_state'] = $state;

        // Forzar escritura de sesión al disco ANTES de redirigir
        session_write_close();

        $url = self::kcBase() . '/auth?' . http_build_query([
            'client_id'     => self::clientId(),
            'redirect_uri'  => self::redirectUri(),
            'response_type' => 'code',
            'scope'         => 'openid profile email',
            'state'         => $state,
        ]);

        header('Location: ' . $url);
        exit;
    }

    // ─── Reinicio silencioso: reutiliza sesión de Keycloak sin pedir contraseña
    public static function redirectToLoginSilent()
    {
        if (session_status() === PHP_SESSION_NONE) session_start();

        self::clearSsoTokens();

        $state = bin2hex(random_bytes(16));
        $_SESSION['sso_state'] = $state;

        // Forzar escritura de sesión al disco ANTES de redirigir
        session_write_close();

        $url = self::kcBase() . '/auth?' . http_build_query([
            'client_id'     => self::clientId(),
            'redirect_uri'  => self::redirectUri(),
            'response_type' => 'code',
            'scope'         => 'openid profile email',
            'state'         => $state,
        ]);

        header('Location: ' . $url);
        exit;
    }

    // ─── Procesa el callback de Keycloak ─────────────────────────────────────
    public static function handleCallback()
    {
        if (session_status() === PHP_SESSION_NONE) session_start();

        // Validar state para prevenir CSRF
        if (!isset($_GET['state']) || $_GET['state'] !== ($_SESSION['sso_state'] ?? '')) {
            // State no coincide — restart silencioso usando sesión SSO activa
            unset($_SESSION['sso_state'], $_SESSION['sso_access_token'], $_SESSION['sso_refresh_token']);
            self::redirectToLoginSilent();
        }

        if (isset($_GET['error'])) {
            self::redirectError($_GET['error_description'] ?? $_GET['error']);
        }

        if (empty($_GET['code'])) {
            unset($_SESSION['sso_state']);
            self::redirectToLoginSilent();
        }

        // Intercambiar código por token
        $tokens = self::exchangeCode($_GET['code']);
        if (empty($tokens['access_token'])) {
            // Código expirado o ya usado — reiniciar login limpio
            unset($_SESSION['sso_state'], $_SESSION['sso_access_token'], $_SESSION['sso_refresh_token']);
            self::redirectToLogin();
        }

        // Guardar tokens para logout, refresh y verificación de sesión
        self::storeTokens($tokens);
        $_SESSION['sso_check_time'] = time(); // No verificar en el primer request post-login

        // Decodificar payload del token
        $payload = self::decodeJWT($tokens['access_token']);

        // Roles de realm (Admin, Usuario, etc.)
        $realmRoles = $payload['realm_access']['roles'] ?? [];

        // Rol de acceso al sistema: client role "access" en el cliente mobonet
        $clientRoles = self::getClientRolesFromToken($payload);
        $hasAccess = in_array('access', $clientRoles, true);
        $internalRoles = self::getInternalRoles($clientRoles);
        $primaryRole = self::getPrimaryInternalRole($clientRoles);

        self::persistRoleContext($clientRoles);

        return [
            'username'       => $payload['preferred_username'] ?? '',
            'email'          => $payload['email'] ?? '',
            'nombre'         => trim(($payload['given_name'] ?? '') . ' ' . ($payload['family_name'] ?? '')),
            'roles'          => $realmRoles,
            'client_roles'   => $clientRoles,
            'internal_roles' => $internalRoles,
            'primary_role'   => $primaryRole,
            'has_access'     => $hasAccess,
        ];
    }

    // ─── URL de logout en Keycloak ───────────────────────────────────────────
    // Logout RP-Initiated en la MISMA pestaña (redirect 302). No uses window.open.
    // Con id_token_hint Keycloak no muestra pantalla de confirmación.
    public static function logoutUrl(?string $postLogoutUri = null)
    {
        if (session_status() === PHP_SESSION_NONE) session_start();

        $postLogout = $postLogoutUri
            ?: (defined('SSO_POST_LOGOUT_URI') ? SSO_POST_LOGOUT_URI : SERVERURL);

        $params = [
            'client_id'                => self::clientId(),
            'post_logout_redirect_uri' => $postLogout,
        ];
        if (!empty($_SESSION['sso_id_token'])) {
            $params['id_token_hint'] = $_SESSION['sso_id_token'];
        }

        return self::kcBase() . '/logout?' . http_build_query($params);
    }

    /** Construye la URL ANTES de destruir la sesión y redirige en la misma pestaña. */
    public static function logoutRedirect(?string $postLogoutUri = null): void
    {
        if (session_status() === PHP_SESSION_NONE) session_start();

        $url = self::logoutUrl($postLogoutUri);
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        header('Location: ' . $url);
        exit;
    }

    // ─── Intercambio de código por token ─────────────────────────────────────
    private static function exchangeCode($code)
    {
        return self::requestToken([
            'grant_type'   => 'authorization_code',
            'redirect_uri' => self::redirectUri(),
            'code'         => $code,
        ]);
    }

    private static function refreshAccessToken()
    {
        if (empty($_SESSION['sso_refresh_token'])) {
            return false;
        }

        $tokens = self::requestToken([
            'grant_type'    => 'refresh_token',
            'refresh_token' => $_SESSION['sso_refresh_token'],
        ]);

        if (empty($tokens['access_token'])) {
            return false;
        }

        self::storeTokens($tokens);
        $payload = self::decodeJWT($tokens['access_token']);
        self::persistRoleContext(self::getClientRolesFromToken($payload));
        return true;
    }

    private static function requestToken(array $params)
    {
        $params['client_id']     = self::clientId();
        $params['client_secret'] = self::clientSecret();

        $ch = curl_init(self::kcBase() . '/token');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($params),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $result = curl_exec($ch);
        curl_close($ch);

        return json_decode($result, true) ?? [];
    }

    private static function accessTokenExpiringSoon($token, $bufferSeconds = 60)
    {
        $payload = self::decodeJWT($token);
        $exp = $payload['exp'] ?? 0;
        return $exp <= time() + $bufferSeconds;
    }

    // ─── Decodifica JWT sin verificar firma (Keycloak ya lo validó) ──────────
    private static function decodeJWT($token)
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return [];

        $payload = strtr($parts[1], '-_', '+/');
        $payload = base64_decode(str_pad($payload, strlen($payload) % 4 === 0 ? strlen($payload) : strlen($payload) + (4 - strlen($payload) % 4), '='));

        return json_decode($payload, true) ?? [];
    }

    // ─── Redirige al login con error ─────────────────────────────────────────
    private static function redirectError($msg)
    {
        header('Location: ' . SERVERURL . '?sso_error=' . urlencode($msg));
        exit;
    }
}
