# Restaura temas visuales e idioma en español.
# Ejecutar después de: docker compose up -d  (o si los estilos desaparecen)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

Write-Host "Esperando a que Keycloak responda..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Error "Keycloak no respondió en http://localhost:8080. Verifica Docker."
}

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin

# --- Realm master: login admin (tema oscuro sso-admin) + espanol ---
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master `
    -s loginTheme=sso-admin `
    -s adminTheme=sso-admin `
    -s accountTheme=sso-admin `
    -s internationalizationEnabled=true `
    -s defaultLocale=es

'{"supportedLocales":["es"]}' | docker compose exec -T keycloak `
    /opt/keycloak/bin/kcadm.sh update realms/master -f -

Write-Host "master: tema sso-admin + espanol OK"

# --- Realm mobo: login usuarios (tema claro sso-apps) + espanol ---
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/mobo `
    -s loginTheme=sso-apps `
    -s accountTheme=sso-apps `
    -s internationalizationEnabled=true `
    -s defaultLocale=es

'{"supportedLocales":["es"]}' | docker compose exec -T keycloak `
    /opt/keycloak/bin/kcadm.sh update realms/mobo -f -

Write-Host "mobo: tema sso-apps + espanol OK"

Write-Host ""
Write-Host "Listo. Refresca el navegador con Ctrl+F5."
Write-Host "  Login admin    : http://localhost:8080/admin   (tema oscuro, rol Admin)"
Write-Host "  Login usuarios : realm mobo / tema sso-apps    (aplicaciones conectadas)"

Pop-Location
