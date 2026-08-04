const crypto = require('crypto');

const DEFAULT_TTL_SEC = Number(process.env.SEED_TOKEN_TTL_SEC) || 3600;

function getSecret() {
    const secret = process.env.SESSION_SECRET || process.env.SEED_TOKEN_SECRET;
    if (!secret || secret === 'fallback-secret' || secret === 'cambia-este-secreto-en-produccion') {
        // Still works in local, but warn via caller if needed
    }
    return secret || 'fallback-secret';
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function createApiToken(user, { ttlSec = DEFAULT_TTL_SEC, typ = 'seed' } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: user.user,
        rol: Number(user.rol),
        rol_nombre: user.rol_nombre || null,
        iat: now,
        exp: now + ttlSec,
        typ,
    };
    if (user.client_id) payload.client_id = user.client_id;
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    return {
        token: `${body}.${sig}`,
        expires_in: ttlSec,
        expires_at: new Date((now + ttlSec) * 1000).toISOString(),
        payload,
    };
}

function verifyApiToken(token, { allowedTypes = ['seed'] } = {}) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return { ok: false, error: 'Token inválido' };
    }
    const [body, sig] = token.split('.');
    if (!body || !sig) return { ok: false, error: 'Token inválido' };

    const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { ok: false, error: 'Firma de token inválida' };
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return { ok: false, error: 'Payload de token inválido' };
    }

    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    if (!types.includes(payload.typ)) return { ok: false, error: 'Tipo de token no permitido' };
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return { ok: false, error: 'Token expirado' };
    if (!payload.sub) return { ok: false, error: 'Token sin usuario' };

    return { ok: true, payload };
}

function extractBearer(req) {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    if (req.headers['x-api-token']) return String(req.headers['x-api-token']).trim();
    return null;
}

module.exports = {
    createApiToken,
    verifyApiToken,
    extractBearer,
    DEFAULT_TTL_SEC,
};
