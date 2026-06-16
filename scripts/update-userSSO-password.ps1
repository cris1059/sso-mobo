# Actualiza pass_hash en userSSO y contraseña en Keycloak (mobo; y master si es Admin).

param(
    [Parameter(Mandatory)][string]$User,
    [Parameter(Mandatory)][string]$Password
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

$rolRow = docker run --rm -e "MYSQL_PWD=$dbPass" mysql:8.0 mysql "-h$host_" "-P$port" "-u$dbUser" $db -N -B `
    -e "SELECT rol FROM userSSO WHERE user='$($User -replace "'","''")'"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rolRow)) {
    throw "Usuario '$User' no encontrado en userSSO."
}
$rolId = [int]$rolRow.Trim()

$hash = Get-BcryptHash -PlainText $Password
$userEsc = $User -replace "'", "''"
$hashEsc = $hash -replace "'", "''"

@"
USE $db;
UPDATE userSSO SET pass_hash = '$hashEsc', updated_at = NOW() WHERE user = '$userEsc';
"@ | docker run --rm -i -e "MYSQL_PWD=$dbPass" mysql:8.0 `
    mysql "-h$host_" "-P$port" "-u$dbUser" --default-character-set=utf8mb4 $db

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin | Out-Null

Set-KeycloakPasswordForUserSSO -Username $User -PlainPassword $Password -RolId $rolId
Write-Host "Contraseña actualizada para '$User'."

Pop-Location
