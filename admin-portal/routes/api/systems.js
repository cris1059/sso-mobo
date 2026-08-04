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
            require_2fa: req.body.require_2fa === true || req.body.require_2fa === '1' || req.body.require_2fa === 1 ? 1 : 0,
        });

        const kcEnforcement = require('../../services/keycloak-enforcement');
        await kcEnforcement.ensureClientLoginEnforcement(sistema.client_id, {
            require2fa: Number(sistema.require_2fa) === 1,
            rolesRequiring2fa: (await db.listRoles()).filter((r) => Number(r.require_2fa) === 1),
        });

        const roles = await db.seedDefaultSistemaRoles(sistema.id);
        await kcAccess.ensureSistemaRolesInKeycloak(
            sistema.client_id,
            roles.map((r) => r.codigo)
        );

        res.status(201).json({ ...sistema, secret: kcCreated.secret, roles });
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
        const require2fa = req.body.require_2fa === true || req.body.require_2fa === '1' || req.body.require_2fa === 1 ? 1 : 0;
        const updated = await db.updateSistema(sistema.id, {
            nombre: req.body.name || sistema.nombre,
            redirectUris: typeof req.body.redirectUris === 'string'
                ? req.body.redirectUris.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean)
                : req.body.redirectUris,
            web_origins: req.body.webOrigins || sistema.web_origins,
            enabled: req.body.enabled === 0 || req.body.enabled === '0' ? 0 : 1,
            require_2fa: require2fa,
        });

        const kcEnforcement = require('../../services/keycloak-enforcement');
        await kcEnforcement.ensureClientLoginEnforcement(updated.client_id, {
            require2fa: Number(updated.require_2fa) === 1,
            rolesRequiring2fa: (await db.listRoles()).filter((r) => Number(r.require_2fa) === 1),
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

// ── Roles internos del sistema ──

router.get('/:id/roles', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const roles = await db.listSistemaRoles(sistema.id);
        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/roles', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const { codigo, nombre, descripcion, is_default } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
        if (!codigo?.trim()) return res.status(400).json({ error: 'El código es obligatorio' });

        const role = await db.createSistemaRole({
            sistema_id: sistema.id,
            codigo,
            nombre,
            descripcion,
            is_default: is_default === true || is_default === '1' || is_default === 1,
            require_2fa: req.body.require_2fa === true || req.body.require_2fa === '1' || req.body.require_2fa === 1,
        });
        await kcAccess.ensureSistemaRolesInKeycloak(sistema.client_id, [role.codigo]);
        res.status(201).json(role);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id/roles/:roleId', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const existing = await db.getSistemaRole(req.params.roleId);
        if (!existing || existing.sistema_id !== sistema.id) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }
        const role = await db.updateSistemaRole(req.params.roleId, {
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            is_default: req.body.is_default,
            require_2fa: req.body.require_2fa === undefined
                ? undefined
                : (req.body.require_2fa === true || req.body.require_2fa === '1' || req.body.require_2fa === 1),
        });
        if (req.body.require_2fa !== undefined) {
            const users = await db.getSistemaUserLinks(sistema.id);
            for (const user of users) {
                await syncUserAccess(user.user);
            }
        }
        res.json(role);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id/roles/:roleId', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const existing = await db.getSistemaRole(req.params.roleId);
        if (!existing || existing.sistema_id !== sistema.id) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }
        await db.deleteSistemaRole(req.params.roleId);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── Usuarios con acceso al sistema ──

async function syncUserAccess(username) {
    const links = await db.getUserSistemas(username);
    const allSistemas = await db.listSistemas();
    const rolesBySistemaId = {};
    for (const s of allSistemas) {
        rolesBySistemaId[s.id] = await db.listSistemaRoles(s.id);
    }
    await kcAccess.syncUserSistemaAccess(username, links, allSistemas, rolesBySistemaId);
}

router.get('/:id/users/search', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const users = await db.searchUsersForSistema(sistema.id, req.query.q || '', 30);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/users', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(Number.parseInt(req.query.page_size, 10) || 20, 5), 100);
        const result = await db.listSistemaUsers(sistema.id, page, pageSize, req.query.q || '');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/users', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        const username = req.body.user?.trim();
        if (!username) return res.status(400).json({ error: 'El usuario es obligatorio' });
        const user = await db.getUser(username);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado en userSSO' });
        if (!Number(user.enabled)) {
            return res.status(400).json({ error: 'El usuario está bloqueado' });
        }

        await db.addUserToSistema(
            username,
            sistema.id,
            req.body.sistema_role_id,
            req.session.appUser.user,
            req.body.sistema_role_ids
        );
        await syncUserAccess(username);
        res.status(201).json({ ok: true, user: username });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id/users/:username', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        await db.updateUserSistemaRole(
            req.params.username,
            sistema.id,
            req.body.sistema_role_id,
            req.body.sistema_role_ids
        );
        await syncUserAccess(req.params.username);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id/users/:username', async (req, res) => {
    try {
        const sistema = await db.getSistema(req.params.id);
        if (!sistema) return res.status(404).json({ error: 'Sistema no encontrado' });
        if (!canManageSistema(req, sistema)) {
            return res.status(403).json({ error: 'Sin acceso a este sistema' });
        }
        await db.removeUserFromSistema(req.params.username, sistema.id);
        await syncUserAccess(req.params.username);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
