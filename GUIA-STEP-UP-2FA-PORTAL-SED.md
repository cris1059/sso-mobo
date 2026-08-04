# Integración de 2FA escalonado por rol interno en Portal SED

## Objetivo

Portal SED debe soportar autenticación escalonada (*step-up authentication*) mediante OpenID Connect:

```text
Sesión normal:       contraseña       → LoA 1
Sesión privilegiada: contraseña + OTP → LoA 2
```

El segundo factor no dependerá únicamente del rol global del usuario. Cada rol interno de cada sistema podrá marcarse como **Requiere 2FA** desde el Admin Portal.

Ejemplo:

```text
Usuario
├─ Sistema A → admin   → requiere OTP
├─ Sistema B → usuario → no requiere OTP
└─ Sistema C → usuario → no requiere OTP
```

Comportamiento esperado:

1. El usuario entra a los sistemas B o C sin OTP.
2. Cuando intenta entrar al sistema A, Portal SED detecta que necesita un nivel de autenticación superior.
3. Portal SED inicia una nueva autorización OIDC solicitando LoA 2.
4. Keycloak solicita el OTP.
5. Keycloak devuelve un token con el nivel superior.
6. El OTP no vuelve a solicitarse mientras el nivel 2 continúe vigente en la sesión SSO.
7. Al cerrar sesión o vencer el nivel 2, el usuario deberá introducir nuevamente el OTP.

---

## Alcance del cambio en Portal SED

Los cambios deben limitarse a la integración SSO/OIDC. No es necesario modificar la lógica de evaluaciones, empleados, objetivos, ciclos u otros módulos funcionales.

Por la estructura actual del proyecto, los archivos principales son:

```text
api/internal/auth/sso/oidc.go
api/internal/handler/auth/auth_handler.go
api/internal/auth/sso/adapter.go
```

También podría ser necesario actualizar:

- El modelo de sesión local.
- El repositorio o mecanismo que persiste sesiones.
- El middleware que protege rutas privilegiadas.
- Las pruebas unitarias y de integración relacionadas con autenticación.

---

## Contrato esperado en los tokens

### Roles del cliente

Keycloak enviará los roles internos dentro de `resource_access`:

```json
{
  "resource_access": {
    "sed-evaluacion": {
      "roles": [
        "access",
        "admin",
        "otp_required"
      ]
    }
  }
}
```

El rol `otp_required` será un indicador administrado centralmente. Se asignará como consecuencia de que alguno de los roles internos del usuario esté marcado como **Requiere 2FA**.

Portal SED no debe codificar exclusivamente una condición como:

```go
role == "admin"
```

El `developAdmin` podrá activar 2FA para cualquier rol interno. La aplicación debe buscar el indicador genérico:

```text
otp_required
```

### Nivel de autenticación

Después de completar OTP, el token deberá incluir:

```json
{
  "acr": "mobo-2fa"
}
```

Interpretación:

```text
Sin mobo-2fa → sesión normal
mobo-2fa     → sesión con OTP verificado
```

Tener un token válido no significa automáticamente que el OTP fue completado. Portal SED debe validar explícitamente el claim `acr`.

---

## Cambio 1: aceptar un ACR en la autorización

En `api/internal/auth/sso/oidc.go`, la función que construye la URL de autorización debe aceptar un ACR opcional.

La implementación actual genera parámetros semejantes a:

```go
query.Set("client_id", clientID)
query.Set("redirect_uri", redirectURI)
query.Set("response_type", "code")
query.Set("scope", "openid profile email")
query.Set("state", state)
query.Set("nonce", nonce)
```

Debe permitir añadir:

```go
if acr != "" {
    query.Set("acr_values", acr)
}
```

Para solicitar OTP:

```text
acr_values=mobo-2fa
```

Ejemplo conceptual de firma:

```go
func (a *Authenticator) AuthorizationURL(
    state string,
    nonce string,
    acr string,
) string
```

El primer login puede invocarla sin ACR:

```go
url := authenticator.AuthorizationURL(state, nonce, "")
```

El step-up debe solicitar:

```go
url := authenticator.AuthorizationURL(state, nonce, "mobo-2fa")
```

---

## Cambio 2: leer `acr` del token

La estructura de claims del ID Token o Access Token debe incluir el campo `acr`.

Ejemplo:

```go
type ClientRoles struct {
    Roles []string `json:"roles"`
}

type Claims struct {
    Subject           string                 `json:"sub"`
    PreferredUsername string                 `json:"preferred_username"`
    ACR               string                 `json:"acr"`
    ResourceAccess    map[string]ClientRoles `json:"resource_access"`
}
```

Funciones auxiliares sugeridas:

```go
func HasClientRole(claims Claims, clientID, role string) bool {
    access, ok := claims.ResourceAccess[clientID]
    if !ok {
        return false
    }

    for _, current := range access.Roles {
        if current == role {
            return true
        }
    }

    return false
}

func Requires2FA(claims Claims, clientID string) bool {
    return HasClientRole(claims, clientID, "otp_required")
}

func HasLoA2(claims Claims) bool {
    return claims.ACR == "mobo-2fa"
}
```

