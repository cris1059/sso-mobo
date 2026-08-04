# Revisión de integración SSO y 2FA — Portal SED

## Alcance

Se revisó el proyecto ubicado en:

```text
/var/www/html/portal-sed
```

La revisión se realizó estrictamente en modo lectura:

- No se modificaron archivos del Portal SED.
- No se construyeron imágenes.
- No se reiniciaron servicios.
- No se ejecutaron pruebas.

## Resultado general

La integración principal de SSO y 2FA está bien planteada. El proyecto ya implementa:

- OpenID Connect con Keycloak.
- Validación de `state`.
- Validación de `nonce`.
- PKCE con `S256`.
- Validación del rol `access`.
- Detección del rol `otp_required`.
- Step-up de autenticación mediante `acr_values=mobo-2fa`.
- Validación de `acr=mobo-2fa`.
- Cierre de sesión local y en Keycloak.

Sin embargo, se encontraron tres problemas que deberían corregirse antes de considerar terminada la integración.

## Correcciones obligatorias

### 1. Corregir `CORS_ORIGINS`

En el archivo `.env` aparece:

```env
CORS_ORIGINS=https:///192.168.10.150:8088
```

La URL tiene tres diagonales después de `https:`. Debe quedar:

```env
CORS_ORIGINS=https://192.168.10.150:8088
```

Este valor se utiliza para construir las redirecciones después de:

- Un callback exitoso.
- Un error de autenticación.
- Un error durante el step-up.
- El cierre de sesión.

Mientras conserve las tres diagonales, el sistema puede producir redirecciones inválidas.

### 2. Proteger correctamente la revocación administrativa

Archivo:

```text
api/internal/handler/auth/auth_handler.go
```

La validación actual es:

```go
adminKey := os.Getenv("ADMIN_REVOKE_KEY")
if adminKey != "" && r.Header.Get("X-Admin-Revoke-Key") != adminKey {
    writeError(w, pkgerrors.NewDomainError(
        pkgerrors.InvalidRequest,
        "Acceso no autorizado",
        nil,
    ))
    return
}
```

El problema es que, si `ADMIN_REVOKE_KEY` está vacío, la validación se omite. Eso deja accesible el endpoint de revocación a quien conozca el UUID de un empleado.

Debe fallar de forma cerrada:

```go
adminKey := os.Getenv("ADMIN_REVOKE_KEY")
if adminKey == "" || r.Header.Get("X-Admin-Revoke-Key") != adminKey {
    writeError(w, pkgerrors.NewDomainError(
        pkgerrors.InvalidRequest,
        "Acceso no autorizado",
        nil,
    ))
    return
}
```

También debe verificarse que `ADMIN_REVOKE_KEY` tenga un valor seguro en el archivo `.env` del servidor.

### 3. Proteger `/auth/refresh` con autenticación

Actualmente la ruta se registra de esta forma:

```go
r.Post("/refresh", handler.Refresh)
```

Sin embargo, `handler.Refresh` intenta recuperar una sesión previamente colocada en el contexto:

```go
session, ok := auth.GetSession(r.Context())
```

Como la ruta no utiliza `RequireAuth`, normalmente no existirá una sesión en el contexto y responderá como sesión no autenticada.

La ruta debe envolverse con el middleware de autenticación. Una opción es crear un grupo protegido:

```go
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireAuth(authSvc))
    r.Post("/refresh", handler.Refresh)
})
```

Para hacerlo será necesario que `AuthRoutes` reciba el servicio de autenticación:

```go
func AuthRoutes(handler *AuthHandler, authSvc *authsvc.AuthService) chi.Router
```

Otra opción es que `Refresh` extraiga y valide directamente el token, de forma similar a lo que actualmente hace el endpoint `/auth/me`.

La primera opción mantiene mejor la responsabilidad dentro del middleware.

## Revisión del funcionamiento de 2FA

La lógica principal del 2FA por rol interno está correctamente implementada.

### Inicio de sesión normal

El sistema genera:

- `state` criptográficamente aleatorio.
- `nonce` criptográficamente aleatorio.
- `code_verifier` para PKCE.
- `code_challenge` usando `S256`.

