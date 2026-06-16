const { canAccessPanel } = require('./permissions');

function requireAuth(req, res, next) {
    const isApi = req.originalUrl.startsWith('/api/');

    if (!req.session.userInfo || !req.session.appUser) {
        if (isApi) return res.status(401).json({ error: 'No autenticado' });
        return res.redirect('/login');
    }

    if (!canAccessPanel(req.session.appUser.rol)) {
        if (isApi) return res.status(403).json({ error: 'Sin acceso a la consola' });
        return res.status(403).send('No tienes acceso a la consola de administración.');
    }

    next();
}

module.exports = { requireAuth };
