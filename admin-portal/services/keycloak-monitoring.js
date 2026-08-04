const { kcRequest } = require('./keycloak-admin');

const REALM = process.env.KC_REALM || 'mobo';

async function resolveClientUuid(sistema) {
    if (sistema.kc_client_uuid) return sistema.kc_client_uuid;
    const clients = await kcRequest(
        'GET',
        `/realms/${REALM}/clients?clientId=${encodeURIComponent(sistema.client_id)}`
    );
    return clients?.[0]?.id || null;
}

async function listActiveSessions(sistema) {
    const clientUuid = await resolveClientUuid(sistema);
    if (!clientUuid) return [];
    const sessions = await kcRequest(
        'GET',
        `/realms/${REALM}/clients/${clientUuid}/user-sessions?first=0&max=500`
    );
    return (sessions || []).map((session) => ({
        id: session.id,
        user_id: session.userId,
        username: session.username,
        ip: session.ipAddress,
        inicio: session.start,
        ultima_actividad: session.lastAccess,
        remember_me: Boolean(session.rememberMe),
    }));
}

module.exports = { listActiveSessions };
