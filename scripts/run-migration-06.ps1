# Ejecuta sql/06-seed-admin-system-links.sql en MoboNet

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

Write-Host "Vinculando admin a todos los sistemas..."
$sqlPath = Join-Path $ProjectRoot "sql\06-seed-admin-system-links.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$env:MYSQL_PASS" mysql:8.0 `
    mysql "-h$env:MYSQL_HOST" "-P$($env:MYSQL_PORT)" "-u$env:MYSQL_USER" --default-character-set=utf8mb4 $env:MYSQL_DB

Write-Host "Migracion 06 completada."
Pop-Location
