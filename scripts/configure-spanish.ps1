# Deja Keycloak en espanol: login admin, login usuarios y consola /admin.

$ErrorActionPreference = "Stop"
Push-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Esperando Keycloak..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Error "Keycloak no respondio." }

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin

$localeJson = '{"internationalizationEnabled":true,"supportedLocales":["es"],"defaultLocale":"es"}'

foreach ($realm in @("master", "mobo")) {
    Write-Host "Realm $realm -> espanol"
    $localeJson | docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update "realms/$realm" -f -
    if ($LASTEXITCODE -ne 0) { throw "No se pudo configurar idioma en $realm" }
}

$adminId = (cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users -r master -q username=admin --fields id --format csv --noquotes 2>nul" | Select-Object -Last 1).Trim()
if ($adminId -and $adminId -ne "id") {
    '{"attributes":{"locale":["es"]}}' | docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update "users/$adminId" -r master -f - | Out-Null
}

Write-Host ""
Write-Host "Listo. Refresca http://localhost:8080/admin (Ctrl+F5) o cierra sesion y vuelve a entrar."
Write-Host "Nota: ~90% del panel esta en espanol; terminos tecnicos OIDC pueden quedar en ingles."

Pop-Location
