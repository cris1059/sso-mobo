# Crea roleSSO, userSSO y el usuario admin inicial.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "password-utils.ps1")

$host_ = $env:MYSQL_HOST
$port  = if ($env:MYSQL_PORT) { $env:MYSQL_PORT } else { "3306" }
$user  = $env:MYSQL_USER
$pass  = $env:MYSQL_PASS
$db    = $env:MYSQL_DB

Write-Host "Conectando a MySQL: $host_`:$port / $db ..."

function Invoke-RemoteSqlFile($file) {
    $sqlPath = Join-Path $ProjectRoot $file
    Get-Content $sqlPath -Raw | docker run --rm -i -e "MYSQL_PWD=$pass" mysql:8.0 `
        mysql "-h$host_" "-P$port" "-u$user" --default-character-set=utf8mb4 $db
    if ($LASTEXITCODE -ne 0) { throw "Error ejecutando $file" }
}

function Invoke-RemoteSql($sql) {
    $sql | docker run --rm -i -e "MYSQL_PWD=$pass" mysql:8.0 `
        mysql "-h$host_" "-P$port" "-u$user" --default-character-set=utf8mb4 $db
    if ($LASTEXITCODE -ne 0) { throw "Error ejecutando SQL." }
}

Invoke-RemoteSqlFile "sql/00-create-roleSSO.sql"
Invoke-RemoteSqlFile "sql/01-create-userSSO.sql"
Invoke-RemoteSqlFile "sql/03-migrate-pass-to-pass_hash.sql"
Invoke-RemoteSqlFile "sql/04-migrate-add-rol.sql"
Write-Host "Tablas roleSSO y userSSO listas."

$adminPlain = "admin"
$adminHash = Get-BcryptHash -PlainText $adminPlain
$adminHashEsc = $adminHash -replace "'", "''"

@"
USE $db;
INSERT INTO userSSO (user, pass_hash, name, last_name, email, jobD, area, dept, enabled, rol, intrDate)
VALUES ('admin', '$adminHashEsc', 'Administrador', 'SSO', 'admin@mobo.com', 'Administrador de sistemas', 'CORPORATIVO', 'TI', 1, 1, CURDATE())
ON DUPLICATE KEY UPDATE
    pass_hash = VALUES(pass_hash), name = VALUES(name), last_name = VALUES(last_name),
    email = VALUES(email), enabled = VALUES(enabled), rol = VALUES(rol);
"@ | Invoke-RemoteSql

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master --user admin --password admin | Out-Null

Sync-UserSSOToKeycloak -Username "admin" -FirstName "Administrador" -LastName "SSO" `
    -Email "admin@mobo.com" -Enabled "true" -RolId 1 -PlainPassword $adminPlain

Write-Host "Usuario admin listo: admin / admin (login admin + usuarios)"

Pop-Location