En el primer acceso no envía obligatoriamente `acr_values=mobo-2fa`.

Esto permite que un usuario cuyo rol interno no requiere 2FA pueda entrar sin capturar OTP.

### Detección del requisito de OTP

Después de recibir los tokens, el sistema busca:

```text
resource_access.sed-evaluacion.roles
```

Si dentro de esos roles encuentra:

```text
otp_required
```

la sesión se considera protegida con 2FA.

### Step-up

Si el usuario tiene `otp_required`, pero el token todavía no contiene:

```text
acr=mobo-2fa
```

el backend inicia una segunda autorización con:

```text
acr_values=mobo-2fa
```

Este comportamiento es correcto:

- Un usuario normal no recibe OTP innecesariamente.
- Un usuario con un rol interno protegido sí recibe OTP.
- Si la sesión de Keycloak ya alcanzó LoA2, no debería solicitar nuevamente el código.

### Validaciones de seguridad

La implementación incluye:

- Consumo único de `state`.
- Expiración de transacciones OIDC.
- Soporte para varias pestañas mediante transacciones independientes.
- Validación de `nonce` en el ID token.
- Intercambio de código con `code_verifier`.
- Validación del ID token con el proveedor OIDC.
- Introspección del access token.
- Validación del rol `access`.
- Validación del rol `otp_required`.
- Validación del nivel `mobo-2fa`.

## Mejoras recomendadas

### 1. Persistir las transacciones OIDC

Actualmente `state`, `nonce`, `code_verifier` y `return_to` se almacenan en memoria.

Consecuencias:

- Si el contenedor se reinicia durante el login, el callback devolverá `estado_invalido`.
- Con varias réplicas, el callback puede llegar a una instancia diferente.

Para un entorno productivo se recomienda usar:

- Redis.
- Una tabla temporal en PostgreSQL.
- Una cookie cifrada y firmada.

Si solamente existe una instancia y se acepta perder los logins en curso durante un reinicio, la implementación actual puede funcionar en UAT.

### 2. Manejar el step-up desde el frontend

El frontend no contiene una reacción específica cuando una sesión existente comienza a requerir 2FA.

Esto puede ocurrir si:

1. El usuario ya tiene una sesión abierta.
2. Un administrador activa `require_2fa` para uno de sus roles.
3. El usuario realiza una nueva petición sin haber alcanzado `mobo-2fa`.

Ante una respuesta específica de 2FA requerido, el frontend debería redirigir a:

```text
/api/v1/auth/sso-step-up?return_to=<ruta-actual>
```

El valor de `return_to` debe ser únicamente una ruta interna.

### 3. Unificar el método de cierre de sesión

El contrato OpenAPI documenta:

```text
POST /auth/logout
```

El backend y el frontend utilizan:

```text
GET /auth/logout
```

Se debe elegir un solo método y reflejarlo en:

- `api/openapi/auth.yaml`
- `api/internal/handler/auth/routes.go`
- `web/src/lib/api/session.svelte.ts`

Para mantener el comportamiento actual de redirección directa del navegador se puede documentar `GET`. Para mayor protección contra solicitudes involuntarias, se puede implementar `POST` y hacer que el frontend procese la respuesta o la redirección.

### 4. Documentar el endpoint de step-up

Agregar a `api/openapi/auth.yaml`:

```yaml
/auth/sso-step-up:
  get:
    operationId: ssoStepUp
    summary: Solicitar autenticación de segundo factor
    parameters:
      - name: return_to
        in: query
        required: false
        schema:
          type: string
    responses:
      "302":
        description: Redirección a Keycloak para completar LoA2
```

### 5. Proteger los tokens almacenados

La tabla `sessions` almacena:

- `id_token`
- `access_token`
- `refresh_token`

Actualmente se almacenan como texto. Se recomienda cifrarlos antes de guardarlos o usar cifrado de datos en reposo, especialmente para el `refresh_token`.

Como mínimo:

