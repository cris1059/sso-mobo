const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../services/db');
const kcSync = require('../../services/keycloak-sync');
const kcAccess = require('../../services/keycloak-access');
const { ROLES, isAdmin, isDevelopAdmin } = require('../../middleware/permissions');

const router = express.Router();

function parseUserBody(body, requirePassword, actorRol) {
    const { user, password, name, last_name, email, area, dept, store, division, region, jobD, enabled, rol, PrimerInicio } = body;

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
        division: (division || '').trim(),
        area: (area || '').trim(),
        region: (region || '').trim(),
        store: (store || '').trim(),
        jobD: (jobD || '').trim(),
        dept: (dept || '').trim(),
        enabled: enabled === 0 || enabled === '0' || enabled === false ? 0 : 1,
        rol: rolNum,
        PrimerInicio: PrimerInicio === 0 || PrimerInicio === '0' || PrimerInicio === false ? 0 : 1,
    };
}

async function enrichUser(user) {
    const sistema_ids = await db.getUserSistemaIds(user.user);
    const sistemas = await db.getUserSistemas(user.user);
    const sistema_links = sistemas.map((s) => ({
        sistema_id: s.id,
        sistema_role_id: s.sistema_role_id,
        sistema_role_ids: s.sistema_role_ids || [],
        role_codigo: s.role_codigo,
        role_codigos: s.role_codigos || [],
        role_nombre: s.role_nombre,
        roles: s.roles || [],
        linked_by: s.linked_by,
        from_puesto: s.linked_by === db.PUESTO_LINKED_BY,
    }));
    return { ...user, sistema_ids, sistemas, sistema_links };
}

async function syncUserAccess(username) {
    const links = await db.getUserSistemas(username);
    const allSistemas = await db.listSistemas();
    const rolesBySistemaId = {};
    for (const s of allSistemas) {
        rolesBySistemaId[s.id] = await db.listSistemaRoles(s.id);
    }
    await kcAccess.syncUserSistemaAccess(username, links, allSistemas, rolesBySistemaId);
}

function parseSistemaLinks(body) {
    if (body.sistema_links?.length) {
        return body.sistema_links.map((l) => {
            const sistema_id = Number(l.sistema_id);
            let sistema_role_ids = [];
            if (Array.isArray(l.sistema_role_ids) && l.sistema_role_ids.length) {
                sistema_role_ids = l.sistema_role_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
            } else if (l.sistema_role_id != null && l.sistema_role_id !== '') {
                const n = Number(l.sistema_role_id);
                if (Number.isFinite(n) && n > 0) sistema_role_ids = [n];
            }
            return { sistema_id, sistema_role_ids };
        });
    }
    if (body.sistema_ids?.length) {
        return body.sistema_ids.map((id) => ({ sistema_id: Number(id), sistema_role_ids: [] }));
    }
    return [];
}

