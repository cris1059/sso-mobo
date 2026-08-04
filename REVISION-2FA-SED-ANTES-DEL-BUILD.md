# Correcciones requeridas en Portal SED antes del build de 2FA

## Estado de la revisión

Los cambios de autenticación escalonada están presentes en Portal SED en el commit:

```text
bfdaf84 feat(auth): implement 2FA support with ACR and PKCE
```

La implementación ya incluye varias piezas necesarias:

- Lectura del client role `otp_required`.
- Lectura del claim `acr`.
- Solicitud de `acr_values=mobo-2fa`.
- PKCE con `S256`.
- Almacenamiento de transacciones OIDC por `state`.
- Soporte para varias transacciones pendientes.
- Persistencia de `acr` y `requires_2fa` en la sesión local.
- Endpoint `/sso-step-up`.
- Rechazo cuando un step-up no devuelve `acr=mobo-2fa`.

Sin embargo, antes de construir y desplegar el nuevo build deben corregirse los puntos siguientes.

---

## 1. Implementar y validar `nonce`

### Problema

La estructura `OIDCTransaction` declara un campo `Nonce`, pero actualmente:

- No se genera.
- No se almacena al iniciar la autorización.
- No se envía a Keycloak.
- No se valida contra el claim `nonce` del ID Token.

PKCE protege el intercambio del código, pero no reemplaza la validación de `nonce`.

### Archivos involucrados

```text
api/internal/auth/sso/adapter.go
api/internal/auth/sso/oidc.go
api/internal/auth/sso/transaction.go
api/internal/handler/auth/auth_handler.go
```

### Cambio requerido

La URL de autorización debe recibir un `nonce`:

```go
AuthorizationURL(
    state string,
    nonce string,
    acr string,
    codeVerifier string,
) string
```

Al construir la URL:

```go
if nonce != "" {
    params = append(params, oauth2.SetAuthURLParam("nonce", nonce))
}
```

En cada login y step-up se deben generar valores independientes:

```go
state, err := auth.GenerateToken()
nonce, err := auth.GenerateToken()
codeVerifier, _, err := sso.GeneratePKCE()
```

La transacción debe guardar el valor:

```go
h.txStore.Store(state, &sso.OIDCTransaction{
    State:         state,
    Nonce:         nonce,
    CodeVerifier:  codeVerifier,
    ReturnTo:      returnTo,
    RequestedACR:  requestedACR,
})
```

La validación del ID Token debe recibir el `nonce` esperado:

```go
ValidateToken(
    ctx context.Context,
    rawIDToken string,
    expectedNonce string,
) (*SSOUser, error)
```

Los claims deben incluir:

```go
type idTokenClaims struct {
    // Campos existentes...
    Nonce string `json:"nonce"`
}
```

Después de validar criptográficamente el ID Token:

```go
if expectedNonce == "" || claims.Nonce != expectedNonce {
    return nil, fmt.Errorf("oidc: nonce mismatch")
}
```

El callback debe utilizar exclusivamente el `nonce` de la transacción consumida:

```go
_, err := h.sso.ValidateToken(
    r.Context(),
    rawIDToken,
    tx.Nonce,
)
```

No se debe reutilizar el `nonce` del login inicial durante el step-up.

---

## 2. Retirar el 2FA forzado por roles locales

### Problema

Actualmente existe:

```text
api/internal/auth/sso/role_fallback.go
```

La función `Requires2FAFromLocalRole` obliga 2FA para:

```text
RH
Director
DirectorGeneral
```

En el callback se combina con el marcador central:

```go
requires2FA := ssoUser.Requires2FA || sso.Requires2FAFromLocalRole(role)
```

Esto contradice el diseño acordado. El `developAdmin` debe decidir desde el Admin Portal qué rol interno requiere 2FA. Un nombre de rol local no debe activar OTP automáticamente.

### Cambio requerido

En el flujo SSO real debe utilizarse solamente:

```go
requires2FA := ssoUser.Requires2FA
```

Donde `ssoUser.Requires2FA` proviene de:

```text
resource_access.sed-evaluacion.roles
```

y es verdadero únicamente cuando aparece:

```text
otp_required
```

Se puede eliminar `role_fallback.go`.

Si se necesita conservar un fallback para desarrollo local, debe estar aislado explícitamente:

```go
requires2FA := ssoUser.Requires2FA

if environment == "development" && ssoAdapterIsDevelopment {
    requires2FA = Requires2FAFromLocalRole(role)
}
```

El fallback no debe ejecutarse en UAT ni producción.

---

## 3. Conectar el middleware `RequireLoA2`

### Problema

El middleware está definido en:

```text
api/internal/middleware/auth.go
```

pero no se encontró aplicado en `main.go` ni en los grupos de rutas protegidas.

El callback inicial sí impide crear una sesión protegida sin LoA 2, pero el middleware sigue siendo necesario para:

- Cambios de roles durante una sesión.
- Renovación o revalidación de tokens.
- Sesiones existentes que pasen a requerir 2FA.
- Protección en profundidad de las operaciones privilegiadas.

### Cambio requerido

Debe aplicarse después de `RequireAuth`, cuando la sesión ya se encuentra en el contexto.

Ejemplo conceptual:

```go
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireAuth(authSvc))
    r.Use(middleware.RequireLoA2())

    // Rutas que necesitan sesión autenticada y el nivel requerido.
})
```

Si solamente algunas operaciones son privilegiadas, aplicar `RequireLoA2` únicamente a esas rutas:

```go
r.With(
    middleware.RequireAuth(authSvc),
    middleware.RequireLoA2(),
).Post("/operacion-privilegiada", handler)
```

Si un usuario tiene `Requires2FA=false`, el middleware debe permitir la petición normalmente.

Si tiene:

```text
Requires2FA=true
ACR!="mobo-2fa"
```

debe responder `403` o iniciar un step-up mediante un mecanismo controlado.

La respuesta debería permitir que el frontend distinga este caso:

```json
{
  "error": "step_up_required",
  "message": "Se requiere autenticación de dos factores"
}
```

---

## 4. Validar criptográficamente el Access Token

### Problema

`GetUserFromToken` actualmente separa el JWT y decodifica directamente su payload:

```go
parts := strings.Split(accessToken, ".")
payload, err := base64.RawURLEncoding.DecodeString(parts[1])
json.Unmarshal(payload, &claims)
```

Eso solamente decodifica el token. No comprueba:

- Firma.
- `issuer`.
- `audience` o cliente autorizado.
- Vigencia.
- `not before`.

Los datos que deciden si se requiere 2FA (`otp_required`) y el nivel alcanzado (`acr`) deben proceder de claims validados.

### Cambio requerido

Crear un verificador para el Access Token o reutilizar una validación OIDC/JWT compatible con Keycloak.

La validación debe comprobar como mínimo:

```text
Firma contra JWKS de Keycloak
iss == issuer configurado
exp vigente
nbf válido, si está presente
azp o aud compatible con sed-evaluacion
```

Después de la validación se pueden leer:

```text
resource_access.sed-evaluacion.roles
acr
```

Firma conceptual:

```go
func (a *OIDCAdapter) ValidateAccessToken(
    ctx context.Context,
    accessToken string,
) (*AccessTokenClaims, error)
```

Posteriormente:

```go
claims, err := a.ValidateAccessToken(ctx, accessToken)
if err != nil {
    return nil, err
}

requires2FA := Requires2FA(claims, a.clientID)
hasLoA2 := HasLoA2(claims)
```

No se debe tomar una decisión de autorización basándose únicamente en un payload decodificado.

---

## 5. Actualizar y persistir el estado después de renovar tokens

### Problema

Durante `ValidateSession`, el código vuelve a leer `ACR` y `Requires2FA`, pero aparentemente sólo modifica el objeto en memoria:

```go
session.ACR = ssoUser.ACR
session.Requires2FA = ssoUser.Requires2FA
```

Debe comprobarse que:

- Los tokens OIDC realmente se renueven.
- Los tokens nuevos sean validados.
- Los nuevos valores se persistan en la tabla `sessions`.
- Una sesión que ahora requiera 2FA no conserve acceso privilegiado.

### Cambio requerido

Agregar una operación de persistencia:

```go
func (s *SessionStore) UpdateSecurityContext(
    ctx context.Context,
    sessionID uuid.UUID,
    idToken string,
    accessToken string,
    refreshToken string,
    acr string,
    requires2FA bool,
) error
```

Si después de renovar:

```text
requires_2fa=true
acr!="mobo-2fa"
```

la sesión no debe continuar autorizando operaciones protegidas.

El sistema debe devolver `step_up_required` o iniciar un flujo nuevo.

Si se revoca `otp_required`, la sesión debe actualizar sus permisos al recibir y validar un token nuevo.

---

## 6. Validar correctamente `return_to`

### Problema

El endpoint `/sso-step-up` acepta `return_to` desde la URL.

Actualmente se comprueba después que comience con `/`, pero se recomienda una validación más estricta para impedir destinos ambiguos.

### Cambio requerido

Aceptar solamente rutas internas:

```go
func validReturnTo(value string) bool {
    if value == "" {
        return false
    }
    if !strings.HasPrefix(value, "/") {
        return false
    }
    if strings.HasPrefix(value, "//") {
        return false
    }
    if strings.Contains(value, "\\") {
        return false
    }
    return true
}
```

También puede utilizarse una lista de rutas permitidas.

Si el valor no es válido:

```go
returnTo = "/"
```

---

## 7. Añadir pruebas automatizadas específicas

El commit no incorpora pruebas específicas para el nuevo flujo 2FA.