---

## Cambio 3: iniciar el step-up después del primer callback

En `api/internal/handler/auth/auth_handler.go`, después de intercambiar el código por tokens y validar los claims:

```go
requires2FA := Requires2FA(claims, "sed-evaluacion")
hasLoA2 := HasLoA2(claims)

if requires2FA && !hasLoA2 {
    // Iniciar una segunda autorización OIDC con acr_values=mobo-2fa.
}
```

Flujo esperado:

```text
Login inicial
    ↓
Portal SED recibe y valida el token
    ↓
¿El token contiene otp_required?
    ├─ No → crear la sesión local
    └─ Sí
        ↓
       ¿acr == mobo-2fa?
        ├─ Sí → crear la sesión local
        └─ No → iniciar step-up con acr_values=mobo-2fa
```

El segundo flujo debe:

1. Crear un `state` nuevo.
2. Crear un `nonce` nuevo.
3. Crear un `code_verifier` PKCE nuevo, si se utiliza PKCE.
4. Conservar internamente el destino original.
5. Redirigir a Keycloak con `acr_values=mobo-2fa`.
6. Validar que el token resultante contenga `acr=mobo-2fa`.
7. Crear o elevar la sesión local.

---

## Cambio 4: evitar ciclos de redirección

Portal SED debe distinguir entre:

```text
Login normal
Step-up solicitado
Step-up completado
```

La transacción OIDC puede guardar:

```go
type OIDCTransaction struct {
    State       string
    Nonce       string
    CodeVerifier string
    ReturnTo    string
    RequestedACR string
    CreatedAt   time.Time
}
```

Cuando `RequestedACR` sea `mobo-2fa`, el callback deberá exigir:

```go
claims.ACR == "mobo-2fa"
```

Si Keycloak devuelve un token sin ese nivel:

- No debe crear una sesión privilegiada.
- No debe volver a redirigir indefinidamente.
- Debe registrar el error.
- Debe responder con un mensaje explícito.

Ejemplo:

```text
No fue posible completar la autenticación de dos factores requerida.
```

---

## Cambio 5: guardar el nivel en la sesión local

La sesión local debe conservar el nivel de autenticación alcanzado.

Ejemplo:

```go
type Session struct {
    // Campos existentes...
    ACR          string
    Requires2FA  bool
    AuthenticatedAt time.Time
    ExpiresAt    time.Time
}
```

Al crear la sesión:

```go
session.ACR = claims.ACR
session.Requires2FA = Requires2FA(claims, "sed-evaluacion")
```

Para operaciones protegidas:

```go
if session.Requires2FA && session.ACR != "mobo-2fa" {
    return initiateStepUp()
}
```

No debe confiar únicamente en un valor enviado por el frontend.

---

## Cambio 6: proteger rutas privilegiadas

Si todo Portal SED requiere el mismo nivel, la comprobación puede ejecutarse al crear la sesión.

Si solamente determinadas acciones necesitan LoA 2, debe existir un middleware:

