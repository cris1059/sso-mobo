const { kcRequest } = require('./keycloak-admin');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const ADMIN_REALM = 'master';
const KC_ADMIN = process.env.KC_ADMIN || 'admin';
const SYNC_CONCURRENCY = Number(process.env.KC_SYNC_CONCURRENCY || 12);

const ROLE_MAP = { 1: 'Admin', 2: 'Usuario', 3: 'developAdmin' };

const rolesReady = new Set();
const roleCache = new Map(); // `${realm}:${roleName}` -> role object

async function getUserId(realm, username) {
    const users = await kcRequest('GET', `/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`);
    return users?.[0]?.id || null;
}

async function getKcUser(realm, username) {
    const userId = await getUserId(realm, username);
    if (!userId) return null;
    return kcRequest('GET', `/realms/${realm}/users/${userId}`);
}

async function ensureRealmRoles(realm) {
    if (rolesReady.has(realm)) return;
    for (const roleName of Object.values(ROLE_MAP)) {
        try {
            await kcRequest('GET', `/realms/${realm}/roles/${roleName}`);
        } catch {
            await kcRequest('POST', `/realms/${realm}/roles`, { name: roleName });
        }
    }
    rolesReady.add(realm);
}

async function getRealmRole(realm, roleName) {
    const key = `${realm}:${roleName}`;
    if (roleCache.has(key)) return roleCache.get(key);
    const role = await kcRequest('GET', `/realms/${realm}/roles/${roleName}`);
    roleCache.set(key, role);
    return role;
}

function sanitizeEmail(raw, username) {
    let email = raw ? String(raw).trim() : '';
    email = email.replace(/\.{2,}/g, '.');
    if (!email || !email.includes('@') || email.endsWith('.') || email.includes('..')) {
        return `${username}@users.sso.local`;
    }
    return email;
}

async function syncUserProfile(realm, username, { name, last_name, email, enabled }) {
    const userId = await getUserId(realm, username);
    const payload = {
        username,
        enabled: Boolean(Number(enabled)),
        email: sanitizeEmail(email, username),
        firstName: name || '',
        lastName: last_name || '',
        emailVerified: true,
    };

    if (userId) {
        const existing = await kcRequest('GET', `/realms/${realm}/users/${userId}`);
        await kcRequest('PUT', `/realms/${realm}/users/${userId}`, { ...existing, ...payload });
        return userId;
    }

    await kcRequest('POST', `/realms/${realm}/users`, payload);
    return getUserId(realm, username);
}

async function setPassword(realm, username, plainPassword, { temporary = false } = {}) {
    const userId = await getUserId(realm, username);
    if (!userId) throw new Error(`Usuario '${username}' no encontrado en realm ${realm}`);
    await kcRequest('PUT', `/realms/${realm}/users/${userId}/reset-password`, {
        type: 'password',
        value: plainPassword,
        temporary,
    });
}

async function setRequiredAction(realm, username, action, enabled) {
    const userId = await getUserId(realm, username);
    if (!userId) return;
    const user = await kcRequest('GET', `/realms/${realm}/users/${userId}`);
    let actions = user.requiredActions || [];
    if (enabled && !actions.includes(action)) actions.push(action);
    if (!enabled) actions = actions.filter((a) => a !== action);
    await kcRequest('PUT', `/realms/${realm}/users/${userId}`, { ...user, requiredActions: actions });
}

async function userNeedsPasswordChange(realm, username) {
    const user = await getKcUser(realm, username);
    if (!user) return false;
    return (user.requiredActions || []).includes('UPDATE_PASSWORD');
}

