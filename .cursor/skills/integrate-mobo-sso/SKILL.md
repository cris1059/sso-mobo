---
name: integrate-mobo-sso
description: >-
  Integra aplicaciones al SSO MOBO (Keycloak realm mobo, Authorization Code,
  roles access/internos, logout RP-Initiated). Usar cuando el usuario pida
  conectar una app a SSO, OIDC, Keycloak, login central, client_id, logout,
  DevelopAdmin, o registrar un sistema en la consola admin.
---

# Integrar app al SSO MOBO

## Fuentes de verdad (leer si hace falta)

- `GUIA-PROYECTO-E-INTEGRACION.md`
- Consola Ayuda (admin-portal § login + logout)
- Plantillas: `templates/sso-app/`
- PHP referencia: `scripts/_KeycloakSSO.php`

## Antes de codear — pedir / confirmar

1. `client_id` (ej. `mi-reportes`)
2. Stack: PHP | Node | otro
3. URL pública de la app + callback exacto (`…/sso-callback`)
4. Ambiente: **PROD** (`auth.sso.mobo.com.mx` / `admin.sso.mobo.com.mx`) | local
5. Roles internos necesarios (`admin`, `usuario`, `consulta`, …)

Si falta el sistema en consola: indicar crear en **Sistemas** (Redirect URI, secret, roles, usuarios).

## Checklist de integración

```
- [ ] Sistema en consola admin + client secret en backend (.env)
- [ ] Redirect URI exacta registrada
- [ ] Login: redirect a /auth (scope openid profile email + state)
- [ ] Callback: code→token en BACKEND (secret nunca al browser)
- [ ] Validar resource_access[client_id].roles incluye "access"
- [ ] Guardar sesión app + id_token (para logout)
- [ ] Roles internos desde token (sin "access")
- [ ] Logout: /logout de LA APP → end_session con id_token_hint (misma pestaña)
- [ ] Usuario de prueba vinculado + roles en consola
```

## Reglas duras

| Sí | No |
|----|-----|
| Realm `mobo` | Realm `master` para apps |
| Secret solo backend | Secret en frontend |
| Rol `access` = puede entrar | Confiar solo en sesión local sin validar access |
| Logout = redirect 302 misma pestaña | `window.open` / abrir `…/logout` a mano |
| Leer `id_token` **antes** de destroy | Destroy y luego armar logout URL |

## Endpoints OIDC

```
http://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect/auth
http://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect/token
http://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect/logout
http://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect/userinfo
```

**PROD (por defecto):**
- Keycloak: `http://sso.mobo.com.mx/auth`
- Consola: `http://sso.mobo.com.mx/admin`

## Variables mínimas

```env
SSO_KC_ISSUER=http://sso.mobo.com.mx/auth/realms/mobo
SSO_KC_BASE=http://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect
SSO_CLIENT_ID=mi-app
SSO_CLIENT_SECRET=…          # de la consola, Sistemas → secret
SSO_REDIRECT_URI=https://mi-app…/sso-callback
SSO_POST_LOGOUT_URI=https://mi-app…/
```

## Login (patrón)

1. Sin sesión → redirect a `/auth` con `client_id`, `redirect_uri`, `response_type=code`, `scope=openid profile email`, `state`.
2. Callback recibe `code` → POST `/token` (backend) → tokens.
3. Decodificar access token → `resource_access[client_id].roles`.
4. Sin `access` → denegar (no crear sesión de app).
5. Sesión local: username, nombre, email, `sso_roles` (internos), guardar **id_token**.

### PHP

- Copiar/adaptar `scripts/_KeycloakSSO.php` + `templates/sso-app/php/SsoAppRoles.php`.
- Callback: `KeycloakSSO::handleCallback()` → sesión app si `has_access`.
- Roles: `KeycloakSSO::hasInternalRole('admin')`.

### Node

- `openid-client` + `templates/sso-app/node/sso-roles.js`.
- `hasSystemAccess(accessTokenPayload, clientId)`.
- `getInternalRoles` / `getPrimaryInternalRole`.

## Logout (patrón obligatorio)

Usuario → `<a href="/logout">` de **tu app** (no la URL de Keycloak).

1. Capturar `id_token` de sesión.
2. Destruir sesión local.
3. Redirect a:

```
{SSO_KC_BASE}/logout
  ?id_token_hint=…
  &client_id=…
  &post_logout_redirect_uri=…
```

- PHP: `KeycloakSSO::logoutRedirect()`
- Sin `id_token_hint` → pantalla «Confirmar cierre» / «Estás desconectado».
- Abrir solo `…/logout` en el browser = incorrecto (no vuelve a la app).

## Roles en el token

```json
"resource_access": {
  "mi-app": { "roles": ["access", "admin", "consulta"] }
}
```

- `access` = gate de entrada (consola lo sincroniza al vincular usuario).
- Resto = permisos de negocio de la app.

## Errores frecuentes

| Síntoma | Causa |
|---------|--------|
| `invalid_redirect_uri` | Callback ≠ Redirect URI registrada |
| Error en `/token` | Secret mal / regenerado |
| Login OK, “sin acceso” | Usuario no vinculado o sin `access` |
| Logout pide confirmación | Falta `id_token_hint` |
| Logout no vuelve a la app | `post_logout_redirect_uri` no válida |

## Cómo trabajar en el chat

1. Confirmar datos de la sección «Antes de codear».
2. Inspeccionar el repo de la app destino (rutas login existentes).
3. Implementar mínimo: login + callback + guard + logout.
4. Dejar checklist de prueba en consola (vincular usuario, probar login/logout).
5. No inventar secretos ni URLs; usar las del usuario/consola.

## Prompt listo

Ver [prompt.md](prompt.md) — pegarlo en un chat nuevo al integrar cada sistema.
