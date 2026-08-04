# Registra el cliente OIDC admin-portal en el realm mobo de Keycloak.
# La consola admin autentica contra mobo (misma contraseña que userSSO).
# Ejecutar después de: docker compose up -d

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot
. (Join-Path $PSScriptRoot "load-env.ps1")

$realm = if ($env:KC_REALM) { $env:KC_REALM } else { "mobo" }
$kcPort = if ($env:KC_PORT) { $env:KC_PORT } else { "8080" }
$adminPort = if ($env:ADMIN_PORT) { $env:ADMIN_PORT } else { "3002" }
$kcHost = if ($env:KC_HOSTNAME) { $env:KC_HOSTNAME } else { "localhost" }
$kcPublic = if ($env:KC_PUBLIC_URL) { $env:KC_PUBLIC_URL.TrimEnd('/') } else { "http://${kcHost}:${kcPort}" }
$kcBase = $kcPublic
$redirectBase = if ($env:ADMIN_PUBLIC_URL) {
    $env:ADMIN_PUBLIC_URL.TrimEnd('/')
} elseif ($env:REDIRECT_URL) {
    ($env:REDIRECT_URL -replace '/callback$', '')
} else {
    "http://${kcHost}:${adminPort}"
}

Write-Host "Esperando a que Keycloak responda en $kcBase..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$kcBase/realms/$realm" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Error "Keycloak no respondió en $kcBase. Verifica Docker."
}

$clientId = "admin-portal"
$token = (Invoke-RestMethod -Method Post -Uri "$kcBase/realms/master/protocol/openid-connect/token" `
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
    -Uri "$kcBase/admin/realms/$realm/clients?clientId=$clientId" `
    -Headers $headers

$redirectUris = @("$redirectBase/*", "$redirectBase/callback")
# localhost y 127.0.0.1 son distintos para Keycloak; registrar ambos en desarrollo local
$altBase = if ($redirectBase -match '://localhost(?=[:/]|$)') {
    $redirectBase -replace '://localhost', '://127.0.0.1'
} elseif ($redirectBase -match '://127\.0\.0\.1(?=[:/]|$)') {
    $redirectBase -replace '://127\.0\.0\.1', '://localhost'
} else { $null }
if ($altBase) {
    $redirectUris += @("$altBase/*", "$altBase/callback")
}
$redirectUris = $redirectUris | Select-Object -Unique

if ($existing.Count -gt 0) {
    $internalId = $existing[0].id
    Write-Host "Cliente $clientId ya existe en realm $realm. Actualizando redirect URIs..."
    $full = Invoke-RestMethod -Method Get `
        -Uri "$kcBase/admin/realms/$realm/clients/$internalId" `
        -Headers $headers
    $full.redirectUris = $redirectUris
    $full.webOrigins = @("+")
    $full.enabled = $true
    $full.standardFlowEnabled = $true
    if (-not $full.attributes) { $full | Add-Member -NotePropertyName attributes -NotePropertyValue (@{}) }
    $full.attributes."post.logout.redirect.uris" = "+"
    Invoke-RestMethod -Method Put `
        -Uri "$kcBase/admin/realms/$realm/clients/$internalId" `
        -Headers $headers -Body ($full | ConvertTo-Json -Depth 10) | Out-Null
} else {
    Write-Host "Creando cliente $clientId en realm $realm..."
    $createBody = @{
        clientId                  = $clientId
        name                      = "MOBO Admin Portal"
        enabled                   = $true
        clientAuthenticatorType   = "client-secret"
        secret                    = "admin-portal-secret"
        redirectUris              = $redirectUris
        webOrigins                = @("+")
        standardFlowEnabled       = $true
        directAccessGrantsEnabled = $false
        publicClient              = $false
        protocol                  = "openid-connect"
        attributes                = @{ "post.logout.redirect.uris" = "+" }
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post `
        -Uri "$kcBase/admin/realms/$realm/clients" `
        -Headers $headers -Body $createBody | Out-Null
}

Write-Host "Cliente admin-portal listo en realm $realm."
Write-Host "  URL consola : $redirectBase"
Write-Host "  Redirect    : $redirectBase/callback"

Pop-Location
