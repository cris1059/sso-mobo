const express = require('express');
const db = require('../../services/db');
const kcAccess = require('../../services/keycloak-access');
const { isAdmin } = require('../../middleware/permissions');

const router = express.Router();

async function syncUsersAccess(usernames) {
    if (!usernames?.length) return { synced: 0, errors: [] };

    const allSistemas = await db.listSistemas();
    const rolesBySistemaId = {};
    for (const s of allSistemas) {
        rolesBySistemaId[s.id] = await db.listSistemaRoles(s.id);
    }

    const errors = [];
    let synced = 0;
    const concurrency = 8;
    let idx = 0;

    async function worker() {
        while (idx < usernames.length) {
            const i = idx++;
            const username = usernames[i];
            try {
                const links = await db.getUserSistemas(username);
                await kcAccess.syncUserSistemaAccess(username, links, allSistemas, rolesBySistemaId);
                synced += 1;
            } catch (err) {
                errors.push({ user: username, error: err.message });
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, usernames.length) }, () => worker()));
    return { synced, errors };
}

router.get('/', async (req, res) => {
    try {
        res.json(await db.listPuestos());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const puesto = await db.getPuesto(Number(req.params.id));
        if (!puesto) return res.status(404).json({ error: 'Puesto no encontrado' });
        const sistema_links = await db.getPuestoSistemaLinks(puesto.id);
        res.json({
            ...puesto,
            sistema_links,
            sistema_ids: sistema_links.map((l) => l.sistema_id),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/sistemas', async (req, res) => {
    try {
        if (!isAdmin(req)) {
            return res.status(403).json({ error: 'Solo Admin puede vincular sistemas a puestos' });
        }

        req.setTimeout(15 * 60 * 1000);
        res.setTimeout(15 * 60 * 1000);

        const puestoId = Number(req.params.id);
        const links = req.body.sistema_links?.length
            ? req.body.sistema_links
            : (req.body.sistema_ids || []).map((id) => ({
                sistema_id: Number(id),
                sistema_role_id: null,
            }));

        const applied = await db.setPuestoSistemas(
            puestoId,
            links,
            req.session.appUser.user
        );
        const kc = await syncUsersAccess(applied.usernames);

        res.json({
            ok: true,
            puesto_id: puestoId,
            sistemas: links.length,
            usersAffected: applied.usersAffected,
            linksAdded: applied.added,
            linksRemoved: applied.removed,
            keycloakSynced: kc.synced,
            keycloakErrors: kc.errors.slice(0, 20),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