- Limitar los permisos del usuario de PostgreSQL.
- Evitar mostrar tokens en logs.
- Definir una política de limpieza de sesiones expiradas.
- Rotar secretos si existe sospecha de exposición.

### 6. Revisar el costo de introspección

La validación de una sesión consulta Keycloak para confirmar que el access token continúa activo.

Esto mejora la revocación, pero:

- Añade latencia.
- Hace que las peticiones dependan de la disponibilidad de Keycloak.
- Puede incrementar significativamente la carga.

Se puede conservar la introspección si el volumen es bajo. Para mayor escala conviene implementar un caché de corta duración o validar localmente el JWT y consultar Keycloak solamente en operaciones sensibles o intervalos controlados.

## Configuración esperada

La configuración no sensible debería conservar una estructura como:

```env
CORS_ORIGINS=https://192.168.10.150:8088
SSO_KC_ISSUER=https://sso.mobo.com.mx/auth/realms/mobo
SSO_CLIENT_ID=sed-evaluacion
SSO_REDIRECT_URI=https://192.168.10.150:8088/api/v1/auth/sso-callback
SSO_POST_LOGOUT_URI=https://192.168.10.150:8088/api/v1/auth/logout-complete
```

Además:

```env
SSO_CLIENT_SECRET=<secreto-del-cliente>
ADMIN_REVOKE_KEY=<llave-administrativa-segura>
```

Los secretos no deben incluirse en Git ni mostrarse en documentación compartida.

## Orden recomendado de trabajo

1. Corregir `CORS_ORIGINS`.
2. Corregir la validación de `ADMIN_REVOKE_KEY`.
3. Proteger `/auth/refresh`.
4. Actualizar el contrato OpenAPI.
5. Manejar el step-up desde el frontend para sesiones existentes.
6. Ejecutar pruebas unitarias de autenticación.
7. Construir nuevas imágenes de API y frontend.
8. Desplegar en UAT.
9. Probar usuarios con rol normal y rol protegido.

## Casos que deben probarse

### Usuario sin 2FA

- Iniciar sesión en SED.
- Confirmar que no solicite OTP.
- Confirmar que pueda consultar `/api/v1/auth/me`.

### Usuario con rol protegido

- Iniciar sesión en SED.
- Confirmar que se detecte `otp_required`.
- Confirmar que se solicite OTP.
- Confirmar que el token final tenga `acr=mobo-2fa`.
- Confirmar que las peticiones protegidas funcionen después del OTP.

### SSO compartido

- Iniciar sesión en una aplicación que no requiere 2FA.
- Abrir SED con un rol protegido.
- Confirmar que SED solicite OTP una sola vez.
- Volver a abrir SED.
- Confirmar que no solicite nuevamente OTP mientras la sesión LoA2 siga vigente.

### Acceso denegado

- Intentar entrar con un usuario sin el rol `access`.
- Confirmar que aparezca el mensaje de falta de acceso.
- Confirmar que pueda volver a iniciar sesión con otra cuenta.

### Estado y varias pestañas

- Iniciar dos flujos de autenticación en pestañas distintas.
- Completar ambos callbacks.
- Confirmar que no se produzca `state mismatch`.

### Cierre de sesión

- Cerrar sesión desde SED.
- Confirmar que se revoque la sesión local.
- Confirmar que se cierre la sesión en Keycloak.
- Confirmar que termine en la pantalla de inicio de sesión de SED.

### Revocación administrativa

- Probar sin `X-Admin-Revoke-Key`.
- Probar con una llave incorrecta.
- Confirmar que ambos casos respondan `403`.
- Probar con la llave correcta.
- Confirmar que se revoquen las sesiones locales y los refresh tokens.

## Conclusión

Los cambios relacionados con OIDC, `state`, `nonce`, PKCE y 2FA están correctamente orientados.

Antes de construir y desplegar una nueva versión se recomienda corregir obligatoriamente:

1. La URL incorrecta en `CORS_ORIGINS`.
2. La validación abierta de `ADMIN_REVOKE_KEY`.
3. La falta de autenticación en `/auth/refresh`.

Después de esas correcciones, se deben actualizar los contratos y realizar las pruebas funcionales indicadas.
