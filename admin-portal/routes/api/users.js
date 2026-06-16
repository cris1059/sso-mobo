const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../services/db');
const kcSync = require('../../services/keycloak-sync');
const kcAccess = require('../../services/keycloak-access');
const { ROLES, isAdmin, isDevelopAdmin } = require('../../middleware/permissions');

const router = express.Router();

function parseUserBody(body, requirePassword, actorRol) {
    const { user, password, name, last_name, email, area, dept, store, enabled, rol } = body;

    if (!user?.trim()) throw new Error('El usuario es obligatorio');
    if (requirePassword && !password) throw new Error('La contraseña es obligatoria');
    if (!name?.trim()) throw new Error('El nombre es obligatorio');
    if (!last_name?.trim()) throw new Error('El apellido es obligatorio');
    if (!email?.trim()) throw new Error('El correo es obligatorio');

    let rolNum = Number(rol);
    if (actorRol === ROLES.DEVELOP_ADMIN) {
        rolNum = ROLES.USUARIO;
    } else if (![ROLES.ADMIN, ROLES.USUARIO, ROLES.DEVELOP_ADMIN].includes(rolNum)) {
        throw new Error('Rol invalido');
    }

    return {
        user: user.trim(),
        password,
        name: name.trim(),
        last_name: last_name.trim(),
        email: email.trim(),
        area: (area || '').trim(),
        dept: (dept || '').trim(),
        store: (store || '').trim(),
        enabled: enabled === 0 || enabled === '0' || enabled === false ? 0 : 1,
        rol: rolNum,
    };
}

async function enrichUser(user) {
    const sistema_ids = await db.getUserSistemaIds(user.user);
    const sistemas = await db.getUserSistemas(user.user);
    return { ...user, sistema_ids, sistemas };
}

async function syncUserAccess(username) {
    const links = await db.getUserSistemas(username);
    const allSistemas = await db.listSistemas();
    await kcAccess.syncUserSistemaAccess(
        username,
        links.map((l) => l.client_id),
        allSistemas.map((s) => s.client_id)
    );
}

router.get('/', async (req, res) => {
    try {
        const users = await db.listUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:user', async (req, res) => {
    try {
        const user = await db.getUser(req.params.user);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(await enrichUser(user));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const actorRol = req.session.appUser.rol;
        const data = parseUserBody(req.body, true, actorRol);
        if (await db.userExists(data.user)) {
            return res.status(409).json({ error: 'El usuario ya existe' });
        }

        const pass_hash = await bcrypt.hash(data.password, 10);
        await db.createUser({ ...data, pass_hash });
        await kcSync.syncUserToKeycloak(data, data.password);

        if (req.body.sistema_ids?.length) {
            const allowed = isDevelopAdmin(req)
                ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
                : null;
            await db.setUserSistemas(
                data.user,
                req.body.sistema_ids,
                req.session.appUser.user,
                allowed
            );
            await syncUserAccess(data.user);
        }

        res.status(201).json({ ok: true, user: data.user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:user', async (req, res) => {
    try {
        const existing = await db.getUser(req.params.user);
        if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

        const actorRol = req.session.appUser.rol;
        const data = parseUserBody({ ...req.body, user: req.params.user }, false, actorRol);

        if (!isAdmin(req) && existing.rol !== ROLES.USUARIO) {
            return res.status(403).json({ error: 'No puedes editar este usuario' });
        }
        if (!isAdmin(req)) {
            data.rol = ROLES.USUARIO;
        }

        await db.updateUser(req.params.user, data);
        await kcSync.syncUserToKeycloak({ user: req.params.user, ...data });

        if (req.body.sistema_ids !== undefined) {
            const allowed = isDevelopAdmin(req)
                ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
                : null;
            await db.setUserSistemas(
                req.params.user,
                req.body.sistema_ids,
                req.session.appUser.user,
                allowed
            );
            await syncUserAccess(req.params.user);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:user/sistemas', async (req, res) => {
    try {
        const existing = await db.getUser(req.params.user);
        if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

        const sistemaIds = req.body.sistema_ids || [];
        const allowed = isDevelopAdmin(req)
            ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
            : null;

        await db.setUserSistemas(
            req.params.user,
            sistemaIds,
            req.session.appUser.user,
            allowed
        );
        await syncUserAccess(req.params.user);

        res.json({ ok: true, sistema_ids: sistemaIds.map(Number) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:user/password', async (req, res) => {
    try {
        const existing = await db.getUser(req.params.user);
        if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!req.body.password) return res.status(400).json({ error: 'La contraseña es obligatoria' });

        const pass_hash = await bcrypt.hash(req.body.password, 10);
        await db.updatePassword(req.params.user, pass_hash);
        await kcSync.setPasswordForUser(req.params.user, req.body.password, existing.rol);

        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:user', async (req, res) => {
    try {
        if (req.params.user === 'admin') {
            return res.status(403).json({ error: 'No se puede eliminar el usuario admin' });
        }
        const existing = await db.getUser(req.params.user);
        if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!isAdmin(req) && existing.rol !== ROLES.USUARIO) {
            return res.status(403).json({ error: 'No puedes eliminar este usuario' });
        }

        await db.deleteUser(req.params.user);
        await kcSync.syncAllActiveUsers(db.getActiveUsersForSync);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sync/all', async (req, res) => {
    try {
        if (!isAdmin(req)) {
            return res.status(403).json({ error: 'Solo Admin puede sincronizar todo' });
        }
        const count = await kcSync.syncAllActiveUsers(db.getActiveUsersForSync);
        const accessCount = await kcAccess.syncAllSistemaAccess(
            db.getAllUserSistemaLinks,
            () => db.listSistemas()
        );
        const kcEnforcement = require('../../services/keycloak-enforcement');
        const enforced = await kcEnforcement.enforceAllClients(() => db.listSistemas());
        res.json({ ok: true, synced: count, accessSynced: accessCount, enforced });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
