const express = require('express');
const db = require('../../services/db');
const keycloakMonitoring = require('../../services/keycloak-monitoring');
const { requireAdmin } = require('../../middleware/permissions');

const router = express.Router();
router.use(requireAdmin);

router.get('/systems', async (_req, res) => {
    try {
        res.json(await db.listSistemas());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/systems/:id', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        const [sessions, audit] = await Promise.all([
            keycloakMonitoring.listActiveSessions(sistema),
            db.listAudit(sistema.id, req.query.limit),
        ]);
        res.json({ sistema, sessions, audit, generated_at: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
