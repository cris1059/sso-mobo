function Get-BcryptHash {
    param([Parameter(Mandatory)][string]$PlainText)

    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PlainText))
    $hash = docker run --rm -e "PLAIN_B64=$b64" php:8.3-cli php -r "echo password_hash(base64_decode(getenv('PLAIN_B64')), PASSWORD_BCRYPT);"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo generar el hash bcrypt." }
    return $hash.Trim()
}

function Get-KeycloakUserId {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Realm
    )

    $csv = cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users -r $Realm -q username=$Username --fields id --format csv --noquotes 2>nul"
    if ($null -eq $csv) { return "" }
    $id = ($csv -split "`n" | Where-Object { $_ -ne "" } | Select-Object -Last 1)
    if ($null -eq $id) { return "" }
    $id = $id.Trim()
    if ([string]::IsNullOrWhiteSpace($id) -or $id -eq "id") { return "" }
    return $id
}

function Sync-KeycloakUserProfile {
    param(
        [Parameter(Mandatory)][string]$Username,
        [AllowEmptyString()][Parameter(Mandatory)][string]$FirstName,
        [AllowEmptyString()][Parameter(Mandatory)][string]$LastName,
        [AllowEmptyString()][Parameter(Mandatory)][string]$Email,
        [Parameter(Mandatory)][string]$Enabled,
        [Parameter(Mandatory)][string]$Realm
    )

    $userId = Get-KeycloakUserId -Username $Username -Realm $Realm

    if ([string]::IsNullOrWhiteSpace($userId)) {
        docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create users -r $Realm `
            -s "username=$Username" `
            -s "enabled=$Enabled" `
            -s "email=$Email" `
            -s "firstName=$FirstName" `
            -s "lastName=$LastName" `
            -s "emailVerified=true" | Out-Null
    } else {
        docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update "users/$userId" -r $Realm `
            -s "enabled=$Enabled" `
            -s "email=$Email" `
            -s "firstName=$FirstName" `
            -s "lastName=$LastName" `
            -s "emailVerified=true" | Out-Null
    }
}

function Set-KeycloakPasswordPlain {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$PlainPassword,
        [Parameter(Mandatory)][string]$Realm,
        [switch]$Temporary
    )

    $tempArg = if ($Temporary) { @("--temporary") } else { @() }
    docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh set-password -r $Realm `
        --username $Username --new-password $PlainPassword @tempArg | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar la contraseña en Keycloak ($Realm) para '$Username'." }
}

function Ensure-KeycloakRealmRoles {
    param([Parameter(Mandatory)][string]$Realm)

    foreach ($roleName in @("Admin", "Usuario", "developAdmin")) {
        cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get roles/$roleName -r $Realm 2>nul" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create roles -r $Realm `
                -s "name=$roleName" | Out-Null
        }
    }
}

