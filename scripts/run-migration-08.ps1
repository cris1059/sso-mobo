# Elimina sistemas demo node-app y php-app de MoboNet y Keycloak

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Eliminando node-app y php-app de MoboNet..."
$sqlPath = Join-Path $ProjectRoot "sql\08-remove-demo-systems.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 `
    mysql "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" --default-character-set=utf8mb4 $env:MYSQL_DB

$kcBase = if ($env:KC_BASE_URL) { $env:KC_BASE_URL } else { "http://localhost:8080" }
$kcAdmin = if ($env:KC_ADMIN) { $env:KC_ADMIN } else { "admin" }
$kcPass = if ($env:KC_ADMIN_PASS) { $env:KC_ADMIN_PASS } else { "admin" }

$kcContainer = docker ps --filter "ancestor=quay.io/keycloak/keycloak:25.0" --format "{{.Names}}" 2>$null | Select-Object -First 1

if ($kcContainer) {
    Write-Host "Eliminando clientes demo de Keycloak (realm mobo)..."
    docker exec -T $kcContainer /opt/keycloak/bin/kcadm.sh config credentials `
        --server $kcBase --realm master --user $kcAdmin --password $kcPass 2>$null | Out-Null

    foreach ($clientId in @("node-app", "php-app")) {
        $uuid = docker exec -T $kcContainer /opt/keycloak/bin/kcadm.sh get clients -r mobo -q "clientId=$clientId" --fields id 2>$null
        if ($uuid -match '"id"\s*:\s*"([^"]+)"') {
            docker exec -T $kcContainer /opt/keycloak/bin/kcadm.sh delete "clients/$($Matches[1])" -r mobo 2>$null | Out-Null
            Write-Host "  Eliminado: $clientId"
        } else {
            Write-Host "  No encontrado en Keycloak: $clientId"
        }
    }
} else {
    Write-Host "Keycloak no esta corriendo — clientes demo no eliminados de Keycloak."
}

Write-Host "Sincronizando acceso restante..."
node (Join-Path $PSScriptRoot "sync-all-access.js")

Write-Host "Sistemas demo eliminados."
Pop-Location
