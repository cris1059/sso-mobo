# Deja el realm mobo solo en español (quita el desplegable de idioma en login de sistemas).
# Ejecutar si el realm ya existía con es + en.

$ErrorActionPreference = "Stop"
Push-Location (Split-Path -Parent $PSScriptRoot)

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/mobo `
    -s defaultLocale=es `
    -s 'supportedLocales=["es"]'

Write-Host "Realm mobo: solo espanol. Refresca el login de Node/PHP (Ctrl+F5)."

Pop-Location
