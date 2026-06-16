# Ejecuta migracion 05: developAdmin, sistemaSSO, userSSO_sistema

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")

$host_ = $env:MYSQL_HOST
$port  = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$user  = $env:MYSQL_USER
$pass  = $env:MYSQL_PASS
$db    = $env:MYSQL_DB

Write-Host "Ejecutando migracion sistemaSSO en $host_`:$port / $db ..."

$sqlPath = Join-Path $ProjectRoot "sql\05-create-sistemaSSO.sql"
Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$pass" mysql:8.0 `
    mysql "-h$host_" "-P$port" "-u$user" --default-character-set=utf8mb4 $db

if ($LASTEXITCODE -ne 0) { throw "Error ejecutando 05-create-sistemaSSO.sql" }

Write-Host "Migracion completada: rol developAdmin (3), sistemaSSO, userSSO_sistema"
Pop-Location
