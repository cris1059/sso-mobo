# Migración 11: roles internos por sistema (sistemaRoleSSO)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

$host_ = $env:MYSQL_HOST
$port  = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$user  = $env:MYSQL_USER
$pass  = $env:MYSQL_PASS
$db    = $env:MYSQL_DB

Write-Host "Ejecutando migracion 11 (roles internos por sistema) en ${host_}:${port} / $db ..."

$sqlPath = Join-Path $ProjectRoot "sql\11-add-sistema-roles.sql"
$sql = Get-Content $sqlPath -Raw

$sql | docker run --rm -i -e "MYSQL_PWD=$pass" mysql:8.0 `
    mysql "-h$host_" "-P$port" "-u$user" --default-character-set=utf8mb4 $db 2>&1 | ForEach-Object {
    if ($_ -match "Duplicate|already exists") {
        Write-Host "Ya aplicado (omitido): $_" -ForegroundColor DarkYellow
    } elseif ($_ -match "ERROR") {
        Write-Host $_ -ForegroundColor Red
    } else {
        Write-Host $_
    }
}

Write-Host "Migracion 11 completada."
Pop-Location
