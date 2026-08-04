const db = require('../services/db');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_KEYS = /pass|password|secret|token|credential/i;

function sanitize(value, depth = 0) {
    if (depth > 4) return '[omitido]';
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? '[protegido]' : sanitize(item, depth + 1),
    ]));
}

function actionLabel(method, path) {
    if (/\/roles\/[^/]+$/.test(path) && method === 'PUT') return 'Actualizó rol interno';
    if (/\/roles\/[^/]+$/.test(path) && method === 'DELETE') return 'Eliminó rol interno';
    if (/\/roles$/.test(path) && method === 'POST') return 'Agregó rol interno';
    if (/\/users\/[^/]+$/.test(path) && method === 'PUT') return 'Actualizó roles del usuario';
    if (/\/users\/[^/]+$/.test(path) && method === 'DELETE') return 'Quitó acceso a usuario';
    if (/\/users$/.test(path) && method === 'POST') return 'Agregó usuario al sistema';
    if (/regenerate-secret$/.test(path)) return 'Regeneró secreto del cliente';
    if (method === 'POST' && /\/systems\/?$/.test(path)) return 'Creó sistema';
    if (method === 'PUT' && /\/systems\/[^/]+$/.test(path)) return 'Actualizó sistema';
    if (method === 'DELETE' && /\/systems\/[^/]+$/.test(path)) return 'Eliminó sistema';
    return `${method} ${path}`;
}

function auditMiddleware(req, res, next) {
    if (!MUTATING.has(req.method) || !req.session?.appUser) return next();

    let responseBody;
    const originalJson = res.json;
    res.json = function captureJson(body) {
        responseBody = body;
        return originalJson.call(this, body);
    };

    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        const path = (req.originalUrl || req.url).split('?')[0];
        const ids = new Set();
        const pathMatch = path.match(/\/api\/systems\/(\d+)/);
        if (pathMatch) ids.add(Number(pathMatch[1]));
        for (const id of req.body?.sistemas || req.body?.sistema_ids || []) ids.add(Number(id));
        for (const link of req.body?.sistema_links || []) ids.add(Number(link.sistema_id));
        if (responseBody?.sistema?.id) ids.add(Number(responseBody.sistema.id));
        if (responseBody?.id && req.method === 'POST' && /\/api\/systems\/?$/.test(path)) {
            ids.add(Number(responseBody.id));
        }

        for (const sistemaId of ids) {
            if (!Number.isFinite(sistemaId) || sistemaId <= 0) continue;
            db.logAudit({
                sistema_id: sistemaId,
                actor_user: req.session.appUser.user,
                actor_rol: req.session.appUser.rol,
                accion: actionLabel(req.method, path),
                metodo: req.method,
                ruta: path,
                detalle: sanitize(req.body || {}),
                ip: req.ip,
            }).catch((error) => console.error('No se pudo guardar auditoría:', error.message));
        }
    });
    next();
}

module.exports = { auditMiddleware };
