const { kcRequest } = require('./keycloak-admin');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const ADMIN_REALM = 'master';
const KC_ADMIN = process.env.KC_ADMIN || 'admin';

const ROLE_MAP = { 1: 'Admin', 2: 'Usuario', 3: 'developAdmin' };

async function getUserId(realm, username) {
    const users = await kcRequest('GET', `/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`);
    return users?.[0]?.id || null;
}

async function ensureRealmRole(realm, roleName) {
    try {
        await kcRequest('GET', `/realms/${realm}/roles/${roleName}`);
    } catch {
        await kcRequest('POST', `/realms/${realm}/roles`, { name: roleName });
    }
}

async function syncUserProfile(realm, username, { name, last_name, email, enabled }) {
    const userId = await getUserId(realm, username);
    const payload = {
        username,
        enabled: Boolean(Number(enabled)),
        email: email || '',
        firstName: name || '',
        lastName: last_name || '',
        emailVerified: true,
    };

    if (userId) {
        await kcRequest('PUT', `/realms/${realm}/users/${userId}`, payload);
        return userId;
    }

    await kcRequest('POST', `/realms/${realm}/users`, payload);
    return getUserId(realm, username);
}

async function setPassword(realm, username, plainPassword) {
    const userId = await getUserId(realm, username);
    if (!userId) throw new Error(`Usuario '${username}' no encontrado en realm ${realm}`);
    await kcRequest('PUT', `/realms/${realm}/users/${userId}/reset-password`, {
        type: 'password',
        value: plainPassword,
        temporary: false,
    });
}

async function assignRealmRole(realm, username, rolId) {
    const roleName = ROLE_MAP[Number(rolId)];
    if (!roleName) throw new Error(`Rol inválido: ${rolId}`);

    await ensureRealmRole(realm, 'Admin');
    await ensureRealmRole(realm, 'Usuario');
    await ensureRealmRole(realm, 'developAdmin');

    const userId = await getUserId(realm, username);
    if (!userId) return;

    const currentRoles = await kcRequest('GET', `/realms/${realm}/users/${userId}/role-mappings/realm`);
    if (currentRoles?.length) {
        await kcRequest('DELETE', `/realms/${realm}/users/${userId}/role-mappings/realm`, currentRoles);
    }

    const role = await kcRequest('GET', `/realms/${realm}/roles/${roleName}`);
    await kcRequest('POST', `/realms/${realm}/users/${userId}/role-mappings/realm`, [role]);
}

async function grantMasterAdminAccess(username) {
    if (username === KC_ADMIN) return;

    const userId = await getUserId(ADMIN_REALM, username);
    if (!userId) return;

    const clients = await kcRequest('GET', `/realms/${ADMIN_REALM}/clients?clientId=realm-management`);
    const clientId = clients?.[0]?.id;
    if (!clientId) return;

    const role = await kcRequest(
        'GET',
        `/realms/${ADMIN_REALM}/clients/${clientId}/roles/realm-admin`
    );
    const existing = await kcRequest(
        'GET',
        `/realms/${ADMIN_REALM}/users/${userId}/role-mappings/clients/${clientId}`
    );
    const alreadyHas = existing?.some((r) => r.name === 'realm-admin');
    if (!alreadyHas) {
        await kcRequest(
            'POST',
            `/realms/${ADMIN_REALM}/users/${userId}/role-mappings/clients/${clientId}`,
            [role]
        );
    }
}

async function removeUserFromRealm(realm, username) {
    if (username === KC_ADMIN && realm === ADMIN_REALM) return;
    const userId = await getUserId(realm, username);
    if (userId) await kcRequest('DELETE', `/realms/${realm}/users/${userId}`);
}

async function listRealmUsernames(realm) {
    const users = await kcRequest('GET', `/realms/${realm}/users?max=1000`);
    return (users || []).map((u) => u.username);
}

async function removeOrphans(realm, allowedUsernames) {
    const allowed = new Set(allowedUsernames);
    if (realm === ADMIN_REALM) allowed.add(KC_ADMIN);

    for (const username of await listRealmUsernames(realm)) {
        if (!allowed.has(username)) {
            await removeUserFromRealm(realm, username);
        }
    }
}

async function syncUserToKeycloak(user, plainPassword = '') {
    const { user: username, name, last_name, email, enabled, rol } = user;

    await syncUserProfile(APPS_REALM, username, { name, last_name, email, enabled });
    if (plainPassword) await setPassword(APPS_REALM, username, plainPassword);
    await assignRealmRole(APPS_REALM, username, rol);

    if (Number(rol) === 1 || Number(rol) === 3) {
        await syncUserProfile(ADMIN_REALM, username, { name, last_name, email, enabled });
        if (plainPassword) await setPassword(ADMIN_REALM, username, plainPassword);
        if (Number(rol) === 1) await grantMasterAdminAccess(username);
    } else {
        await removeUserFromRealm(ADMIN_REALM, username);
    }
}

async function syncAllActiveUsers(getUsersFn) {
    const users = await getUsersFn();
    const allUsernames = users.map((u) => u.user);
    const adminUsernames = users.filter((u) => Number(u.rol) === 1 || Number(u.rol) === 3).map((u) => u.user);

    for (const user of users) {
        await syncUserToKeycloak(user);
    }

    await removeOrphans(APPS_REALM, allUsernames);
    await removeOrphans(ADMIN_REALM, adminUsernames);

    return users.length;
}

module.exports = {
    syncUserToKeycloak,
    syncAllActiveUsers,
    setPasswordForUser: async (username, plainPassword, rolId) => {
        await setPassword(APPS_REALM, username, plainPassword);
        if (Number(rolId) === 1 || Number(rolId) === 3) {
            await setPassword(ADMIN_REALM, username, plainPassword);
        }
    },
};
