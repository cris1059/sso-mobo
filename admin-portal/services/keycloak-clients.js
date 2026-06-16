const crypto = require('crypto');
const { kcRequest } = require('./keycloak-admin');
const kcAccess = require('./keycloak-access');
const kcEnforcement = require('./keycloak-enforcement');

const APPS_REALM = process.env.KC_REALM || 'mobo';

const SYSTEM_CLIENTS = new Set([
    'account',
    'account-console',
    'admin-cli',
    'broker',
    'realm-management',
    'security-admin-console',
]);

function isAppClient(client) {
    return client.protocol === 'openid-connect' && !SYSTEM_CLIENTS.has(client.clientId);
}

function toPublicClient(c) {
    return {
        id: c.id,
        clientId: c.clientId,
        name: c.name || c.clientId,
        enabled: c.enabled,
        redirectUris: c.redirectUris || [],
        webOrigins: c.webOrigins || [],
        standardFlowEnabled: c.standardFlowEnabled,
    };
}

function parseRedirectUris(value) {
    if (Array.isArray(value)) return value.map((u) => u.trim()).filter(Boolean);
    if (typeof value === 'string') {
        return value.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
    }
    return [];
}

function parseWebOrigins(value) {
    if (Array.isArray(value)) return value.map((u) => u.trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return ['+'];
}

function generateSecret() {
    return crypto.randomBytes(16).toString('hex');
}

async function listClients() {
    const clients = await kcRequest('GET', `/realms/${APPS_REALM}/clients?max=200`);
    return (clients || []).filter(isAppClient).map(toPublicClient);
}

async function getClientById(internalId) {
    const client = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
    if (!isAppClient(client)) throw new Error('Cliente no encontrado');
    return toPublicClient(client);
}

async function getClientSecret(internalId) {
    await getClientById(internalId);
    const data = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}/client-secret`);
    return data?.value || '';
}

async function createClient({ clientId, name, redirectUris, webOrigins, secret, enabled }) {
    if (!clientId?.trim()) throw new Error('El ID del sistema es obligatorio');

    const uris = parseRedirectUris(redirectUris);
    if (!uris.length) throw new Error('Al menos una Redirect URI es obligatoria');

    const clientSecret = secret?.trim() || generateSecret();

    await kcRequest('POST', `/realms/${APPS_REALM}/clients`, {
        clientId: clientId.trim(),
        name: (name || clientId).trim(),
        enabled: enabled !== false && enabled !== '0' && enabled !== 0,
        protocol: 'openid-connect',
        publicClient: false,
        clientAuthenticatorType: 'client-secret',
        secret: clientSecret,
        redirectUris: uris,
        webOrigins: parseWebOrigins(webOrigins),
        standardFlowEnabled: true,
        directAccessGrantsEnabled: false,
    });

    const created = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/clients?clientId=${encodeURIComponent(clientId.trim())}`
    );

    const kcUuid = created[0].id;
    await kcAccess.ensureAccessRole(kcUuid);
    await kcEnforcement.ensureClientLoginEnforcement(clientId.trim());

    return { ...toPublicClient(created[0]), secret: clientSecret, kc_client_uuid: kcUuid };
}

async function updateClient(internalId, { name, redirectUris, webOrigins, enabled }) {
    const existing = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
    if (!isAppClient(existing)) throw new Error('Cliente no encontrado');

    const uris = parseRedirectUris(redirectUris);
    if (!uris.length) throw new Error('Al menos una Redirect URI es obligatoria');

    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${internalId}`, {
        ...existing,
        name: (name || existing.clientId).trim(),
        enabled: enabled !== false && enabled !== '0' && enabled !== 0,
        redirectUris: uris,
        webOrigins: parseWebOrigins(webOrigins),
        standardFlowEnabled: true,
    });

    return getClientById(internalId);
}

async function deleteClient(internalId) {
    const client = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
    if (!isAppClient(client)) throw new Error('No se puede eliminar este cliente');
    await kcRequest('DELETE', `/realms/${APPS_REALM}/clients/${internalId}`);
}

async function regenerateSecret(internalId) {
    await getClientById(internalId);
    const data = await kcRequest('POST', `/realms/${APPS_REALM}/clients/${internalId}/client-secret`);
    return data?.value || '';
}

module.exports = {
    listClients,
    getClientById,
    getClientSecret,
    createClient,
    updateClient,
    deleteClient,
    regenerateSecret,
};
