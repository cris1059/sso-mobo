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
- Issuer Keycloak: «copiar el valor exacto mostrado en Ayuda»
- Consola admin: «copiar el valor exacto mostrado en Ayuda»
- Client secret: «lo pego del panel Sistemas (no lo subas a git)»
- Roles internos que necesita la app: «admin, usuario, consulta»
- ¿Qué roles internos podrán requerir 2FA?: «configurable desde la consola»
- Ruta del repo / carpeta de la app: «…»

Haz esto:
1. Revisa el código actual de login/sesión de la app.
2. Implementa login → callback → validación de rol access → sesión local.
3. Lee `otp_required`; si aparece y `acr != mobo-2fa`, inicia step-up con `acr_values=mobo-2fa`.
4. Usa `state`, `nonce` y PKCE nuevos en cada autorización y valida los tokens firmados. No confíes en un JWT sólo decodificado.
5. Persiste `acr` y `requires_2fa`; aplica middleware servidor a operaciones protegidas. No fuerces 2FA por nombres locales como `admin`.
6. Guarda id_token para logout.
7. Implementa /logout en la MISMA pestaña (id_token_hint + post_logout_redirect_uri). Nunca window.open ni abrir …/openid-connect/logout a mano.
8. El client secret solo en backend (.env).
9. Déjame pruebas para login normal, rol con `otp_required`, ACR inválido, state/nonce inválidos, varias pestañas, renovación y logout.

No inventes URLs ni secretos. Si falta registrar el sistema en la consola admin, indícamelo antes.
No uses dominios UAT; el ambiente activo es PROD.
```

---

## Variante corta

```
Skill integrate-mobo-sso: conecta esta app a SSO MOBO PROD (realm mobo).
auth=«copiar de Ayuda» · admin=«copiar de Ayuda»
client_id=«…», stack=«…», callback=«…», post_logout=«…».
Login + callback + access + roles internos + step-up (`otp_required`/`mobo-2fa`) + logout con id_token_hint.
Secret solo backend. Checklist de prueba al final.
```
