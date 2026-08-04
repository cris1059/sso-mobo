const { kcRequest } = require('./keycloak-admin');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const ACCESS_ROLE = 'access';
const OTP_REQUIRED_ROLE = 'otp_required';

async function getClientUuid(clientId) {
    const clients = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/clients?clientId=${encodeURIComponent(clientId)}`
    );
    return clients?.[0]?.id || null;
}

async function ensureClientRole(clientUuid, roleName) {
    if (!roleName || roleName === ACCESS_ROLE) return;
    try {
        await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${roleName}`);
    } catch {
        await kcRequest('POST', `/realms/${APPS_REALM}/clients/${clientUuid}/roles`, {
            name: roleName,
            description: `Rol interno: ${roleName}`,
        });
    }
}

async function ensureAccessRole(clientUuid) {
    await ensureClientRole(clientUuid, ACCESS_ROLE);
    try {
        await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${ACCESS_ROLE}`);
    } catch {
        await kcRequest('POST', `/realms/${APPS_REALM}/clients/${clientUuid}/roles`, {
            name: ACCESS_ROLE,
            description: 'Acceso al sistema',
        });
    }
}

async function ensureSistemaRolesInKeycloak(clientId, roleCodigos) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) return;
    await ensureAccessRole(clientUuid);
    for (const codigo of roleCodigos) {
        if (codigo && codigo !== ACCESS_ROLE) await ensureClientRole(clientUuid, codigo);
    }
}

async function getUserId(username) {
    const users = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/users?username=${encodeURIComponent(username)}&exact=true`
    );
    return users?.[0]?.id || null;
}

/**
 * Sincroniza client roles en Keycloak.
 * @param {string[]} assignedRoleCodigos - roles internos a otorgar (además de access)
 * @param {string[]} managedRoleCodigos - catálogo completo (para poder revocar los no asignados)
 */
async function syncUserClientRoles(username, clientId, linked, assignedRoleCodigos = [], managedRoleCodigos = [], rolesRequiring2fa = []) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) return;

    await ensureAccessRole(clientUuid);
    const userId = await getUserId(username);
    if (!userId) return;

    const assigned = Array.isArray(assignedRoleCodigos)
        ? assignedRoleCodigos
        : (assignedRoleCodigos ? [assignedRoleCodigos] : []);
    const internalRoles = [...new Set(assigned.filter((c) => c && c !== ACCESS_ROLE))];
    const protectedRoles = new Set(rolesRequiring2fa.filter(Boolean));
    const needsOtp = linked && internalRoles.some((codigo) => protectedRoles.has(codigo));

    const managed = new Set([
        ACCESS_ROLE,
        OTP_REQUIRED_ROLE,
        ...managedRoleCodigos.filter((c) => c && c !== ACCESS_ROLE),
        ...internalRoles,
    ]);
    const desired = linked ? [ACCESS_ROLE, ...internalRoles, ...(needsOtp ? [OTP_REQUIRED_ROLE] : [])] : [];

    const current = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`
    );
    const currentNames = new Set((current || []).map((r) => r.name));

    const toRevoke = [...currentNames].filter((name) => managed.has(name) && !desired.includes(name));
    if (toRevoke.length) {
        const roles = await Promise.all(
            toRevoke.map((name) =>
                kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${name}`)
            )
        );
        await kcRequest(
            'DELETE',
            `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`,
            roles
        );
    }

    const toGrant = desired.filter((name) => !currentNames.has(name));
    if (toGrant.length) {
        const roles = await Promise.all(
            toGrant.map(async (name) => {
                await ensureClientRole(clientUuid, name);
                return kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${name}`);
            })
        );
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`,
            roles
        );
    }
}

async function syncUserSistemaAccess(username, userLinks, allSistemas, rolesBySistemaId = {}) {
    const linksByClient = new Map();
    for (const link of userLinks) {
        if (!linksByClient.has(link.client_id)) linksByClient.set(link.client_id, new Set());
        const set = linksByClient.get(link.client_id);
        if (Array.isArray(link.role_codigos) && link.role_codigos.length) {
            link.role_codigos.forEach((c) => c && set.add(c));
        } else if (Array.isArray(link.roles) && link.roles.length) {
            link.roles.forEach((r) => r?.codigo && set.add(r.codigo));
        } else if (link.role_codigo) {
            set.add(link.role_codigo);
        }
    }

    for (const sistema of allSistemas) {
        const linked = linksByClient.has(sistema.client_id);
        const assigned = [...(linksByClient.get(sistema.client_id) || [])];
        const roleCatalog = rolesBySistemaId[sistema.id] || [];
        const managed = roleCatalog.map((r) => r.codigo);
        const protectedRoles = roleCatalog.filter((r) => Number(r.require_2fa) === 1).map((r) => r.codigo);
        await syncUserClientRoles(username, sistema.client_id, linked, assigned, managed, protectedRoles);
    }
}

async function syncAllSistemaAccess(getAllLinksFn, getAllSistemasFn, getRolesBySistemaFn) {
    const links = await getAllLinksFn();
    const sistemas = await getAllSistemasFn();
    const rolesBySistemaId = {};
    for (const s of sistemas) {
        rolesBySistemaId[s.id] = await getRolesBySistemaFn(s.id);
    }

    const byUser = new Map();
    for (const link of links) {
        if (!byUser.has(link.user)) byUser.set(link.user, []);
        byUser.get(link.user).push(link);
    }

    const users = [...byUser.keys()];
    for (const user of users) {
        await syncUserSistemaAccess(user, byUser.get(user), sistemas, rolesBySistemaId);
    }

    return users.length;
}

/** @deprecated use syncUserClientRoles */
async function setUserClientAccess(username, clientId, grant) {
    await syncUserClientRoles(username, clientId, grant, grant ? ['usuario'] : [], ['usuario']);
}

module.exports = {
    ACCESS_ROLE,
    OTP_REQUIRED_ROLE,
    ensureAccessRole,
    ensureClientRole,
    ensureSistemaRolesInKeycloak,
    getClientUuid,
    setUserClientAccess,
    syncUserClientRoles,
    syncUserSistemaAccess,
    syncAllSistemaAccess,
};
