const ROLES = {
    ADMIN: 1,
    USUARIO: 2,
    DEVELOP_ADMIN: 3,
};

function canAccessPanel(rol) {
    const r = Number(rol);
    return r === ROLES.ADMIN || r === ROLES.DEVELOP_ADMIN;
}

function isAdmin(req) {
    return Number(req.session.appUser?.rol) === ROLES.ADMIN;
}

function isDevelopAdmin(req) {
    return Number(req.session.appUser?.rol) === ROLES.DEVELOP_ADMIN;
}

function requirePanelAccess(req, res, next) {
    if (!req.session.userInfo || !req.session.appUser) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    if (!canAccessPanel(req.session.appUser.rol)) {
        return res.status(403).json({ error: 'Sin acceso a la consola' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Solo Admin puede realizar esta accion' });
    }
    next();
}

module.exports = {
    ROLES,
    canAccessPanel,
    isAdmin,
    isDevelopAdmin,
    requirePanelAccess,
    requireAdmin,
};
