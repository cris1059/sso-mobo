const express = require('express');
const db = require('../../services/db');
const kcClients = require('../../services/keycloak-clients');
const kcAccess = require('../../services/keycloak-access');
const { isAdmin, isDevelopAdmin } = require('../../middleware/permissions');

const router = express.Router();

function canManageSistema(req, sistema) {
    if (isAdmin(req)) return true;
    if (isDevelopAdmin(req) && sistema.owner === req.session.appUser.user) return true;
    return false;
}

router.get('/', async (req, res) => {
    try {
        const owner = isDevelopAdmin(req) ? req.session.appUser.user : null;
        const sistemas = await db.listSistemas(owner);
        res.json(sistemas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        res.json(sistema);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

router.get('/:id/secret', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        if (!sistema.kc_client_uuid) {
            const uuid = await kcAccess.getClientUuid(sistema.client_id);
            if (uuid) await db.updateSistema(sistema.id, { kc_client_uuid: uuid });
            sistema.kc_client_uuid = uuid;
        }
        const secret = await kcClients.getClientSecret(sistema.kc_client_uuid);
        res.json({ secret });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const owner = isDevelopAdmin(req) ? req.session.appUser.user : (req.body.owner || null);
        const existing = await db.getSistemaByClientId(req.body.clientId?.trim());
        if (existing) return res.status(409).json({ error: 'El client_id ya existe' });

        const kcCreated = await kcClients.createClient(req.body);
        const sistema = await db.createSistema({
            client_id: req.body.clientId.trim(),
            nombre: req.body.name || req.body.clientId.trim(),
            owner: isAdmin(req) ? (req.body.owner || null) : owner,
            redirectUris: kcCreated.redirectUris,
            web_origins: (kcCreated.webOrigins || ['+']).join(', '),
            kc_client_uuid: kcCreated.kc_client_uuid,
            enabled: kcCreated.enabled ? 1 : 0,
        });

        res.status(201).json({ ...sistema, secret: kcCreated.secret });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }

        if (!sistema.kc_client_uuid) {
            const uuid = await kcAccess.getClientUuid(sistema.client_id);
            if (uuid) await db.updateSistema(sistema.id, { kc_client_uuid: uuid });
            sistema.kc_client_uuid = uuid;
        }

        await kcClients.updateClient(sistema.kc_client_uuid, req.body);
        const updated = await db.updateSistema(sistema.id, {
            nombre: req.body.name || sistema.nombre,
            redirectUris: typeof req.body.redirectUris === 'string'
                ? req.body.redirectUris.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean)
                : req.body.redirectUris,
            web_origins: req.body.webOrigins || sistema.web_origins,
            enabled: req.body.enabled === 0 || req.body.enabled === '0' ? 0 : 1,
        });

        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/:id/regenerate-secret', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        if (!sistema.kc_client_uuid) {
            return res.status(400).json({ error: 'Cliente no vinculado en Keycloak' });
        }
        const secret = await kcClients.regenerateSecret(sistema.kc_client_uuid);
        res.json({ secret });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        if (sistema.kc_client_uuid) {
            await kcClients.deleteClient(sistema.kc_client_uuid);
        }
        await db.deleteSistema(sistema.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
