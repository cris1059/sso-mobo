// UAT HTTP: Keycloak 25 marca cookies Secure que el navegador no guarda en HTTP.
// Este reemplazo evita el bloqueo "Cookie no encontrada" en la pantalla de login.
export function checkCookiesAndSetTimer(_authSessionId, _tabId, _loginUrl) {
  // noop
}
