# start.ps1 — Levanta Keycloak y aplica temas si es necesario
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectRoot

Write-Host "Iniciando Keycloak (desarrollo local)..."
docker compose -f docker-compose.dev.yml up -d | Out-Null

# Esperar a que Keycloak responda
Write-Host "Esperando a Keycloak " -NoNewline
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    Write-Host "." -NoNewline
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
Write-Host ""

if (-not $ready) {
    Write-Host "ERROR: Keycloak no respondio a tiempo." -ForegroundColor Red
    exit 1
}

Write-Host "Keycloak listo. Verificando temas..." -ForegroundColor Green

# Verificar si el tema del realm master ya está configurado
docker compose -f docker-compose.dev.yml exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials `
    --server http://localhost:8080 --realm master `
    --user admin --password admin 2>$null | Out-Null

$themeCheck = docker compose -f docker-compose.dev.yml exec -T keycloak /opt/keycloak/bin/kcadm.sh get realms/master `
    --fields loginTheme 2>$null

if ($themeCheck -notmatch "sso-admin") {
    Write-Host "Aplicando temas y configuracion de idioma..." -ForegroundColor Yellow
    & "$PSScriptRoot\configure-master-theme.ps1"
} else {
    Write-Host "Temas ya configurados. Todo listo." -ForegroundColor Green
}

& "$PSScriptRoot\register-admin-portal-client.ps1"

Write-Host ""
Write-Host "Opcional: vincular admin a sistemas y configurar acceso:" -ForegroundColor Yellow
Write-Host "  .\scripts\seed-initial-access.ps1"
Write-Host ""
Write-Host "SSO MOBO UAT en linea:" -ForegroundColor Cyan
Write-Host "  Keycloak       : http://localhost:8080"
Write-Host "  Consola Admin  : http://localhost:3002   (npm start en admin-portal/)"
