---
name: integrate-mobo-sso
description: >-
  Integra aplicaciones al SSO MOBO (Keycloak realm mobo, Authorization Code,
  roles access/internos, step-up 2FA por rol, ACR, logout RP-Initiated). Usar cuando el usuario pida
  conectar una app a SSO, OIDC, Keycloak, login central, client_id, logout,
  OTP, 2FA por rol, step-up, DevelopAdmin, o registrar un sistema en la consola admin.
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
4. Ambiente y URLs exactas mostradas por la consola en **Ayuda** (no inferir ni cambiar dominios)
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
- [ ] Si existe `otp_required`: solicitar step-up con `acr_values=mobo-2fa`
- [ ] Validar firma/issuer/audience/vigencia y exigir `acr=mobo-2fa`
- [ ] Cada autorización usa `state`, `nonce` y PKCE nuevos; validar state + nonce
- [ ] Persistir y revalidar `acr` + `requires_2fa` en la sesión local
- [ ] Logout: /logout de LA APP → end_session con id_token_hint (misma pestaña)
- [ ] Usuario de prueba vinculado + roles en consola
```

## Reglas duras

| Sí | No |
|----|-----|
| Realm `mobo` | Realm `master` para apps |
| Secret solo backend | Secret en frontend |
| Rol `access` = puede entrar | Confiar solo en sesión local sin validar access |
| `otp_required` = la app inicia step-up | Forzar OTP por nombre local como `admin` |
| Validar token firmado + `acr` | Decodificar JWT y confiar en el payload |
| `state` + `nonce` + PKCE nuevos por intento | Reutilizar transacciones OIDC |
| Logout = redirect 302 misma pestaña | `window.open` / abrir `…/logout` a mano |
| Leer `id_token` **antes** de destroy | Destroy y luego armar logout URL |

## Endpoints OIDC

```
{KC}/realms/mobo/protocol/openid-connect/auth
{KC}/realms/mobo/protocol/openid-connect/token
{KC}/realms/mobo/protocol/openid-connect/logout
{KC}/realms/mobo/protocol/openid-connect/userinfo
```

**Valores canónicos por defecto (confirmar en Ayuda):**
- Keycloak: `https://sso.mobo.com.mx/auth`
- Consola: `https://sso.mobo.com.mx/admin`

## Variables mínimas

```env
SSO_KC_ISSUER=https://sso.mobo.com.mx/auth/realms/mobo
SSO_KC_BASE=https://sso.mobo.com.mx/auth/realms/mobo/protocol/openid-connect
SSO_CLIENT_ID=mi-app
SSO_CLIENT_SECRET=…          # de la consola, Sistemas → secret
SSO_REDIRECT_URI=https://mi-app…/sso-callback
SSO_POST_LOGOUT_URI=https://mi-app…/
```

## Login (patrón)

1. Sin sesión → redirect a `/auth` con `client_id`, `redirect_uri`, `response_type=code`, `scope=openid profile email`, `state`.
2. Callback recibe `code` → POST `/token` (backend) → tokens.
3. Validar firma, issuer, vigencia y cliente autorizado del access token; después leer `resource_access[client_id].roles`.
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

## Step-up 2FA por rol interno

La consola puede marcar cualquier rol interno como **Requiere 2FA**. Keycloak añade el indicador genérico:

```json
"resource_access": {
  "mi-app": { "roles": ["access", "admin", "otp_required"] }
}
```

No codificar `role == "admin"` ni otros nombres locales. Si aparece `otp_required` y el token validado no tiene `acr=mobo-2fa`:

1. No crear ni elevar la sesión todavía.
2. Crear una transacción nueva con `state`, `nonce`, PKCE y `return_to` interno.
3. Autorizar nuevamente con `acr_values=mobo-2fa`.
4. Validar firma, issuer, audience, vigencia, `state` y `nonce`.
5. Aceptar privilegios sólo si el token final contiene `acr=mobo-2fa`.

Guardar `acr` y `requires_2fa` en la sesión. Revalidarlos al renovar tokens y proteger operaciones privilegiadas con middleware del servidor. Nunca confiar sólo en valores del frontend ni en un JWT meramente decodificado.

## Errores frecuentes

| Síntoma | Causa |
|---------|--------|
| `invalid_redirect_uri` | Callback ≠ Redirect URI registrada |
| Error en `/token` | Secret mal / regenerado |
| Login OK, “sin acceso” | Usuario no vinculado o sin `access` |
| Tiene `otp_required` pero no aparece OTP | La app no solicita `acr_values=mobo-2fa` o falta el flujo LoA |
| Step-up regresa sin privilegios | Falta validar/persistir `acr=mobo-2fa` |
| OTP se pide siempre | Se reutiliza mal la transacción o no se conserva LoA 2 |
| `state mismatch` | Se guarda un solo state o se reutiliza entre pestañas |
| Logout pide confirmación | Falta `id_token_hint` |
| Logout no vuelve a la app | `post_logout_redirect_uri` no válida |

## Cómo trabajar en el chat

1. Confirmar datos de la sección «Antes de codear».
2. Inspeccionar el repo de la app destino (rutas login existentes).
3. Implementar login + callback + guard + step-up 2FA + logout.
4. Probar login normal, rol protegido, ACR inválido, varias pestañas y logout.
5. Dejar checklist de prueba en consola (vincular usuario, activar 2FA por rol, login/logout).
5. No inventar secretos ni URLs; usar las del usuario/consola.

## Prompt listo

Ver [prompt.md](prompt.md) — pegarlo en un chat nuevo al integrar cada sistema.
