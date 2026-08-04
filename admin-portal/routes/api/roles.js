const express = require('express');
const db = require('../../services/db');
const kcEnforcement = require('../../services/keycloak-enforcement');
const { isAdmin } = require('../../middleware/permissions');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const roles = await db.listRoles();
        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/2fa', async (req, res) => {
    try {
        if (!isAdmin(req)) {
            return res.status(403).json({ error: 'Solo Admin puede configurar 2FA por rol' });
        }
        const roleId = Number(req.params.id);
        const require2fa = req.body.require_2fa === true || req.body.require_2fa === '1' || req.body.require_2fa === 1;
        await db.updateRole2fa(roleId, require2fa);
        await kcEnforcement.enforceAllClients(() => db.listSistemas(), () => db.listRoles());
        res.json({ ok: true, id: roleId, require_2fa: require2fa ? 1 : 0 });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