Se deben añadir pruebas para los siguientes casos.

### Login normal

Token:

```json
{
  "resource_access": {
    "sed-evaluacion": {
      "roles": ["access", "usuario"]
    }
  }
}
```

Resultado:

- No solicita OTP.
- Crea sesión normal.

### Rol protegido

Token:

```json
{
  "resource_access": {
    "sed-evaluacion": {
      "roles": ["access", "admin", "otp_required"]
    }
  },
  "acr": "1"
}
```

Resultado:

- No crea todavía la sesión local.
- Genera un nuevo `state`.
- Genera un nuevo `nonce`.
- Genera un nuevo `code_verifier`.
- Redirige con `acr_values=mobo-2fa`.

### Step-up correcto

Token final:

```json
{
  "acr": "mobo-2fa"
}
```

Resultado:

- Crea la sesión.
- Persiste `acr=mobo-2fa`.
- Persiste `requires_2fa=true`.

### Step-up incompleto

Token final sin `acr=mobo-2fa`.

Resultado:

- Rechaza el callback.
- No crea sesión.
- No entra en un ciclo de redirección.

### State inválido

Resultado:

- Rechaza el callback.
- No intercambia el código.

### Nonce inválido

Resultado:

- Rechaza el ID Token.
- No crea sesión.

### Varias pestañas

Resultado:

- Dos transacciones diferentes permanecen válidas.
- Consumir una no elimina la otra.

### Transacción vencida

Resultado:

- El `state` se rechaza al superar el TTL.

### Cambio de rol durante la sesión

Resultado:

- Al aparecer `otp_required`, la siguiente revalidación bloquea las operaciones protegidas hasta completar step-up.

### Revocación

Resultado:

- Al desaparecer `otp_required`, los permisos y el contexto de seguridad se actualizan después de renovar/revalidar el token.

### Fallback local

Resultado:

- En UAT/producción, un rol llamado `RH`, `Director` o `DirectorGeneral` no activa 2FA por sí mismo.

---

## 8. Verificaciones antes de construir

Ejecutar desde el directorio `api`:

```bash
gofmt -w \
  internal/auth/sso/adapter.go \
  internal/auth/sso/oidc.go \
  internal/auth/sso/transaction.go \
  internal/auth/sso/role_fallback.go \
  internal/handler/auth/auth_handler.go \
  internal/middleware/auth.go \
  internal/service/auth/auth_service.go
```

Después:

```bash
go test ./internal/auth/...
go test ./internal/handler/auth/...
go test ./internal/middleware/...
go test ./internal/service/auth/...
go test ./...
go vet ./...
go build ./cmd/server
```

No se debe construir el contenedor UAT hasta que esos comandos terminen correctamente.

---

## 9. Verificaciones después del build

Después de construir y desplegar el contenedor nuevo:

1. Confirmar que la migración `000026_add_2fa_columns.up.sql` se aplicó.
2. Confirmar que existen las columnas:

```text
sessions.acr
sessions.requires_2fa
```

3. Confirmar que el servicio inicia sin errores de migración.
4. Probar primero con un usuario cuyo rol no requiera 2FA.
5. Activar 2FA en un rol interno de prueba desde el Admin Portal.
6. Resincronizar o reasignar al usuario de prueba.
7. Confirmar que el token contiene:

```json
{
  "resource_access": {
    "sed-evaluacion": {
      "roles": ["access", "rol-interno", "otp_required"]
    }
  }
}
```

8. Confirmar que SED solicita:

```text
acr_values=mobo-2fa
```

9. Confirmar que Keycloak solicita únicamente el OTP cuando ya existe una sesión SSO LoA 1.
10. Confirmar que el token final contiene:

```json
{
  "acr": "mobo-2fa"
}
```

11. Recargar SED y confirmar que no se solicita OTP repetidamente mientras LoA 2 siga vigente.
12. Cerrar sesión y confirmar que el siguiente acceso privilegiado vuelve a solicitar OTP.

---

## Criterios de aceptación

El build puede considerarse listo cuando:

- `nonce` se genera, envía y valida en cada autorización.
- Cada step-up usa `state`, `nonce` y PKCE nuevos.
- Solamente `otp_required` activa 2FA en UAT/producción.
- Los nombres de roles locales no fuerzan OTP.
- `RequireLoA2` está conectado a las rutas correspondientes.
- Los Access Tokens se validan criptográficamente antes de usar sus claims.
- La renovación actualiza y persiste `acr` y `requires_2fa`.
- `return_to` sólo admite destinos internos seguros.
- Las pruebas de login normal, step-up, errores y múltiples pestañas pasan.
- `go test ./...`, `go vet ./...` y `go build ./cmd/server` terminan correctamente.

Hasta cumplir estos puntos, no se recomienda construir ni desplegar el nuevo contenedor de Portal SED.
