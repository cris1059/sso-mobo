# Prompt para integrar un sistema al SSO MOBO (PROD)

Copia y pega esto en un chat nuevo (completa los campos entre `« »`).

---

```
Usa la skill integrate-mobo-sso y la guía GUIA-PROYECTO-E-INTEGRACION.md / Ayuda de la consola.

Integra esta aplicación al SSO MOBO en PRODUCCIÓN (Keycloak realm mobo, OIDC Authorization Code).

Datos del sistema:
- Nombre / client_id: «ej. portal-sed-dos»
- Stack: «PHP | Node | otro»
- URL pública de la app: «https://…»
- Callback (redirect_uri): «https://…/sso-callback»
- Post-logout URI: «https://…/»
- Ambiente: PROD
- Issuer Keycloak: «http://auth.sso.mobo.com.mx/realms/mobo»
- Consola admin: «http://admin.sso.mobo.com.mx»
- Client secret: «lo pego del panel Sistemas (no lo subas a git)»
- Roles internos que necesita la app: «admin, usuario, consulta»
- Ruta del repo / carpeta de la app: «…»

Haz esto:
1. Revisa el código actual de login/sesión de la app.
2. Implementa login → callback → validación de rol access → sesión local.
3. Guarda id_token para logout.
4. Implementa /logout en la MISMA pestaña (id_token_hint + post_logout_redirect_uri). Nunca window.open ni abrir …/openid-connect/logout a mano.
5. El client secret solo en backend (.env).
6. Déjame un checklist de prueba: crear/vincular usuario en consola, login, roles, logout.

No inventes URLs ni secretos. Si falta registrar el sistema en la consola admin, indícamelo antes.
No uses dominios UAT; el ambiente activo es PROD.
```

---

## Variante corta

```
Skill integrate-mobo-sso: conecta esta app a SSO MOBO PROD (realm mobo).
auth=http://auth.sso.mobo.com.mx · admin=http://admin.sso.mobo.com.mx
client_id=«…», stack=«…», callback=«…», post_logout=«…».
Login + callback + access + roles internos + logout misma pestaña con id_token_hint.
Secret solo backend. Checklist de prueba al final.
```
