# Alta rapida en userSSO + sincronizacion Keycloak segun rol.
#
# Rol 1 Admin  -> login admin (master) + login usuarios (mobo)
# Rol 2 Usuario -> solo login usuarios (mobo)
#
# Uso:
#   .\scripts\insert-userSSO.ps1 -User jperez -Password "Clave123" -Name Juan -LastName Perez -Email jperez@mobo.com
#   .\scripts\insert-userSSO.ps1 -User madmin -Password "Clave123" -Name Maria -LastName Admin -Email madmin@mobo.com -Rol 1

param(
    [Parameter(Mandatory)][string]$User,
    [Parameter(Mandatory)][string]$Password,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$LastName,
    [Parameter(Mandatory)][string]$Email,
    [ValidateSet(1, 2)]
    [int]$Rol = 2,
    [string]$Area = "",
    [string]$Dept = "",
    [string]$Store = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "password-utils.ps1")

$host_ = $env:MYSQL_HOST
$port  = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$dbUser = $env:MYSQL_USER
$dbPass = $env:MYSQL_PASS
$db    = $env:MYSQL_DB

$hash = Get-BcryptHash -PlainText $Password
$esc = @{
    user  = $User -replace "'", "''"
    name  = $Name -replace "'", "''"
    last  = $LastName -replace "'", "''"
    email = $Email -replace "'", "''"
    area  = $Area -replace "'", "''"
    dept  = $Dept -replace "'", "''"
    store = $Store -replace "'", "''"
    hash  = $hash -replace "'", "''"
}

@"
USE $db;
INSERT INTO userSSO (user, pass_hash, name, last_name, email, area, dept, store, enabled, rol, intrDate)
VALUES ('$($esc.user)', '$($esc.hash)', '$($esc.name)', '$($esc.last)', '$($esc.email)', '$($esc.area)', '$($esc.dept)', '$($esc.store)', 1, $Rol, CURDATE());
"@ | docker run --rm -i -e "MYSQL_PWD=$dbPass" mysql:8.0 `
    mysql "-h$host_" "-P$port" "-u$dbUser" --default-character-set=utf8mb4 $db

if ($LASTEXITCODE -ne 0) { throw "No se pudo insertar en userSSO." }

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin | Out-Null

Sync-UserSSOToKeycloak -Username $User -FirstName $Name -LastName $LastName -Email $Email `
    -Enabled "true" -RolId $Rol -PlainPassword $Password

$acceso = if ($Rol -eq 1) { "login admin + login usuarios" } else { "solo login usuarios" }
Write-Host ""
Write-Host "Listo: $User (rol $Rol) -> $acceso"

Pop-Location
