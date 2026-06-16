const { kcRequest } = require('./keycloak-admin');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const ACCESS_ROLE = 'access';

async function getClientUuid(clientId) {
    const clients = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/clients?clientId=${encodeURIComponent(clientId)}`
    );
    return clients?.[0]?.id || null;
}

async function ensureAccessRole(clientUuid) {
    try {
        await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${ACCESS_ROLE}`);
    } catch {
        await kcRequest('POST', `/realms/${APPS_REALM}/clients/${clientUuid}/roles`, {
            name: ACCESS_ROLE,
            description: 'Acceso al sistema',
        });
    }
}

async function getUserId(username) {
    const users = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/users?username=${encodeURIComponent(username)}&exact=true`
    );
    return users?.[0]?.id || null;
}

async function setUserClientAccess(username, clientId, grant) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) return;

    await ensureAccessRole(clientUuid);
    const userId = await getUserId(username);
    if (!userId) return;

    const role = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/clients/${clientUuid}/roles/${ACCESS_ROLE}`
    );

    const current = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`
    );
    const hasAccess = current?.some((r) => r.name === ACCESS_ROLE);

    if (grant && !hasAccess) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`,
            [role]
        );
    } else if (!grant && hasAccess) {
        await kcRequest(
            'DELETE',
            `/realms/${APPS_REALM}/users/${userId}/role-mappings/clients/${clientUuid}`,
            [role]
        );
    }
}

async function syncUserSistemaAccess(username, linkedClientIds, allClientIds) {
    const linked = new Set(linkedClientIds);
    for (const clientId of allClientIds) {
        await setUserClientAccess(username, clientId, linked.has(clientId));
    }
}

async function syncAllSistemaAccess(getAllLinksFn, getAllSistemasFn) {
    const links = await getAllLinksFn();
    const sistemas = await getAllSistemasFn();
    const allClientIds = sistemas.map((s) => s.client_id);

    const byUser = new Map();
    for (const link of links) {
        if (!byUser.has(link.user)) byUser.set(link.user, new Set());
        byUser.get(link.user).add(link.client_id);
    }

    const users = [...byUser.keys()];
    for (const user of users) {
        await syncUserSistemaAccess(user, [...byUser.get(user)], allClientIds);
    }

    return users.length;
}

module.exports = {
    ensureAccessRole,
    getClientUuid,
    setUserClientAccess,
    syncUserSistemaAccess,
    syncAllSistemaAccess,
    ACCESS_ROLE,
};
