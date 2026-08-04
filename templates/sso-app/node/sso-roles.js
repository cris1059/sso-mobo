/**
 * Roles internos desde token OIDC (resource_access[clientId].roles).
 * Copiar a lib/sso-roles.js en apps Node/Express conectadas al SSO.
 */

const ACCESS_ROLE = 'access';
const DEFAULT_PRIORITY = ['admin', 'usuario', 'consulta'];

function getClientRoles(tokenPayload, clientId) {
    return tokenPayload?.resource_access?.[clientId]?.roles ?? [];
}

function getInternalRoles(tokenPayload, clientId) {
    return getClientRoles(tokenPayload, clientId).filter((r) => r !== ACCESS_ROLE);
}

function getPrimaryInternalRole(tokenPayload, clientId, priority = DEFAULT_PRIORITY) {
    const internal = getInternalRoles(tokenPayload, clientId);
    if (!internal.length) return null;
    for (const code of priority) {
        if (internal.includes(code)) return code;
    }
    return internal[0];
}

function hasSystemAccess(tokenPayload, clientId) {
    return getClientRoles(tokenPayload, clientId).includes(ACCESS_ROLE);
}

function hasInternalRole(tokenPayload, clientId, codigo) {
    return getClientRoles(tokenPayload, clientId).includes(codigo);
}

module.exports = {
    ACCESS_ROLE,
    DEFAULT_PRIORITY,
    getClientRoles,
    getInternalRoles,
    getPrimaryInternalRole,
    hasSystemAccess,
    hasInternalRole,
};