```go
func RequireLoA2(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        session := SessionFromContext(r.Context())

        if session.ACR != "mobo-2fa" {
            InitiateStepUp(w, r)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

El middleware debe aplicarse a funciones administrativas o sensibles.

---

## Cambio 7: manejar refresh tokens

Al renovar tokens:

1. Validar la firma y vigencia del nuevo token.
2. Leer nuevamente `resource_access`.
3. Leer nuevamente `acr`.
4. Actualizar los roles y el nivel guardados en la sesión.

Si el usuario conserva `otp_required`, pero el nuevo token ya no contiene `acr=mobo-2fa`:

- No debe conservar silenciosamente una sesión privilegiada.
- Debe iniciar un nuevo step-up.
- O debe rechazar las operaciones privilegiadas hasta completar OTP.

También debe reaccionar correctamente si el rol `otp_required` fue revocado mientras la sesión estaba abierta.

---

## Cambio 8: seguridad de `state`, `nonce` y PKCE

Cada autorización, incluida la segunda autorización de step-up, debe usar valores independientes:

```text
state nuevo
nonce nuevo
PKCE code_verifier nuevo
```

No se deben reutilizar los valores del primer login.

Requisitos:

- Guardar las transacciones del lado del servidor.
- Permitir varias transacciones pendientes por sesión si existen varias pestañas.
- Establecer una caducidad corta, por ejemplo diez minutos.
- Comparar exactamente el `state` recibido.
- Comparar exactamente el `nonce` del ID Token.
- Eliminar la transacción después de consumirla.
- No aceptar `return_to` arbitrarios.

El destino debe validarse contra rutas internas o una lista permitida.

---

## Cambio 9: comportamiento del logout

El logout debe:

1. Eliminar la sesión local.
2. Revocar o descartar refresh tokens cuando corresponda.
3. Redirigir al `end_session_endpoint` de Keycloak.
4. Mantener el backchannel logout existente.

Después del logout:

- LoA 2 deja de ser reutilizable.
- El siguiente acceso privilegiado debe solicitar OTP nuevamente.

Cerrar solamente una pestaña no equivale a cerrar sesión.

---

## Responsabilidades del proyecto SSO

El proyecto central SSO será responsable de:

1. Añadir `require_2fa` a los roles internos por sistema.
2. Permitir que cada `developAdmin` configure esa opción solamente en sus sistemas.
3. Crear o mantener el rol indicador `otp_required`.
4. Sincronizarlo con los roles internos seleccionados.
5. Configurar `mobo-2fa` como LoA 2 en Keycloak.
6. Mantener el flujo de OTP.
7. Definir el tiempo durante el que LoA 2 puede reutilizarse.
8. Incluir el client scope `acr` en los clientes OIDC.

Portal SED no debe administrar directamente esas políticas.

---

## Responsabilidades de Portal SED

Portal SED será responsable de:

1. Leer `otp_required` desde los roles del cliente.
2. Leer y validar el claim `acr`.
3. Solicitar `acr_values=mobo-2fa` cuando sea necesario.
4. Verificar que Keycloak realmente haya entregado LoA 2.
5. Guardar el nivel en su sesión local.
6. Proteger operaciones privilegiadas.
7. Mantener las validaciones después de renovar tokens.
8. Evitar ciclos de redirección.
9. Validar `state`, `nonce` y PKCE en cada autorización.

---

## Casos de prueba obligatorios

### 1. Usuario sin 2FA

Roles:

```text
access
usuario
```

Resultado:

- Inicia sesión normalmente.
- No se solicita OTP.
- La sesión funciona.

### 2. Usuario con rol protegido

Roles:

```text
access
admin
otp_required
```

Resultado:

- El primer token no privilegiado provoca step-up.
- Keycloak solicita OTP.
- El token final contiene `acr=mobo-2fa`.
- La sesión se crea correctamente.

### 3. SSO desde un sistema no privilegiado

1. El usuario entra a un sistema con rol `usuario`.
2. Abre Portal SED, donde tiene un rol protegido.

Resultado:

- Se reutiliza la sesión SSO.
- Se solicita solamente OTP.
- No se vuelve a solicitar la contraseña, salvo que la política de Keycloak lo requiera.

### 4. Reutilización de LoA 2

1. El usuario completa OTP.
2. Recarga Portal SED.
3. Abre otro sistema protegido.

Resultado:

- OTP no se repite mientras LoA 2 continúe vigente.

### 5. Logout

1. El usuario completa OTP.
2. Cierra sesión global.
3. Vuelve a entrar a Portal SED.

Resultado:

- Debe proporcionar OTP nuevamente.

### 6. Revocación de rol

1. El usuario tiene `otp_required`.
2. Un administrador revoca el rol protegido.
3. Portal SED renueva o revalida el token.

Resultado:

- La sesión actualiza sus permisos.
- No conserva privilegios retirados.

### 7. Activación de 2FA durante una sesión

1. El usuario inicia sin `otp_required`.
2. Un `developAdmin` activa 2FA para su rol.
3. Portal SED renueva o revalida el token.

Resultado:

- Detecta el nuevo indicador.
- Inicia step-up antes de permitir operaciones privilegiadas.

### 8. ACR ausente después del step-up

Resultado:

- Portal SED rechaza el nivel privilegiado.
- No entra en un ciclo infinito.
- Registra un error claro.

### 9. State inválido

Resultado:

- El callback se rechaza.
- No se crea sesión.

### 10. Varias pestañas

Resultado:

- Cada pestaña conserva su propia transacción OIDC.
- No se producen errores `state mismatch`.

### 11. Token vencido o inactivo

Resultado:

- Se revoca la sesión local.
- Las API protegidas responden `401`.
- El frontend vuelve al login.

---

## Criterios finales de aceptación

La integración estará completa cuando:

- Un rol interno pueda marcarse como **Requiere 2FA**.
- La configuración no dependa de que el rol se llame `admin`.
- Los usuarios sin roles protegidos no reciban OTP.
- Los usuarios con roles protegidos completen step-up.
- El token privilegiado contenga `acr=mobo-2fa`.
- OTP se solicite una sola vez durante el periodo configurado.
- El logout elimine el nivel privilegiado.
- Los cambios de roles se reflejen sin conservar privilegios obsoletos.
- `state`, `nonce` y PKCE se validen correctamente.
- No existan ciclos de autenticación.

---

## Resumen para el equipo de Portal SED

El cambio mínimo requerido en Portal SED es:

```text
1. Leer otp_required.
2. Leer acr.
3. Si otp_required && acr != mobo-2fa:
       iniciar OIDC con acr_values=mobo-2fa.
4. Aceptar privilegios solo cuando acr == mobo-2fa.
5. Guardar y revalidar ese nivel en la sesión.
```

No es necesario modificar la lógica funcional del sistema. Los cambios están limitados al cliente OIDC, callback, sesión y middleware de autorización.
