# Sincroniza userSSO a Keycloak y elimina usuarios que no estén en la BD.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "password-utils.ps1")

$host_  = $env:MYSQL_HOST
$port   = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$MysqlUser = $env:MYSQL_USER
$MysqlPass = $env:MYSQL_PASS
$MysqlDb   = $env:MYSQL_DB
$KcAdmin   = if ($env:KC_ADMIN) { $env:KC_ADMIN } else { "admin" }
$KcPass    = if ($env:KC_ADMIN_PASS) { $env:KC_ADMIN_PASS } else { "admin" }

function Invoke-RemoteMysql {
    param([string[]]$ExtraArgs)
    docker run --rm -e "MYSQL_PWD=$MysqlPass" mysql:8.0 mysql "-h$host_" "-P$port" "-u$MysqlUser" @ExtraArgs
}

Write-Host "Esperando MySQL y Keycloak..."
for ($i = 0; $i -lt 30; $i++) {
    Invoke-RemoteMysql -ExtraArgs @("-e", "SELECT 1") 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
}

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user $KcAdmin --password $KcPass | Out-Null

$query = @"
SELECT u.user, IFNULL(u.name,''), IFNULL(u.last_name,''), IFNULL(u.email,''), u.enabled, u.rol
FROM userSSO u WHERE u.enabled = 1
"@
$raw = Invoke-RemoteMysql -ExtraArgs @($MysqlDb, "-N", "-B", "-e", $query) 2>$null
$lines = ($raw -split "`n") | Where-Object { $_.Trim() -ne "" }

$allUsers = @()
$adminUsers = @()

foreach ($line in $lines) {
    $c = $line -split "`t"
    if ($c.Count -lt 6) { continue }

    $allUsers += $c[0]
    if ([int]$c[5] -eq 1 -or [int]$c[5] -eq 3) { $adminUsers += $c[0] }

    $acceso = if ([int]$c[5] -eq 1) { "admin+usuarios" } else { "solo usuarios" }
    Write-Host "  -> $($c[0]) rol=$($c[5]) ($acceso)"

    Sync-UserSSOToKeycloak -Username $c[0] -FirstName $c[1] -LastName $c[2] -Email $c[3] `
        -Enabled $c[4] -RolId ([int]$c[5])
}

Write-Host "Limpiando usuarios huérfanos en Keycloak (solo los de userSSO deben existir)..."
Remove-OrphanKeycloakUsers -AllowedUsernames $allUsers -Realm "mobo"
Remove-OrphanKeycloakUsers -AllowedUsernames $adminUsers -Realm "master"

Write-Host "Sincronizacion completada. Usuarios activos en BD: $($allUsers -join ', ')"

Write-Host "Sincronizando acceso por sistema y enforcement de login..."
node (Join-Path $PSScriptRoot "sync-all-access.js")

Pop-Location
