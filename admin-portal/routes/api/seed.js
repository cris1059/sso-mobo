const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../services/db');
const kcAccess = require('../../services/keycloak-access');
const { createApiToken } = require('../../services/api-tokens');
const { requireSeedToken } = require('../../middleware/seed-auth');
const { ROLES, canUseSeed } = require('../../middleware/permissions');

const router = express.Router();

function isSeedAdmin(seedUser) {
    return Number(seedUser?.rol) === ROLES.ADMIN;
}

function isSeedDevelopAdmin(seedUser) {
    return Number(seedUser?.rol) === ROLES.DEVELOP_ADMIN;
}

/** DevelopAdmin solo opera sobre sistemas de los que es owner. */
async function assertCanManageSistema(seedUser, sistema) {
    if (isSeedAdmin(seedUser)) return;
    if (isSeedDevelopAdmin(seedUser) && sistema.owner === seedUser.user) return;
    throw new Error(`Sin permiso sobre el sistema ${sistema.client_id || sistema.id}`);
}

async function syncUsersAccess(usernames) {
    if (!usernames?.length) return { synced: 0, errors: [] };

    const unique = [...new Set(usernames)];
    const allSistemas = await db.listSistemas();
    const rolesBySistemaId = {};
    for (const s of allSistemas) {
        rolesBySistemaId[s.id] = await db.listSistemaRoles(s.id);
    }

    const errors = [];
    let synced = 0;
    let idx = 0;
    const concurrency = 8;

    async function worker() {
        while (idx < unique.length) {
            const i = idx++;
            const username = unique[i];
            try {
                const links = await db.getUserSistemas(username);
                await kcAccess.syncUserSistemaAccess(username, links, allSistemas, rolesBySistemaId);
                synced += 1;
            } catch (err) {
                errors.push({ user: username, error: err.message });
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
    return { synced, errors };
}

async function resolveSistemaRef(ref) {
    if (ref == null || typeof ref !== 'object') {
        throw new Error('Cada sistema debe ser un objeto { sistema_id|client_id, role_codigo(s)|sistema_role_id(s) }');
    }

    let sistema = null;
    if (ref.sistema_id != null) {
        sistema = await db.getSistema(Number(ref.sistema_id));
    } else if (ref.client_id) {
        sistema = await db.getSistemaByClientId(String(ref.client_id).trim());
    }
    if (!sistema) {
        throw new Error(`Sistema no encontrado (${ref.sistema_id || ref.client_id || '?'})`);
    }

    const roles = await db.listSistemaRoles(sistema.id);
    const byCodigo = new Map(roles.map((r) => [r.codigo, r]));
    const byId = new Map(roles.map((r) => [Number(r.id), r]));

    const sistema_role_ids = [];
    const pushId = (id) => {
        const n = Number(id);
        if (Number.isFinite(n) && byId.has(n) && !sistema_role_ids.includes(n)) {
            sistema_role_ids.push(n);
        }
    };
    const pushCodigo = (codigo) => {
        const match = byCodigo.get(String(codigo).trim());
        if (!match) {
            throw new Error(
                `Rol "${codigo}" no existe en sistema ${sistema.client_id}. Roles: ${roles.map((r) => r.codigo).join(', ') || '(ninguno)'}`
            );
        }
        pushId(match.id);
    };

    if (Array.isArray(ref.sistema_role_ids)) ref.sistema_role_ids.forEach(pushId);
    if (ref.sistema_role_id != null) pushId(ref.sistema_role_id);
    if (Array.isArray(ref.role_codigos)) ref.role_codigos.forEach(pushCodigo);
    if (ref.role_codigo) pushCodigo(ref.role_codigo);

    return {
        sistema_id: sistema.id,
        sistema_role_ids,
        sistema_role_id: sistema_role_ids[0] || null,
        client_id: sistema.client_id,
    };
}

async function resolvePuestoRef(item) {
    if (item.puesto_id != null) {
        const puesto = await db.getPuesto(Number(item.puesto_id));
        if (!puesto) throw new Error(`Puesto id=${item.puesto_id} no encontrado`);
        return puesto;
    }
    if (item.puesto) {
        const puesto = await db.getPuestoByNombre(item.puesto);
        if (!puesto) throw new Error(`Puesto "${item.puesto}" no encontrado`);
        return puesto;
    }
    throw new Error('Indica puesto_id o puesto (nombre)');
}

const PRIMARY_ROLE_PRIORITY = ['admin', 'usuario', 'consulta'];

function pickPrimaryRole(internalRoles) {
    if (!internalRoles?.length) return null;
    for (const code of PRIMARY_ROLE_PRIORITY) {
        if (internalRoles.includes(code)) return code;
    }
    return internalRoles[0];
}

/**
 * Misma forma que KeycloakSSO::handleCallback() en PHP.
 */
async function buildUsuarioSsoSession(username, clientId) {
    const user = await db.getUser(username);
    if (!user) throw new Error('Usuario no encontrado');

    const sistema = await db.getSistemaByClientId(String(clientId).trim());
    if (!sistema) throw new Error(`Sistema no encontrado (${clientId})`);

    const links = await db.getUserSistemas(username);
    const link = links.find((l) => Number(l.id) === Number(sistema.id) || l.client_id === sistema.client_id);

    const internalRoles = link
        ? (link.role_codigos || link.roles?.map((r) => r.codigo) || []).filter(Boolean)
        : [];
    const hasAccess = Boolean(link);
    const clientRoles = hasAccess ? ['access', ...internalRoles] : [];
    const realmRoles = user.rol_nombre ? [user.rol_nombre] : [];

    return {
        username: user.user,
        email: user.email || '',
        nombre: `${user.name || ''} ${user.last_name || ''}`.trim(),
        roles: realmRoles,
        client_roles: clientRoles,
        internal_roles: internalRoles,
        primary_role: pickPrimaryRole(internalRoles),
        has_access: hasAccess,
        client_id: sistema.client_id,
        sistema_id: sistema.id,
        sistema_nombre: sistema.nombre,
    };
}

// ── Login (público) ──

router.post('/login', async (req, res) => {
    try {
        const user = String(req.body.user || req.body.username || '').trim();
        const password = req.body.password;
        if (!user || !password) {
            return res.status(400).json({ error: 'Se requieren user y password' });
        }

        const creds = await db.getUserCredentials(user);
        if (!creds || !Number(creds.enabled)) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const ok = await bcrypt.compare(String(password), creds.pass_hash || '');
        if (!ok) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (!canUseSeed(creds.rol)) {
            return res.status(403).json({
                error: 'Solo Admin o DevelopAdmin pueden obtener token para seeders',
            });
        }

        const issued = createApiToken(creds);
        res.json({
            token: issued.token,
            token_type: 'Bearer',
            expires_in: issued.expires_in,
            expires_at: issued.expires_at,
            user: creds.user,
            rol: creds.rol,
            rol_nombre: creds.rol_nombre,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Login de usuario normal (chatbots / integraciones).
 * Devuelve el mismo JSON de sesión SSO que el callback OIDC + token Bearer corto.
 *
 * POST /api/seed/usuario/login
 * { "user": "10001", "password": "...", "client_id": "mi-reportes" }
 */
router.post('/usuario/login', async (req, res) => {
    try {
        const user = String(req.body.user || req.body.username || '').trim();
        const password = req.body.password;
        const clientId = String(req.body.client_id || req.body.sistema || '').trim();

        if (!user || !password) {
            return res.status(400).json({ error: 'Se requieren user y password' });
        }
        if (!clientId) {
            return res.status(400).json({
                error: 'Se requiere client_id del sistema (ej. mobonet) para calcular has_access y roles',
            });
        }

        const creds = await db.getUserCredentials(user);
        if (!creds || !Number(creds.enabled)) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const ok = await bcrypt.compare(String(password), creds.pass_hash || '');
        if (!ok) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const session = await buildUsuarioSsoSession(user, clientId);
        const ttlSec = Number(process.env.USER_SESSION_TOKEN_TTL_SEC) || 3600;
        const issued = createApiToken(
            {
                user: creds.user,
                rol: creds.rol,
                rol_nombre: creds.rol_nombre,
                client_id: clientId,
            },
            { ttlSec, typ: 'user' }
        );

        res.json({
            ...session,
            token: issued.token,
            token_type: 'Bearer',
            expires_in: issued.expires_in,
            expires_at: issued.expires_at,
        });
    } catch (err) {
        const status = /no encontrado/i.test(err.message) ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
});

/**
 * Relee la sesión SSO de un usuario con token typ=user (chatbots).
 * GET /api/seed/usuario/me?client_id=mi-reportes
 * Authorization: Bearer <token de /usuario/login>
 */
router.get('/usuario/me', async (req, res) => {
    try {
        const { verifyApiToken, extractBearer } = require('../../services/api-tokens');
        const raw = extractBearer(req);
        if (!raw) {
            return res.status(401).json({ error: 'Falta Bearer token de /api/seed/usuario/login' });
        }
        const result = verifyApiToken(raw, { allowedTypes: ['user'] });
        if (!result.ok) {
            return res.status(401).json({ error: result.error });
        }

        const clientId = String(
            req.query.client_id || result.payload.client_id || ''
        ).trim();
        if (!clientId) {
            return res.status(400).json({ error: 'Se requiere client_id' });
        }

        const session = await buildUsuarioSsoSession(result.payload.sub, clientId);
        res.json(session);
    } catch (err) {
        const status = /no encontrado/i.test(err.message) ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
});

// ── Rutas protegidas por Bearer token ──

router.use(requireSeedToken);

router.get('/catalog', async (req, res) => {
    try {
        const [puestos, sistemas, rolesSso] = await Promise.all([
            db.listPuestos(),
            isSeedDevelopAdmin(req.seedUser)
                ? db.listSistemas(req.seedUser.user)
                : db.listSistemas(),
            db.listRoles(),
        ]);

        const sistemasDetail = [];
        for (const s of sistemas) {
            const roles = await db.listSistemaRoles(s.id);
            sistemasDetail.push({
                id: s.id,
                client_id: s.client_id,
                nombre: s.nombre,
                enabled: s.enabled,
                owner: s.owner || null,
                roles: roles.map((r) => ({
                    id: r.id,
                    codigo: r.codigo,
                    nombre: r.nombre,
                    is_default: !!r.is_default,
                })),
            });
        }

        res.json({
            modelo: {
                preferido: 'roles por puesto (orgPuesto_sistema → hereda a usuarios del puesto)',
                override: 'roles por usuario (userSSO_sistema con linked_by distinto de "puesto")',
                sistema_usuarios: 'varios roles internos por usuario en un sistema (userSSO_sistema_role)',
            },
            actor: {
                user: req.seedUser.user,
                rol: req.seedUser.rol,
                rol_nombre: req.seedUser.rol_nombre,
                alcance: isSeedDevelopAdmin(req.seedUser) ? 'sistemas_propios' : 'global',
            },
            roles_sso: rolesSso,
            puestos,
            sistemas: sistemasDetail,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Asigna roles/sistemas a puestos (masivo).
 * Body:
 * {
 *   "sync_keycloak": true,
 *   "items": [
 *     { "puesto": "Gerente", "sistemas": [{ "client_id": "mobonet", "role_codigo": "admin" }] },
 *     { "puesto_id": 3, "sistemas": [{ "sistema_id": 1, "sistema_role_id": 2 }] }
 *   ]
 * }
 */
router.post('/puestos/roles', async (req, res) => {
    try {
        if (!isSeedAdmin(req.seedUser)) {
            return res.status(403).json({
                error: 'Solo Admin puede sembrar roles por puesto. DevelopAdmin usa /api/seed/sistemas/usuarios',
            });
        }
        req.setTimeout(20 * 60 * 1000);
        res.setTimeout(20 * 60 * 1000);

        const items = req.body.items;
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: 'items[] es requerido' });
        }

        const syncKc = req.body.sync_keycloak !== false;
        const results = [];
        const allUsers = [];

        for (const item of items) {
            const puesto = await resolvePuestoRef(item);
            const sistemasIn = item.sistemas || item.sistema_links || [];
            if (!Array.isArray(sistemasIn)) {
                throw new Error(`sistemas debe ser array (puesto ${puesto.nombre})`);
            }

            const links = [];
            for (const ref of sistemasIn) {
                links.push(await resolveSistemaRef(ref));
            }

            const applied = await db.setPuestoSistemas(puesto.id, links, req.seedUser.user);
            allUsers.push(...applied.usernames);
            results.push({
                puesto_id: puesto.id,
                puesto: puesto.nombre,
                sistemas: links.length,
                usersAffected: applied.usersAffected,
                linksAdded: applied.added,
                linksRemoved: applied.removed,
            });
        }

        let keycloak = { synced: 0, errors: [] };
        if (syncKc) keycloak = await syncUsersAccess(allUsers);

        res.json({
            ok: true,
            mode: 'puesto',
            processed: results.length,
            results,
            keycloakSynced: keycloak.synced,
            keycloakErrors: keycloak.errors.slice(0, 50),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Asigna roles/sistemas a usuarios (override por persona).
 * Body:
 * {
 *   "mode": "merge" | "replace",   // merge (default) = upsert override; replace = reemplaza manuales y reaplica puesto
 *   "sync_keycloak": true,
 *   "items": [
 *     { "user": "10001", "sistemas": [{ "client_id": "mobonet", "role_codigos": ["admin", "consulta"] }] }
 *   ]
 * }
 */
router.post('/usuarios/roles', async (req, res) => {
    try {
        req.setTimeout(20 * 60 * 1000);
        res.setTimeout(20 * 60 * 1000);

        const items = req.body.items;
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: 'items[] es requerido' });
        }

        const mode = (req.body.mode || 'merge').toLowerCase();
        if (!['merge', 'replace'].includes(mode)) {
            return res.status(400).json({ error: 'mode debe ser merge o replace' });
        }

        const syncKc = req.body.sync_keycloak !== false;
        const results = [];
        const allUsers = [];

        for (const item of items) {
            const username = String(item.user || item.username || '').trim();
            if (!username) throw new Error('Cada item requiere user');

            const user = await db.getUser(username);
            if (!user) throw new Error(`Usuario "${username}" no encontrado`);

            const sistemasIn = item.sistemas || item.sistema_links || [];
            if (!Array.isArray(sistemasIn)) {
                throw new Error(`sistemas debe ser array (user ${username})`);
            }

            const links = [];
            for (const ref of sistemasIn) {
                const link = await resolveSistemaRef(ref);
                const sistema = await db.getSistema(link.sistema_id);
                await assertCanManageSistema(req.seedUser, sistema);
                links.push(link);
            }

            if (mode === 'replace') {
                await db.setUserSistemas(
                    username,
                    links.map((l) => l.sistema_id),
                    req.seedUser.user,
                    null,
                    links
                );
                const puestoApply = await db.applyPuestoSystemsToUser(username);
                results.push({
                    user: username,
                    mode,
                    sistemas: links.length,
                    puesto_links_added: puestoApply.added,
                    puesto_links_removed: puestoApply.removed,
                });
            } else {
                const actions = [];
                for (const link of links) {
                    const r = await db.upsertUserSistemaOverride(
                        username,
                        link.sistema_id,
                        link.sistema_role_id,
                        req.seedUser.user,
                        link.sistema_role_ids
                    );
                    actions.push({
                        client_id: link.client_id,
                        sistema_role_ids: link.sistema_role_ids,
                        ...r,
                    });
                }
                results.push({ user: username, mode, sistemas: links.length, actions });
            }

            allUsers.push(username);
        }

        let keycloak = { synced: 0, errors: [] };
        if (syncKc) keycloak = await syncUsersAccess(allUsers);

        res.json({
            ok: true,
            mode,
            processed: results.length,
            results,
            keycloakSynced: keycloak.synced,
            keycloakErrors: keycloak.errors.slice(0, 50),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Seed alineado a Sistemas → Usuarios con acceso:
 * por cada sistema, asigna usuarios con uno o varios roles internos.
 *
 * Body:
 * {
 *   "sync_keycloak": true,
 *   "items": [
 *     {
 *       "client_id": "mobonet",
 *       "usuarios": [
 *         { "user": "10001", "role_codigos": ["admin", "consulta"] },
 *         { "user": "10001", "role_codigos": ["usuario"] }
 *       ]
 *     }
 *   ]
 * }
 */
router.post('/sistemas/usuarios', async (req, res) => {
    try {
        req.setTimeout(20 * 60 * 1000);
        res.setTimeout(20 * 60 * 1000);

        const items = req.body.items;
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: 'items[] es requerido' });
        }

        const syncKc = req.body.sync_keycloak !== false;
        const results = [];
        const allUsers = [];

        for (const item of items) {
            const sistemaRef = {
                sistema_id: item.sistema_id,
                client_id: item.client_id,
            };
            // Resolver sistema sin roles (solo para validar existencia)
            let sistema = null;
            if (sistemaRef.sistema_id != null) {
                sistema = await db.getSistema(Number(sistemaRef.sistema_id));
            } else if (sistemaRef.client_id) {
                sistema = await db.getSistemaByClientId(String(sistemaRef.client_id).trim());
            }
            if (!sistema) {
                throw new Error(`Sistema no encontrado (${item.sistema_id || item.client_id || '?'})`);
            }
            await assertCanManageSistema(req.seedUser, sistema);

            const usuarios = item.usuarios || item.users || [];
            if (!Array.isArray(usuarios) || !usuarios.length) {
                throw new Error(`usuarios[] es requerido (sistema ${sistema.client_id})`);
            }

            const userResults = [];
            for (const u of usuarios) {
                const username = String(u.user || u.username || '').trim();
                if (!username) throw new Error(`Cada usuario requiere user (sistema ${sistema.client_id})`);

                const existingUser = await db.getUser(username);
                if (!existingUser) throw new Error(`Usuario "${username}" no encontrado`);

                const link = await resolveSistemaRef({
                    sistema_id: sistema.id,
                    role_codigo: u.role_codigo,
                    role_codigos: u.role_codigos,
                    sistema_role_id: u.sistema_role_id,
                    sistema_role_ids: u.sistema_role_ids,
                });

                const action = await db.upsertUserSistemaOverride(
                    username,
                    link.sistema_id,
                    link.sistema_role_id,
                    req.seedUser.user,
                    link.sistema_role_ids
                );

                userResults.push({
                    user: username,
                    sistema_role_ids: link.sistema_role_ids,
                    ...action,
                });
                allUsers.push(username);
            }

            results.push({
                sistema_id: sistema.id,
                client_id: sistema.client_id,
                usuarios: userResults.length,
                details: userResults,
            });
        }

        let keycloak = { synced: 0, errors: [] };
        if (syncKc) keycloak = await syncUsersAccess(allUsers);

        res.json({
            ok: true,
            mode: 'sistema-usuarios',
            processed: results.length,
            results,
            keycloakSynced: keycloak.synced,
            keycloakErrors: keycloak.errors.slice(0, 50),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Reaplica la política de todos los puestos a sus usuarios (útil tras migraciones).
 */
router.post('/reaplicar-puestos', async (req, res) => {
    try {
        if (!isSeedAdmin(req.seedUser)) {
            return res.status(403).json({
                error: 'Solo Admin puede reaplicar políticas de puesto',
            });
        }
        req.setTimeout(30 * 60 * 1000);
        res.setTimeout(30 * 60 * 1000);

        const syncKc = req.body.sync_keycloak !== false;
        const puestos = await db.listPuestos();
        const results = [];
        const allUsers = [];

        for (const p of puestos) {
            const applied = await db.applyPuestoSystemsToUsers(p.id);
            allUsers.push(...applied.usernames);
            results.push({
                puesto_id: p.id,
                puesto: p.nombre,
                usersAffected: applied.usersAffected,
                linksAdded: applied.added,
                linksRemoved: applied.removed,
            });
        }

        let keycloak = { synced: 0, errors: [] };
        if (syncKc) keycloak = await syncUsersAccess(allUsers);

        res.json({
            ok: true,
            puestos: results.length,
            results,
            keycloakSynced: keycloak.synced,
            keycloakErrors: keycloak.errors.slice(0, 50),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
