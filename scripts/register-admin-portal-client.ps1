# Registra el cliente OIDC admin-portal en el realm mobo de Keycloak.
# La consola admin autentica contra mobo (misma contraseña que userSSO).
# Ejecutar después de: docker compose up -d

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

$realm = if ($env:KC_REALM) { $env:KC_REALM } else { "mobo" }

Write-Host "Esperando a que Keycloak responda..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080/realms/$realm" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Error "Keycloak no respondió en http://localhost:8080. Verifica Docker."
}

$clientId = "admin-portal"
$token = (Invoke-RestMethod -Method Post -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{
        grant_type = "password"
        client_id  = "admin-cli"
        username   = "admin"
        password   = "admin"
    }).access_token

$headers = @{
    Authorization  = "Bearer $token"
    "Content-Type" = "application/json"
}

$existing = Invoke-RestMethod -Method Get `
    -Uri "http://localhost:8080/admin/realms/$realm/clients?clientId=$clientId" `
    -Headers $headers

if ($existing.Count -gt 0) {
    $internalId = $existing[0].id
    Write-Host "Cliente $clientId ya existe en realm $realm. Actualizando redirect URIs..."
    $full = Invoke-RestMethod -Method Get `
        -Uri "http://localhost:8080/admin/realms/$realm/clients/$internalId" `
        -Headers $headers
    $full.redirectUris = @("http://localhost:3002/*")
    $full.webOrigins = @("+")
    $full.enabled = $true
    $full.standardFlowEnabled = $true
    Invoke-RestMethod -Method Put `
        -Uri "http://localhost:8080/admin/realms/$realm/clients/$internalId" `
        -Headers $headers -Body ($full | ConvertTo-Json -Depth 10) | Out-Null
} else {
    Write-Host "Creando cliente $clientId en realm $realm..."
    $createBody = @{
        clientId                  = $clientId
        name                      = "MOBO Admin Portal"
        enabled                   = $true
        clientAuthenticatorType   = "client-secret"
        secret                    = "admin-portal-secret"
        redirectUris              = @("http://localhost:3002/*")
        webOrigins                = @("+")
        standardFlowEnabled       = $true
        directAccessGrantsEnabled = $false
        publicClient              = $false
        protocol                  = "openid-connect"
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post `
        -Uri "http://localhost:8080/admin/realms/$realm/clients" `
        -Headers $headers -Body $createBody | Out-Null
}

Write-Host "Cliente admin-portal listo en realm $realm."
Write-Host "  URL consola : http://localhost:3002"
Write-Host "  Redirect    : http://localhost:3002/callback"

Pop-Location
