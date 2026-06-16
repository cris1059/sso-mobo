# Restaura el sistema mobonet (http://mobonet.localhost/) en BD y sincroniza Keycloak

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Agregando sistema mobonet a sistemaSSO..."
$sqlPath = Join-Path $ProjectRoot "sql\07-add-mobonet-sistema.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 `
    mysql "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" --default-character-set=utf8mb4 $env:MYSQL_DB

Write-Host "Sincronizando acceso y enforcement en Keycloak..."
node (Join-Path $PSScriptRoot "sync-all-access.js")

Write-Host "Sistema mobonet restaurado."
Pop-Location