async function assignRealmRole(realm, username, rolId) {
    const roleName = ROLE_MAP[Number(rolId)];
    if (!roleName) throw new Error(`Rol inválido: ${rolId}`);

    await ensureRealmRoles(realm);

    const userId = await getUserId(realm, username);
    if (!userId) return;

    const currentRoles = await kcRequest('GET', `/realms/${realm}/users/${userId}/role-mappings/realm`);
    const managedNames = new Set(Object.values(ROLE_MAP));
    const currentManaged = (currentRoles || []).filter((r) => managedNames.has(r.name));
    if (currentManaged.length === 1 && currentManaged[0].name === roleName) {
        return; // ya tiene el rol correcto
    }

    if (currentManaged.length) {
        await kcRequest('DELETE', `/realms/${realm}/users/${userId}/role-mappings/realm`, currentManaged);
    }

    const role = await getRealmRole(realm, roleName);
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
    const names = [];
    let first = 0;
    const pageSize = 100;
    for (;;) {
        const users = await kcRequest('GET', `/realms/${realm}/users?first=${first}&max=${pageSize}`);
        if (!users?.length) break;
        for (const u of users) names.push(u.username);
        if (users.length < pageSize) break;
        first += pageSize;
    }
    return names;
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

function isPrimerInicio(user) {
    return Number(user?.PrimerInicio ?? user?.primer_inicio ?? 0) === 1;
}

async function applyPasswordPolicy(realm, username, plainPassword, primerInicio) {
    if (primerInicio) {
        await setRequiredAction(realm, username, 'UPDATE_PASSWORD', true);
        if (plainPassword) {
            await setPassword(realm, username, plainPassword, { temporary: true });
        }
        return;
    }

    await setRequiredAction(realm, username, 'UPDATE_PASSWORD', false);
    if (plainPassword) {
        await setPassword(realm, username, plainPassword, { temporary: false });
    }
}

async function syncUserToKeycloak(user, plainPassword = '') {
    const { user: username, name, last_name, email, enabled, rol } = user;
    const primerInicio = isPrimerInicio(user);

    await syncUserProfile(APPS_REALM, username, { name, last_name, email, enabled });
    if (primerInicio || plainPassword) {
        await applyPasswordPolicy(APPS_REALM, username, plainPassword, primerInicio);
    }
    await assignRealmRole(APPS_REALM, username, rol);

    if (Number(rol) === 1 || Number(rol) === 3) {
        await syncUserProfile(ADMIN_REALM, username, { name, last_name, email, enabled });
        if (primerInicio || plainPassword) {
            await applyPasswordPolicy(ADMIN_REALM, username, plainPassword, primerInicio);
        }
        if (Number(rol) === 1) await grantMasterAdminAccess(username);
    } else {
        await removeUserFromRealm(ADMIN_REALM, username);
    }
}

async function refreshPrimerInicioFromKeycloak(username) {
    const needsChange = await userNeedsPasswordChange(APPS_REALM, username);
    return !needsChange;
}

async function mapPool(items, concurrency, worker) {
    const results = [];
    let idx = 0;
    async function run() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await worker(items[i], i);
        }
    }
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
    await Promise.all(runners);
    return results;
}

async function syncAllActiveUsers(getUsersFn) {
    const users = await getUsersFn();
    const allUsernames = users.map((u) => u.user);
    const adminUsernames = users
        .filter((u) => Number(u.rol) === 1 || Number(u.rol) === 3)
        .map((u) => u.user);

    await ensureRealmRoles(APPS_REALM);
    if (adminUsernames.length) await ensureRealmRoles(ADMIN_REALM);

    const errors = [];
    let synced = 0;

    await mapPool(users, SYNC_CONCURRENCY, async (user) => {
        try {
            await syncUserToKeycloak(user);
            synced += 1;
        } catch (err) {
            errors.push({ user: user.user, error: err.message || String(err) });
        }
    });

    await removeOrphans(APPS_REALM, allUsernames);
    await removeOrphans(ADMIN_REALM, adminUsernames);

    return { synced, total: users.length, errors };
}

module.exports = {
    syncUserToKeycloak,
    syncAllActiveUsers,
    refreshPrimerInicioFromKeycloak,
    userNeedsPasswordChange,
    setPasswordForUser: async (username, plainPassword, rolId, { primerInicio = false } = {}) => {
        await applyPasswordPolicy(APPS_REALM, username, plainPassword, primerInicio);
        if (Number(rolId) === 1 || Number(rolId) === 3) {
            await applyPasswordPolicy(ADMIN_REALM, username, plainPassword, primerInicio);
        }
    },
};
