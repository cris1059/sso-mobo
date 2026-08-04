const KC_BASE = process.env.KC_BASE_URL || 'http://localhost:8080';
const KC_ADMIN = process.env.KC_ADMIN || 'admin';
const KC_ADMIN_PASS = process.env.KC_ADMIN_PASS || 'admin';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAdminToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    const res = await fetch(`${KC_BASE}/realms/master/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: KC_ADMIN,
            password: KC_ADMIN_PASS,
        }),
    });

    if (!res.ok) throw new Error('No se pudo autenticar con Keycloak Admin API');
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;
    return cachedToken;
}

async function kcRequest(method, path, body) {
    const token = await getAdminToken();
    const res = await fetch(`${KC_BASE}/admin${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204 || res.status === 201) return null;

    const text = await res.text();
    if (!res.ok) {
        let msg = text;
        try {
            const parsed = JSON.parse(text);
            msg = parsed.errorMessage || parsed.error_description || parsed.error || text;
        } catch { /* ignore */ }
        throw new Error(msg || `Keycloak error ${res.status}`);
    }

    return text ? JSON.parse(text) : null;
}

module.exports = { KC_BASE, KC_ADMIN, kcRequest, getAdminToken };
