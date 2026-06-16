# Seed inicial: vincula admin a sistemas, sincroniza acceso y opcionalmente crea developAdmin

param(
    [switch]$SkipDevAdmin
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Ejecutando migracion de vinculos admin..."
$sqlPath = Join-Path $ProjectRoot "sql\06-seed-admin-system-links.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 `
    mysql "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" --default-character-set=utf8mb4 $env:MYSQL_DB

if (-not $SkipDevAdmin) {
    $devExists = docker run --rm -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 mysql `
        "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" $env:MYSQL_DB `
        -N -B -e "SELECT COUNT(*) FROM userSSO WHERE user='devadmin'" 2>$null
    if ($devExists -eq "0") {
        Write-Host "Creando usuario developAdmin de prueba (devadmin / Clave123)..."
        & (Join-Path $PSScriptRoot "insert-userSSO.ps1") `
            -User devadmin -Password "Clave123" -Name Dev -LastName Admin -Email devadmin@mobo.com -Rol 3
    } else {
        Write-Host "Usuario devadmin ya existe."
    }
}

Write-Host "Sincronizando acceso y enforcement en Keycloak..."
node (Join-Path $PSScriptRoot "sync-all-access.js")

Write-Host "Seed completado."
Pop-Location
