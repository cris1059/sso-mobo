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

function deriveAppHomeUrl(redirectUris) {
    const uris = parseRedirectUris(redirectUris);
    for (const value of uris) {
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) continue;
            return `${url.protocol}//${url.host}/`;
        } catch {
            // Ignorar patrones o redirects relativos; probar el siguiente.
        }
    }
    return '';
}

function clientUrlSettings(redirectUris) {
    const homeUrl = deriveAppHomeUrl(redirectUris);
    return {
        rootUrl: homeUrl || undefined,
        baseUrl: homeUrl || undefined,
        postLogoutRedirectUris: homeUrl ? `+##${homeUrl}` : '+',
    };
}

function generateSecret() {
    return crypto.randomBytes(16).toString('hex');
}

/** "+" = mismas URIs que Valid Redirect URIs (logout RP-Initiated sin pantalla de confirmación). */
async function ensurePostLogoutRedirectUris(clientUuid, client = null) {
    const current = client || (await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}`));
    const attrs = { ...(current.attributes || {}) };
    if (attrs['post.logout.redirect.uris'] === '+') return current;
    attrs['post.logout.redirect.uris'] = '+';
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${clientUuid}`, {
        ...current,
        attributes: attrs,
    });
    return kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}`);
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

    const id = clientId.trim();
    const urlSettings = clientUrlSettings(uris);
    const clientSecret = secret?.trim() || generateSecret();
    const payload = {
        clientId: id,
        name: (name || clientId).trim(),
        enabled: enabled !== false && enabled !== '0' && enabled !== 0,
        protocol: 'openid-connect',
        publicClient: false,
        clientAuthenticatorType: 'client-secret',
        secret: clientSecret,
        redirectUris: uris,
        rootUrl: urlSettings.rootUrl,
        baseUrl: urlSettings.baseUrl,
        webOrigins: parseWebOrigins(webOrigins),
        standardFlowEnabled: true,
        directAccessGrantsEnabled: false,
    };

    let reusedExisting = false;
    try {
        await kcRequest('POST', `/realms/${APPS_REALM}/clients`, payload);
    } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        if (!msg.includes('already exists')) throw err;
        reusedExisting = true;
    }

    const found = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/clients?clientId=${encodeURIComponent(id)}`
    );
    if (!found?.[0]) throw new Error(`Cliente ${id} no encontrado en Keycloak tras crearlo`);

    const kcUuid = found[0].id;
    let effectiveSecret = clientSecret;

    if (reusedExisting) {
        await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${kcUuid}`, {
            ...found[0],
            name: payload.name,
            enabled: payload.enabled,
            redirectUris: payload.redirectUris,
            rootUrl: urlSettings.rootUrl,
            baseUrl: urlSettings.baseUrl,
            webOrigins: payload.webOrigins,
            standardFlowEnabled: true,
            publicClient: false,
            directAccessGrantsEnabled: false,
            attributes: {
                ...(found[0].attributes || {}),
                'post.logout.redirect.uris': urlSettings.postLogoutRedirectUris,
            },
        });
        if (secret?.trim()) {
            // Keycloak no permite setear secret arbitrario vía PUT en todos los casos;
            // si el caller mandó uno, regeneramos y devolvemos el nuevo.
            effectiveSecret = await regenerateSecret(kcUuid);
        } else {
            effectiveSecret = await getClientSecret(kcUuid);
        }
    } else {
        const current = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${kcUuid}`);
        await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${kcUuid}`, {
            ...current,
            rootUrl: urlSettings.rootUrl,
            baseUrl: urlSettings.baseUrl,
            attributes: {
                ...(current.attributes || {}),
                'post.logout.redirect.uris': urlSettings.postLogoutRedirectUris,
            },
        });
    }

    await kcAccess.ensureAccessRole(kcUuid);
    await kcEnforcement.ensureClientLoginEnforcement(id);

    const latest = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${kcUuid}`);
    return { ...toPublicClient(latest), secret: effectiveSecret, kc_client_uuid: kcUuid };
}

async function updateClient(internalId, { name, redirectUris, webOrigins, enabled }) {
    const existing = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
    if (!isAppClient(existing)) throw new Error('Cliente no encontrado');

    const uris = parseRedirectUris(redirectUris);
    if (!uris.length) throw new Error('Al menos una Redirect URI es obligatoria');

    const urlSettings = clientUrlSettings(uris);
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${internalId}`, {
        ...existing,
        name: (name || existing.clientId).trim(),
        enabled: enabled !== false && enabled !== '0' && enabled !== 0,
        redirectUris: uris,
        rootUrl: urlSettings.rootUrl,
        baseUrl: urlSettings.baseUrl,
        webOrigins: parseWebOrigins(webOrigins),
        standardFlowEnabled: true,
        attributes: {
            ...(existing.attributes || {}),
            'post.logout.redirect.uris': urlSettings.postLogoutRedirectUris,
        },
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

async function ensureClientHomeUrl(internalId, redirectUris) {
    const existing = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
    if (!isAppClient(existing)) throw new Error('Cliente no encontrado');
    const settings = clientUrlSettings(redirectUris?.length ? redirectUris : existing.redirectUris);
    if (!settings.rootUrl) return existing;
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${internalId}`, {
        ...existing,
        rootUrl: settings.rootUrl,
        baseUrl: settings.baseUrl,
        attributes: {
            ...(existing.attributes || {}),
            'post.logout.redirect.uris': settings.postLogoutRedirectUris,
        },
    });
    return kcRequest('GET', `/realms/${APPS_REALM}/clients/${internalId}`);
}

module.exports = {
    listClients,
    getClientById,
    getClientSecret,
    createClient,
    updateClient,
    deleteClient,
    regenerateSecret,
    deriveAppHomeUrl,
    ensureClientHomeUrl,
};