function Sync-KeycloakUserRole {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][int]$RolId,
        [Parameter(Mandatory)][string]$Realm
    )

    $roleMap = @{ 1 = "Admin"; 2 = "Usuario"; 3 = "developAdmin" }
    if (-not $roleMap.ContainsKey($RolId)) {
        throw "Rol invalido: $RolId. Usa 1 (Admin), 2 (Usuario) o 3 (developAdmin)."
    }

    $targetRole = $roleMap[$RolId]
    Ensure-KeycloakRealmRoles -Realm $Realm

    foreach ($roleName in @("Admin", "Usuario", "developAdmin")) {
        if ($roleName -ne $targetRole) {
            cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh remove-roles -r $Realm --uusername $Username --rolename $roleName 2>nul" | Out-Null
        }
    }

    docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh add-roles -r $Realm `
        --uusername $Username --rolename $targetRole | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo asignar el rol '$targetRole' a '$Username' en $Realm." }
}

function Grant-KeycloakMasterAdminAccess {
    param(
        [Parameter(Mandatory)][string]$Username,
        [string]$AdminRealm = "master"
    )

    $bootstrapAdmin = if ($env:KC_ADMIN) { $env:KC_ADMIN } else { "admin" }
    if ($Username -eq $bootstrapAdmin) { return }

    cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh add-roles -r $AdminRealm --uusername $Username --cclientid realm-management --rolename realm-admin 2>nul" | Out-Null
}

function Remove-KeycloakUserFromRealm {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Realm
    )

    $bootstrapAdmin = if ($env:KC_ADMIN) { $env:KC_ADMIN } else { "admin" }
    if ($Username -eq $bootstrapAdmin -and $Realm -eq "master") { return }

    $userId = Get-KeycloakUserId -Username $Username -Realm $Realm
    if (-not [string]::IsNullOrWhiteSpace($userId)) {
        docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh delete "users/$userId" -r $Realm | Out-Null
    }
}

function Sync-UserSSOToKeycloak {
    param(
        [Parameter(Mandatory)][string]$Username,
        [AllowEmptyString()][Parameter(Mandatory)][string]$FirstName,
        [AllowEmptyString()][Parameter(Mandatory)][string]$LastName,
        [AllowEmptyString()][Parameter(Mandatory)][string]$Email,
        [Parameter(Mandatory)][string]$Enabled,
        [Parameter(Mandatory)][int]$RolId,
        [string]$PlainPassword = "",
        [switch]$PrimerInicio,
        [string]$AppsRealm = "mobo",
        [string]$AdminRealm = "master"
    )

    $tempPwd = [bool]$PrimerInicio

    # Login usuarios (tema sso-apps, realm mobo): Admin y Usuario
    Sync-KeycloakUserProfile -Username $Username -FirstName $FirstName -LastName $LastName `
        -Email $Email -Enabled $Enabled -Realm $AppsRealm
    if ($PlainPassword) {
        Set-KeycloakPasswordPlain -Username $Username -PlainPassword $PlainPassword -Realm $AppsRealm -Temporary:$tempPwd
    }
    Sync-KeycloakUserRole -Username $Username -RolId $RolId -Realm $AppsRealm

    if ($RolId -eq 1 -or $RolId -eq 3) {
        # Login admin (tema sso-admin, realm master): Admin y developAdmin
        Sync-KeycloakUserProfile -Username $Username -FirstName $FirstName -LastName $LastName `
            -Email $Email -Enabled $Enabled -Realm $AdminRealm
        if ($PlainPassword) {
            Set-KeycloakPasswordPlain -Username $Username -PlainPassword $PlainPassword -Realm $AdminRealm -Temporary:$tempPwd
        }
        if ($RolId -eq 1) {
            Grant-KeycloakMasterAdminAccess -Username $Username -AdminRealm $AdminRealm
        }
    } else {
        # Usuario normal: no debe existir en master (no puede entrar por login admin)
        Remove-KeycloakUserFromRealm -Username $Username -Realm $AdminRealm
    }
}

function Get-KeycloakUsernames {
    param([Parameter(Mandatory)][string]$Realm)

    $json = cmd /c "docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users -r $Realm --fields username 2>nul"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)) { return @() }

    $matches = [regex]::Matches($json, '"username"\s*:\s*"([^"]+)"')
    return $matches | ForEach-Object { $_.Groups[1].Value }
}

function Remove-OrphanKeycloakUsers {
    param(
        [Parameter(Mandatory)][string[]]$AllowedUsernames,
        [Parameter(Mandatory)][string]$Realm
    )

    $bootstrapAdmin = if ($env:KC_ADMIN) { $env:KC_ADMIN } else { "admin" }
    $allowed = [System.Collections.Generic.HashSet[string]]::new([string[]]$AllowedUsernames)
    if ($Realm -eq "master") { [void]$allowed.Add($bootstrapAdmin) }

    foreach ($username in (Get-KeycloakUsernames -Realm $Realm)) {
        if (-not $allowed.Contains($username)) {
            Write-Host "    - eliminando huérfano en $Realm : $username"
            Remove-KeycloakUserFromRealm -Username $username -Realm $Realm
        }
    }
}

function Set-KeycloakPasswordForUserSSO {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$PlainPassword,
        [Parameter(Mandatory)][int]$RolId,
        [string]$AppsRealm = "mobo",
        [string]$AdminRealm = "master"
    )

    Set-KeycloakPasswordPlain -Username $Username -PlainPassword $PlainPassword -Realm $AppsRealm
    if ($RolId -eq 1 -or $RolId -eq 3) {
        Set-KeycloakPasswordPlain -Username $Username -PlainPassword $PlainPassword -Realm $AdminRealm
    }
}
