const { verifyApiToken, extractBearer } = require('../services/api-tokens');
const { canUseSeed } = require('./permissions');

/**
 * Exige Authorization: Bearer <token> (o X-API-Token) emitido por POST /api/seed/login.
 * Admin (rol=1) y DevelopAdmin (rol=3) pueden usar seeders.
 */
function requireSeedToken(req, res, next) {
    const raw = extractBearer(req);
    if (!raw) {
        return res.status(401).json({
            error: 'Falta token. Primero POST /api/seed/login y envía Authorization: Bearer <token>',
        });
    }

    const result = verifyApiToken(raw);
    if (!result.ok) {
        return res.status(401).json({ error: result.error });
    }

    if (!canUseSeed(result.payload.rol)) {
        return res.status(403).json({
            error: 'Solo Admin o DevelopAdmin pueden usar los endpoints de seed',
        });
    }

    req.seedUser = {
        user: result.payload.sub,
        rol: Number(result.payload.rol),
        rol_nombre: result.payload.rol_nombre,
    };
    next();
}

module.exports = { requireSeedToken };
