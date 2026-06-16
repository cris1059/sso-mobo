const express = require('express');
const db = require('../../services/db');
const { KC_BASE } = require('../../services/keycloak-admin');
const { isDevelopAdmin } = require('../../middleware/permissions');

const router = express.Router();

async function checkKeycloak() {
    try {
        const res = await fetch(`${KC_BASE}/realms/mobo`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

router.get('/', async (req, res) => {
    try {
        const owner = isDevelopAdmin(req) ? req.session.appUser.user : null;
        const stats = await db.getDashboardStats(owner);
        const keycloakOnline = await checkKeycloak();

        res.json({
            ...stats,
            keycloakOnline,
            scope: owner ? 'own' : 'global',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
