const { canAccessPanel } = require('./permissions');

const BASE_PATH = (process.env.BASE_PATH || process.env.ADMIN_BASE_PATH || '').replace(/\/$/, '');

function withBase(p) {
    if (!p.startsWith('/')) return `${BASE_PATH}/${p}`;
    return `${BASE_PATH}${p}`;
}

function requireAuth(req, res, next) {
    const pathOnly = (req.originalUrl || '').split('?')[0];
    const isApi = pathOnly === `${BASE_PATH}/api` || pathOnly.startsWith(`${BASE_PATH}/api/`)
        || pathOnly.startsWith('/api/');

    if (!req.session.userInfo || !req.session.appUser) {
        if (isApi) return res.status(401).json({ error: 'No autenticado' });
        return res.redirect(withBase('/login'));
    }

    if (!canAccessPanel(req.session.appUser.rol)) {
        if (isApi) return res.status(403).json({ error: 'Sin acceso a la consola' });
        return res.status(403).send('No tienes acceso a la consola de administración.');
    }

    next();
}

module.exports = { requireAuth };