router.get('/', async (req, res) => {
    try {
        const users = await db.listUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catálogo orgPuesto (antes de /:user)
router.get('/puestos', async (req, res) => {
    try {
        res.json(await db.listPuestos());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Debe ir ANTES de /:user para no capturar "sync" como username
router.post('/sync/all', async (req, res) => {
    try {
        if (!isAdmin(req)) {
            return res.status(403).json({ error: 'Solo Admin puede sincronizar todo' });
        }
        // Sync largo (miles de usuarios); evita cortes prematuros del socket
        req.setTimeout(15 * 60 * 1000);
        res.setTimeout(15 * 60 * 1000);

        const result = await kcSync.syncAllActiveUsers(db.getActiveUsersForSync);
        const count = typeof result === 'number' ? result : result.synced;
        const syncErrors = typeof result === 'object' ? (result.errors || []) : [];

        const users = await db.getActiveUsersForSync();
        for (const u of users) {
            if (Number(u.PrimerInicio) === 1) {
                try {
                    const completed = await kcSync.refreshPrimerInicioFromKeycloak(u.user);
                    if (completed) await db.clearPrimerInicio(u.user);
                } catch {
                    /* ignore per-user primerInicio refresh */
                }
            }
        }

        const accessCount = await kcAccess.syncAllSistemaAccess(
            db.getAllUserSistemaLinks,
            () => db.listSistemas(),
            (sistemaId) => db.listSistemaRoles(sistemaId)
        );
        const kcEnforcement = require('../../services/keycloak-enforcement');
        const enforced = await kcEnforcement.enforceAllClients(
            () => db.listSistemas(),
            () => db.listRoles()
        );
        res.json({
            ok: true,
            synced: count,
            total: typeof result === 'object' ? result.total : count,
            accessSynced: accessCount,
            enforced,
            errors: syncErrors.slice(0, 20),
            errorCount: syncErrors.length,
        });
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
        await db.createUser({ ...data, pass_hash, PrimerInicio: 1 });
        await kcSync.syncUserToKeycloak({ ...data, PrimerInicio: 1 }, data.password);

        if (req.body.sistema_ids?.length || req.body.sistema_links?.length) {
            const allowed = isDevelopAdmin(req)
                ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
                : null;
            const links = parseSistemaLinks(req.body);
            await db.setUserSistemas(
                data.user,
                links.map((l) => l.sistema_id),
                req.session.appUser.user,
                allowed,
                links
            );
        }
        // Accesos heredados del puesto (además de los manuales)
        await db.applyPuestoSystemsToUser(data.user);
        await syncUserAccess(data.user);

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

        if (req.body.PrimerInicio !== undefined) {
            data.PrimerInicio = req.body.PrimerInicio === 0 || req.body.PrimerInicio === '0' || req.body.PrimerInicio === false ? 0 : 1;
        }

        await db.updateUser(req.params.user, data);
        const updated = await db.getUser(req.params.user);
        await kcSync.syncUserToKeycloak(updated);

        const sistemasTouched = req.body.sistema_ids !== undefined || req.body.sistema_links !== undefined;
        if (sistemasTouched) {
            const allowed = isDevelopAdmin(req)
                ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
                : null;
            const links = parseSistemaLinks(req.body);
            await db.setUserSistemas(
                req.params.user,
                links.map((l) => l.sistema_id),
                req.session.appUser.user,
                allowed,
                links
            );
        }
        const puestoChanged = Number(existing.puesto_id) !== Number(updated.puesto_id);
        if (sistemasTouched || puestoChanged) {
            await db.applyPuestoSystemsToUser(req.params.user);
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
        const links = req.body.sistema_links?.length
            ? parseSistemaLinks(req.body)
            : sistemaIds.map((id) => ({ sistema_id: Number(id), sistema_role_ids: [] }));
        const allowed = isDevelopAdmin(req)
            ? (await db.listSistemas(req.session.appUser.user)).map((s) => s.id)
            : null;

        await db.setUserSistemas(
            req.params.user,
            links.map((l) => l.sistema_id),
            req.session.appUser.user,
            allowed,
            links
        );
        await db.applyPuestoSystemsToUser(req.params.user);
        await syncUserAccess(req.params.user);

        const finalIds = await db.getUserSistemaIds(req.params.user);
        res.json({ ok: true, sistema_ids: finalIds });
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
        const forceFirstLogin = req.body.force_first_login === true || req.body.force_first_login === '1';
        await db.updatePassword(req.params.user, pass_hash, { clearPrimerInicio: !forceFirstLogin });
        if (forceFirstLogin) await db.setPrimerInicio(req.params.user, true);
        await kcSync.setPasswordForUser(req.params.user, req.body.password, existing.rol, {
            primerInicio: forceFirstLogin || Number(existing.PrimerInicio) === 1,
        });
        if (!forceFirstLogin) {
            const completed = await kcSync.refreshPrimerInicioFromKeycloak(req.params.user);
            if (completed && Number(existing.PrimerInicio) === 1) {
                await db.clearPrimerInicio(req.params.user);
            }
        }

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

module.exports = router;
