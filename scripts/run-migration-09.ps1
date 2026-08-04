# Agrega redirect URIs UAT al sistema mobonet en BD

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Actualizando redirect_uris de mobonet (UAT)..."
$sqlPath = Join-Path $ProjectRoot "sql\09-add-mobonet-uat-redirect.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 `
    mysql "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" --default-character-set=utf8mb4 $env:MYSQL_DB

Write-Host "Listo. Sincroniza Keycloak desde consola admin o sync-mobonet-uat-redirect.py en UAT."
Pop-Location
