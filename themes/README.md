# Temas Keycloak

| Tema | Audiencia | Archivo principal |
|------|-----------|-------------------|
| **sso-admin** | Consola `/admin` (realm master) | `sso-admin/login/resources/css/login.css` |
| **sso-apps** | Usuarios SSO (realm mobo) | `sso-apps/login/resources/css/login.css` |

**Empieza aquí:** [PERSONALIZAR-AQUI.md](./PERSONALIZAR-AQUI.md) — edita `custom.css` en cada tema.

**Guía detallada:** [GUIA-PERSONALIZACION.md](./GUIA-PERSONALIZACION.md)

## Incluido

- `custom.css` vacío en cada tema — tú escribes todo el estilo
- Diseño base de Keycloak (`keycloak.v2`) sin overrides nuestros

## Aplicar cambios

```powershell
docker compose restart keycloak
# Refresca el navegador con Ctrl+F5
```
