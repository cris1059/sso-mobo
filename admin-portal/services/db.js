const mysql = require('mysql2/promise');

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            port: Number(process.env.MYSQL_PORT) || 3306,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASS,
            database: process.env.MYSQL_DB,
            charset: 'utf8mb4',
            waitForConnections: true,
            connectionLimit: 10,
        });
    }
    return pool;
}

function parseSistema(row) {
    if (!row) return null;
    let redirectUris = [];
    try {
        redirectUris = JSON.parse(row.redirect_uris || '[]');
    } catch {
        redirectUris = [];
    }
    return { ...row, redirectUris };
}

async function listRoles() {
    const [rows] = await getPool().query(
        'SELECT id, nombre, descripcion, require_2fa FROM roleSSO ORDER BY id'
    );
    return rows;
}

const USER_ORG_SELECT = `
    u.user, u.name, u.last_name, u.email, u.dept,
    u.division_id, u.area_id, u.region_id, u.store_id, u.puesto_id,
    d.nombre AS division, a.nombre AS area,
    r.codigo AS region, r.nombre AS region_nombre,
    s.nombre AS store, p.nombre AS jobD,
    u.enabled, u.PrimerInicio, u.rol, rol.nombre AS rol_nombre
`;

const USER_ORG_JOINS = `
    FROM userSSO u
    JOIN roleSSO rol ON rol.id = u.rol
    JOIN orgDivision d ON d.id = u.division_id
    JOIN orgArea a ON a.id = u.area_id
    LEFT JOIN orgRegion r ON r.id = u.region_id
    LEFT JOIN orgStore s ON s.id = u.store_id
    JOIN orgPuesto p ON p.id = u.puesto_id
`;

async function ensurePuestoId(nombre = 'SIN PUESTO') {
    const label = (nombre || 'SIN PUESTO').trim() || 'SIN PUESTO';
    const [rows] = await getPool().query('SELECT id FROM orgPuesto WHERE nombre = ?', [label]);
    if (rows[0]) return rows[0].id;
    const [res] = await getPool().query('INSERT INTO orgPuesto (nombre) VALUES (?)', [label]);
    return res.insertId;
}

async function resolveOrgIds({ division, area, region, store, jobD, division_id, area_id, region_id, store_id, puesto_id }) {
    const pool = getPool();
    let divId = division_id || null;
    let areaId = area_id || null;
    let regId = region_id || null;
    let storeId = store_id || null;
    let puestoId = puesto_id || null;

    if (!divId && division) {
        const [rows] = await pool.query('SELECT id FROM orgDivision WHERE nombre = ?', [division]);
        divId = rows[0]?.id || null;
    }
    if (!areaId && area) {
        if (divId) {
            const [rows] = await pool.query(
                'SELECT id FROM orgArea WHERE division_id = ? AND nombre = ?',
                [divId, area]
            );
            areaId = rows[0]?.id || null;
        }
        if (!areaId) {
            const [rows] = await pool.query('SELECT id, division_id FROM orgArea WHERE nombre = ? LIMIT 1', [area]);
            if (rows[0]) {
                areaId = rows[0].id;
                if (!divId) divId = rows[0].division_id;
            }
        }
    }
    if (areaId && !divId) {
        const [rows] = await pool.query('SELECT division_id FROM orgArea WHERE id = ?', [areaId]);
        divId = rows[0]?.division_id || null;
    }
    if (!regId && region) {
        const [rows] = await pool.query(
            'SELECT id FROM orgRegion WHERE codigo = ? OR nombre = ? LIMIT 1',
            [region, region]
        );
        regId = rows[0]?.id || null;
    }
    if (!storeId && store) {
        const [rows] = await pool.query('SELECT id FROM orgStore WHERE nombre = ?', [store]);
        storeId = rows[0]?.id || null;
    }
    if (!puestoId) {
        puestoId = await ensurePuestoId(jobD || 'SIN PUESTO');
    }

    if (!divId || !areaId || !puestoId) {
        if (!divId) {
            const [rows] = await pool.query('SELECT id FROM orgDivision ORDER BY id LIMIT 1');
            divId = rows[0]?.id;
        }
        if (!areaId && divId) {
            const [rows] = await pool.query(
                'SELECT id FROM orgArea WHERE division_id = ? ORDER BY id LIMIT 1',
                [divId]
            );
            areaId = rows[0]?.id;
        }
        if (!puestoId) puestoId = await ensurePuestoId('SIN PUESTO');
    }

    return {
        division_id: divId,
        area_id: areaId,
        region_id: regId,
        store_id: storeId,
        puesto_id: puestoId,
    };
}

async function listUsers() {
    const [rows] = await getPool().query(`
        SELECT ${USER_ORG_SELECT}, u.created_at
        ${USER_ORG_JOINS}
        ORDER BY u.user
    `);
    return rows;
}

const PUESTO_LINKED_BY = 'puesto';

let _puestoSistemaTableReady = false;
let _multiRoleTablesReady = false;

async function ensurePuestoSistemaTable() {
    await ensurePuestoSistemaTableBare();
    await ensureMultiRoleTables();
}

async function ensureMultiRoleTables() {
    if (_multiRoleTablesReady) return;
    await ensurePuestoSistemaTableBare();
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS userSSO_sistema_role (
            user            VARCHAR(100) NOT NULL,
            sistema_id      INT          NOT NULL,
            sistema_role_id INT          NOT NULL,
            PRIMARY KEY (user, sistema_id, sistema_role_id),
            KEY idx_ussr_sistema (sistema_id),
            KEY idx_ussr_role (sistema_role_id),
            CONSTRAINT fk_ussr_link
                FOREIGN KEY (user, sistema_id) REFERENCES userSSO_sistema (user, sistema_id) ON DELETE CASCADE,
            CONSTRAINT fk_ussr_role
                FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE CASCADE
        ) COLLATE = utf8_bin
    `);
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS orgPuesto_sistema_role (
            puesto_id       INT NOT NULL,
            sistema_id      INT NOT NULL,
            sistema_role_id INT NOT NULL,
            PRIMARY KEY (puesto_id, sistema_id, sistema_role_id),
            KEY idx_opsr_sistema (sistema_id),
            KEY idx_opsr_role (sistema_role_id),
            CONSTRAINT fk_opsr_link
                FOREIGN KEY (puesto_id, sistema_id) REFERENCES orgPuesto_sistema (puesto_id, sistema_id) ON DELETE CASCADE,
            CONSTRAINT fk_opsr_role
                FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE CASCADE
        ) COLLATE = utf8_bin
    `);
    await getPool().query(`
        INSERT IGNORE INTO userSSO_sistema_role (user, sistema_id, sistema_role_id)
        SELECT user, sistema_id, sistema_role_id FROM userSSO_sistema WHERE sistema_role_id IS NOT NULL
    `);
    await getPool().query(`
        INSERT IGNORE INTO orgPuesto_sistema_role (puesto_id, sistema_id, sistema_role_id)
        SELECT puesto_id, sistema_id, sistema_role_id FROM orgPuesto_sistema WHERE sistema_role_id IS NOT NULL
    `);
    _multiRoleTablesReady = true;
}

/** Solo crea orgPuesto_sistema sin recursión a multi-rol. */
async function ensurePuestoSistemaTableBare() {
    if (_puestoSistemaTableReady) return;
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS orgPuesto_sistema (
            puesto_id       INT          NOT NULL,
            sistema_id      INT          NOT NULL,
            sistema_role_id INT          NULL,
            linked_by       VARCHAR(100) NULL,
            created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (puesto_id, sistema_id),
            KEY idx_orgPuesto_sistema_sistema (sistema_id),
            CONSTRAINT fk_orgPuesto_sistema_puesto
                FOREIGN KEY (puesto_id) REFERENCES orgPuesto (id) ON DELETE CASCADE,
            CONSTRAINT fk_orgPuesto_sistema_sistema
                FOREIGN KEY (sistema_id) REFERENCES sistemaSSO (id) ON DELETE CASCADE,
            CONSTRAINT fk_orgPuesto_sistema_role
                FOREIGN KEY (sistema_role_id) REFERENCES sistemaRoleSSO (id) ON DELETE SET NULL
        ) COLLATE = utf8_bin
    `);
    _puestoSistemaTableReady = true;
}

/** Normaliza un link a { sistema_id, sistema_role_ids[] }. Acepta legacy sistema_role_id. */
function normalizeSistemaLink(link) {
    const sistema_id = Number(link.sistema_id ?? link);
    let ids = [];
    if (Array.isArray(link.sistema_role_ids) && link.sistema_role_ids.length) {
        ids = link.sistema_role_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    } else if (link.sistema_role_id != null && link.sistema_role_id !== '') {
        const n = Number(link.sistema_role_id);
        if (Number.isFinite(n) && n > 0) ids = [n];
    }
    return { sistema_id, sistema_role_ids: [...new Set(ids)] };
}

async function resolveRoleIdsForSistema(sistemaId, roleIds, conn = null, { fallbackDefault = true } = {}) {
    const q = conn || getPool();
    let ids = [...new Set((roleIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) {
        if (!fallbackDefault) return [];
        const def = await getDefaultSistemaRoleId(sistemaId, conn);
        if (def) ids = [def];
        return ids;
    }
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await q.query(
        `SELECT id FROM sistemaRoleSSO WHERE sistema_id = ? AND id IN (${placeholders})`,
        [sistemaId, ...ids]
    );
    const valid = new Set(rows.map((r) => Number(r.id)));
    return ids.filter((id) => valid.has(id));
}

async function replaceLinkRoles(conn, table, keyCols, keyVals, sistemaId, roleIds, opts = {}) {
    const ids = await resolveRoleIdsForSistema(sistemaId, roleIds, conn, opts);
    const where = keyCols.map((c) => `${c} = ?`).join(' AND ');
    await conn.query(`DELETE FROM ${table} WHERE ${where}`, keyVals);
    for (const rid of ids) {
        await conn.query(
            `INSERT INTO ${table} (${keyCols.join(', ')}, sistema_role_id) VALUES (${keyCols.map(() => '?').join(', ')}, ?)`,
            [...keyVals, rid]
        );
    }
    return ids;
}

async function listPuestos() {
    await ensurePuestoSistemaTable();
    const [rows] = await getPool().query(`
        SELECT p.id, p.nombre,
               COUNT(DISTINCT u.user) AS usuarios,
               COUNT(DISTINCT ps.sistema_id) AS sistemas
        FROM orgPuesto p
        LEFT JOIN userSSO u ON u.puesto_id = p.id
        LEFT JOIN orgPuesto_sistema ps ON ps.puesto_id = p.id
        GROUP BY p.id, p.nombre
        ORDER BY p.nombre
    `);
    return rows;
}

async function getPuesto(id) {
    await ensurePuestoSistemaTable();
    const [rows] = await getPool().query(
        `SELECT p.id, p.nombre,
                (SELECT COUNT(*) FROM userSSO u WHERE u.puesto_id = p.id) AS usuarios
         FROM orgPuesto p WHERE p.id = ?`,
        [id]
    );
    return rows[0] || null;
}

async function getPuestoSistemaLinks(puestoId) {
    await ensurePuestoSistemaTable();
    const [rows] = await getPool().query(
        `SELECT ps.puesto_id, ps.sistema_id, ps.sistema_role_id, ps.linked_by, ps.created_at,
                s.client_id, s.nombre,
                sr.codigo AS role_codigo, sr.nombre AS role_nombre
         FROM orgPuesto_sistema ps
         JOIN sistemaSSO s ON s.id = ps.sistema_id
         LEFT JOIN sistemaRoleSSO sr ON sr.id = ps.sistema_role_id
         WHERE ps.puesto_id = ?
         ORDER BY s.nombre`,
        [puestoId]
    );
    if (!rows.length) return rows;

    const [roleRows] = await getPool().query(
        `SELECT opsr.sistema_id, opsr.sistema_role_id, sr.codigo, sr.nombre
         FROM orgPuesto_sistema_role opsr
         JOIN sistemaRoleSSO sr ON sr.id = opsr.sistema_role_id
         WHERE opsr.puesto_id = ?
         ORDER BY sr.nombre`,
        [puestoId]
    );
    const bySistema = new Map();
    for (const r of roleRows) {
        if (!bySistema.has(r.sistema_id)) bySistema.set(r.sistema_id, []);
        bySistema.get(r.sistema_id).push({
            id: r.sistema_role_id,
            codigo: r.codigo,
            nombre: r.nombre,
        });
    }
    return rows.map((row) => {
        let roles = bySistema.get(row.sistema_id) || [];
        if (!roles.length && row.sistema_role_id) {
            roles = [{ id: row.sistema_role_id, codigo: row.role_codigo, nombre: row.role_nombre }];
        }
        return {
            ...row,
            sistema_role_ids: roles.map((r) => r.id),
            roles,
            role_codigos: roles.map((r) => r.codigo),
        };
    });
}

async function setPuestoSistemas(puestoId, sistemaLinks, linkedBy) {
    await ensurePuestoSistemaTable();
    const puesto = await getPuesto(puestoId);
    if (!puesto) throw new Error('Puesto no encontrado');

    const links = (sistemaLinks || []).map(normalizeSistemaLink);

    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM orgPuesto_sistema WHERE puesto_id = ?', [puestoId]);
        for (const link of links) {
            const roleIds = await resolveRoleIdsForSistema(link.sistema_id, link.sistema_role_ids, conn);
            const primary = roleIds[0] || null;
            await conn.query(
                `INSERT INTO orgPuesto_sistema (puesto_id, sistema_id, sistema_role_id, linked_by)
                 VALUES (?, ?, ?, ?)`,
                [puestoId, link.sistema_id, primary, linkedBy || null]
            );
            await replaceLinkRoles(
                conn,
                'orgPuesto_sistema_role',
                ['puesto_id', 'sistema_id'],
                [puestoId, link.sistema_id],
                link.sistema_id,
                roleIds
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return applyPuestoSystemsToUsers(puestoId);
}

async function applyPuestoSystemsToUser(username) {
    await ensurePuestoSistemaTable();
    const user = await getUser(username);
    if (!user) return { added: 0, removed: 0 };

    const [del] = await getPool().query(
        'DELETE FROM userSSO_sistema WHERE user = ? AND linked_by = ?',
        [username, PUESTO_LINKED_BY]
    );
    const removed = del.affectedRows || 0;

    if (!user.puesto_id) return { added: 0, removed };

    const policy = await getPuestoSistemaLinks(user.puesto_id);
    let added = 0;
    for (const link of policy) {
        const [existing] = await getPool().query(
            'SELECT 1 FROM userSSO_sistema WHERE user = ? AND sistema_id = ?',
            [username, link.sistema_id]
        );
        if (existing.length) continue;

        const roleIds = link.sistema_role_ids?.length
            ? link.sistema_role_ids
            : (link.sistema_role_id ? [link.sistema_role_id] : []);
        const resolved = await resolveRoleIdsForSistema(link.sistema_id, roleIds);
        const primary = resolved[0] || null;
        await getPool().query(
            `INSERT INTO userSSO_sistema (user, sistema_id, sistema_role_id, linked_by)
             VALUES (?, ?, ?, ?)`,
            [username, link.sistema_id, primary, PUESTO_LINKED_BY]
        );
        await replaceLinkRoles(
            getPool(),
            'userSSO_sistema_role',
            ['user', 'sistema_id'],
            [username, link.sistema_id],
            link.sistema_id,
            resolved
        );
        added += 1;
    }
    return { added, removed };
}

async function applyPuestoSystemsToUsers(puestoId) {
    const [users] = await getPool().query(
        'SELECT user FROM userSSO WHERE puesto_id = ? ORDER BY user',
        [puestoId]
    );
    const usernames = [];
    let added = 0;
    let removed = 0;
    for (const row of users) {
        const r = await applyPuestoSystemsToUser(row.user);
        added += r.added;
        removed += r.removed;
        usernames.push(row.user);
    }
    return { usernames, usersAffected: usernames.length, added, removed };
}

async function getUser(username) {
    const [rows] = await getPool().query(
        `SELECT ${USER_ORG_SELECT}
         ${USER_ORG_JOINS}
         WHERE u.user = ?`,
        [username]
    );
    return rows[0] || null;
}

/** Credenciales para login API (seed). No incluir pass_hash en respuestas. */
async function getUserCredentials(username) {
    const [rows] = await getPool().query(
        `SELECT u.user, u.pass_hash, u.enabled, u.rol, rol.nombre AS rol_nombre
         FROM userSSO u
         JOIN roleSSO rol ON rol.id = u.rol
         WHERE u.user = ?`,
        [username]
    );
    return rows[0] || null;
}

async function getPuestoByNombre(nombre) {
    if (!nombre) return null;
    const [rows] = await getPool().query(
        'SELECT id, nombre FROM orgPuesto WHERE nombre = ? LIMIT 1',
        [String(nombre).trim()]
    );
    return rows[0] || null;
}

/**
 * Asigna o actualiza acceso de un usuario a un sistema como override manual.
 * Si el vínculo venía del puesto, pasa a ser override (linked_by = actor).
 * Acepta sistemaRoleId (legacy) o sistemaRoleIds[].
 */
async function upsertUserSistemaOverride(username, sistemaId, sistemaRoleId, linkedBy, sistemaRoleIds = null) {
    await ensureMultiRoleTables();
    const explicitIds = Array.isArray(sistemaRoleIds);
    const roleIds = explicitIds
        ? sistemaRoleIds
        : (sistemaRoleId != null ? [sistemaRoleId] : []);
    const resolved = await resolveRoleIdsForSistema(sistemaId, roleIds, null, {
        fallbackDefault: !explicitIds,
    });
    const primary = resolved[0] || null;

    const [existing] = await getPool().query(
        'SELECT sistema_id, linked_by FROM userSSO_sistema WHERE user = ? AND sistema_id = ?',
        [username, sistemaId]
    );
    if (existing.length) {
        await getPool().query(
            `UPDATE userSSO_sistema
             SET sistema_role_id = ?, linked_by = ?
             WHERE user = ? AND sistema_id = ?`,
            [primary, linkedBy || null, username, sistemaId]
        );
        await replaceLinkRoles(
            getPool(),
            'userSSO_sistema_role',
            ['user', 'sistema_id'],
            [username, sistemaId],
            sistemaId,
            resolved,
            { fallbackDefault: false }
        );
        return { action: 'updated', was_puesto: existing[0].linked_by === PUESTO_LINKED_BY };
    }

    await getPool().query(
        `INSERT INTO userSSO_sistema (user, sistema_id, sistema_role_id, linked_by)
         VALUES (?, ?, ?, ?)`,
        [username, sistemaId, primary, linkedBy || null]
    );
    await replaceLinkRoles(
        getPool(),
        'userSSO_sistema_role',
        ['user', 'sistema_id'],
        [username, sistemaId],
        sistemaId,
        resolved,
        { fallbackDefault: false }
    );
    return { action: 'inserted', was_puesto: false };
}

async function userExists(username) {
    const [rows] = await getPool().query('SELECT 1 FROM userSSO WHERE user = ?', [username]);
    return rows.length > 0;
}

async function createUser({
    user, pass_hash, name, last_name, email, area, dept, store, enabled, rol, PrimerInicio = 1,
    division, region, jobD, division_id, area_id, region_id, store_id, puesto_id,
}) {
    const org = await resolveOrgIds({
        division, area, region, store, jobD,
        division_id, area_id, region_id, store_id, puesto_id,
    });
    await getPool().query(
        `INSERT INTO userSSO (
            user, pass_hash, name, last_name, email, dept,
            division_id, area_id, region_id, store_id, puesto_id,
            enabled, PrimerInicio, rol, intrDate
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
        [
            user, pass_hash, name, last_name, email, dept || '',
            org.division_id, org.area_id, org.region_id, org.store_id, org.puesto_id,
            enabled, PrimerInicio ? 1 : 0, rol,
        ]
    );
}

async function updateUser(username, {
    name, last_name, email, area, dept, store, enabled, rol, PrimerInicio,
    division, region, jobD, division_id, area_id, region_id, store_id, puesto_id,
}) {
    // Conservar org actual si el form no manda IDs/puesto
    const current = await getUser(username);
    const org = await resolveOrgIds({
        division: division || current?.division,
        area: area || current?.area,
        region: region || current?.region,
        store: store || current?.store,
        jobD: jobD || current?.jobD,
        division_id: division_id || current?.division_id,
        area_id: area_id || current?.area_id,
        region_id: region_id !== undefined ? region_id : current?.region_id,
        store_id: store_id !== undefined ? store_id : current?.store_id,
        puesto_id: puesto_id || current?.puesto_id,
    });
    const fields = [
        'name = ?', 'last_name = ?', 'email = ?', 'dept = ?',
        'division_id = ?', 'area_id = ?', 'region_id = ?', 'store_id = ?', 'puesto_id = ?',
        'enabled = ?', 'rol = ?',
    ];
    const values = [
        name, last_name, email, dept || '',
        org.division_id, org.area_id, org.region_id, org.store_id, org.puesto_id,
        enabled, rol,
    ];
    if (PrimerInicio !== undefined) {
        fields.push('PrimerInicio = ?');
        values.push(PrimerInicio ? 1 : 0);
    }
    values.push(username);
    await getPool().query(
        `UPDATE userSSO SET ${fields.join(', ')} WHERE user = ?`,
        values
    );
}

async function updatePassword(username, pass_hash, { clearPrimerInicio = true } = {}) {
    if (clearPrimerInicio) {
        await getPool().query(
            'UPDATE userSSO SET pass_hash = ?, PrimerInicio = 0 WHERE user = ?',
            [pass_hash, username]
        );
    } else {
        await getPool().query('UPDATE userSSO SET pass_hash = ? WHERE user = ?', [pass_hash, username]);
    }
}

async function clearPrimerInicio(username) {
    await getPool().query('UPDATE userSSO SET PrimerInicio = 0 WHERE user = ?', [username]);
}

async function setPrimerInicio(username, value) {
    await getPool().query('UPDATE userSSO SET PrimerInicio = ? WHERE user = ?', [value ? 1 : 0, username]);
}

async function deleteUser(username) {
    await getPool().query('DELETE FROM userSSO WHERE user = ?', [username]);
}

async function getActiveUsersForSync() {
    const [rows] = await getPool().query(`
        SELECT user, IFNULL(name,'') AS name, IFNULL(last_name,'') AS last_name,
               IFNULL(email,'') AS email, enabled, rol, PrimerInicio
        FROM userSSO
        WHERE enabled = 1
    `);
    return rows;
}

// ── Sistemas (sistemaSSO) ──

async function listSistemas(owner = null) {
    let sql = `SELECT id, client_id, nombre, owner, redirect_uris, web_origins,
                      kc_client_uuid, enabled, require_2fa, created_at
               FROM sistemaSSO`;
    const params = [];
    if (owner) {
        sql += ' WHERE owner = ?';
        params.push(owner);
    }
    sql += ' ORDER BY nombre';
    const [rows] = await getPool().query(sql, params);
    return rows.map(parseSistema);
}

async function getSistema(id) {
    const [rows] = await getPool().query(
        `SELECT id, client_id, nombre, owner, redirect_uris, web_origins,
                kc_client_uuid, enabled, require_2fa, created_at
         FROM sistemaSSO WHERE id = ?`,
        [id]
    );
    return parseSistema(rows[0]);
}

async function getSistemaByClientId(clientId) {
    const [rows] = await getPool().query(
        'SELECT id, client_id, nombre, owner, kc_client_uuid FROM sistemaSSO WHERE client_id = ?',
        [clientId]
    );
    return parseSistema(rows[0]);
}

async function createSistema({ client_id, nombre, owner, redirectUris, web_origins, kc_client_uuid, enabled, require_2fa }) {
    const [result] = await getPool().query(
        `INSERT INTO sistemaSSO (client_id, nombre, owner, redirect_uris, web_origins, kc_client_uuid, enabled, require_2fa)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            client_id,
            nombre,
            owner || null,
            JSON.stringify(redirectUris),
            web_origins || '+',
            kc_client_uuid || null,
            enabled ?? 1,
            require_2fa ? 1 : 0,
        ]
    );
    return getSistema(result.insertId);
}

async function updateSistema(id, { nombre, redirectUris, web_origins, enabled, kc_client_uuid, require_2fa }) {
    const fields = [];
    const values = [];
    if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
    if (redirectUris !== undefined) { fields.push('redirect_uris = ?'); values.push(JSON.stringify(redirectUris)); }
    if (web_origins !== undefined) { fields.push('web_origins = ?'); values.push(web_origins); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled); }
    if (kc_client_uuid !== undefined) { fields.push('kc_client_uuid = ?'); values.push(kc_client_uuid); }
    if (require_2fa !== undefined) { fields.push('require_2fa = ?'); values.push(require_2fa ? 1 : 0); }
    if (!fields.length) return getSistema(id);
    values.push(id);
    await getPool().query(`UPDATE sistemaSSO SET ${fields.join(', ')} WHERE id = ?`, values);
    return getSistema(id);
}

async function deleteSistema(id) {
    await getPool().query('DELETE FROM sistemaSSO WHERE id = ?', [id]);
}

// ── Vinculaciones (userSSO_sistema) ──

async function getUserSistemaIds(username) {
    const [rows] = await getPool().query(
        'SELECT sistema_id FROM userSSO_sistema WHERE user = ? ORDER BY sistema_id',
        [username]
    );
    return rows.map((r) => r.sistema_id);
}

async function getUserSistemas(username) {
    await ensureMultiRoleTables();
    const [rows] = await getPool().query(
        `SELECT s.id, s.client_id, s.nombre, s.owner, us.linked_by, us.created_at,
                us.sistema_role_id, sr.codigo AS role_codigo, sr.nombre AS role_nombre
         FROM userSSO_sistema us
         JOIN sistemaSSO s ON s.id = us.sistema_id
         LEFT JOIN sistemaRoleSSO sr ON sr.id = us.sistema_role_id
         WHERE us.user = ?
         ORDER BY s.nombre`,
        [username]
    );
    if (!rows.length) return rows;

    const [roleRows] = await getPool().query(
        `SELECT usr.sistema_id, usr.sistema_role_id, sr.codigo, sr.nombre
         FROM userSSO_sistema_role usr
         JOIN sistemaRoleSSO sr ON sr.id = usr.sistema_role_id
         WHERE usr.user = ?
         ORDER BY sr.nombre`,
        [username]
    );
    const bySistema = new Map();
    for (const r of roleRows) {
        if (!bySistema.has(r.sistema_id)) bySistema.set(r.sistema_id, []);
        bySistema.get(r.sistema_id).push({
            id: r.sistema_role_id,
            codigo: r.codigo,
            nombre: r.nombre,
        });
    }
    return rows.map((row) => {
        let roles = bySistema.get(row.id) || [];
        if (!roles.length && row.sistema_role_id) {
            roles = [{ id: row.sistema_role_id, codigo: row.role_codigo, nombre: row.role_nombre }];
        }
        return {
            ...row,
            sistema_role_ids: roles.map((r) => r.id),
            roles,
            role_codigos: roles.map((r) => r.codigo),
        };
    });
}

async function getSistemaUserLinks(sistemaId) {
    const [rows] = await getPool().query(
        'SELECT user, linked_by, created_at FROM userSSO_sistema WHERE sistema_id = ?',
        [sistemaId]
    );
    return rows;
}

async function listSistemaUsers(sistemaId, page = 1, pageSize = 20, query = '') {
    await ensureMultiRoleTables();
    const size = Math.min(Math.max(Number(pageSize) || 20, 5), 100);
    const term = String(query || '').trim();
    const filterSql = term
        ? ' AND (u.user LIKE ? OR u.name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)'
        : '';
    const filterParams = term ? Array(4).fill(`%${term}%`) : [];
    const [[countRow]] = await getPool().query(
        `SELECT COUNT(*) AS total
         FROM userSSO_sistema us
         JOIN userSSO u ON u.user = us.user
         WHERE us.sistema_id = ?${filterSql}`,
        [sistemaId, ...filterParams]
    );
    const total = Number(countRow.total) || 0;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const offset = (currentPage - 1) * size;
    const [rows] = await getPool().query(
        `SELECT u.user, u.name, u.last_name, u.email, u.enabled,
                r.nombre AS rol_nombre, us.sistema_role_id,
                sr.codigo AS role_codigo, sr.nombre AS role_nombre,
                us.linked_by, us.created_at
         FROM userSSO_sistema us
         JOIN userSSO u ON u.user = us.user
         JOIN roleSSO r ON r.id = u.rol
         LEFT JOIN sistemaRoleSSO sr ON sr.id = us.sistema_role_id
         WHERE us.sistema_id = ?${filterSql}
         ORDER BY u.user
         LIMIT ? OFFSET ?`,
        [sistemaId, ...filterParams, size, offset]
    );
    if (!rows.length) {
        return { items: [], page: currentPage, pageSize: size, total, totalPages };
    }

    const usernames = rows.map((row) => row.user);
    const placeholders = usernames.map(() => '?').join(', ');
    const [roleRows] = await getPool().query(
        `SELECT usr.user, usr.sistema_role_id, sr.codigo, sr.nombre
         FROM userSSO_sistema_role usr
         JOIN sistemaRoleSSO sr ON sr.id = usr.sistema_role_id
         WHERE usr.sistema_id = ? AND usr.user IN (${placeholders})
         ORDER BY sr.nombre`,
        [sistemaId, ...usernames]
    );
    const byUser = new Map();
    for (const r of roleRows) {
        if (!byUser.has(r.user)) byUser.set(r.user, []);
        byUser.get(r.user).push({
            id: r.sistema_role_id,
            codigo: r.codigo,
            nombre: r.nombre,
        });
    }
    const items = rows.map((row) => {
        let roles = byUser.get(row.user) || [];
        if (!roles.length && row.sistema_role_id) {
            roles = [{ id: row.sistema_role_id, codigo: row.role_codigo, nombre: row.role_nombre }];
        }
        return {
            ...row,
            sistema_role_ids: roles.map((r) => r.id),
            roles,
            role_codigos: roles.map((r) => r.codigo),
        };
    });
    return { items, page: currentPage, pageSize: size, total, totalPages };
}

async function searchUsersForSistema(sistemaId, query = '', limit = 25) {
    let sql = `
        SELECT u.user, u.name, u.last_name, u.email, u.enabled, r.nombre AS rol_nombre
        FROM userSSO u
        JOIN roleSSO r ON r.id = u.rol
        WHERE u.enabled = 1
          AND NOT EXISTS (
              SELECT 1 FROM userSSO_sistema us
              WHERE us.user = u.user AND us.sistema_id = ?
          )`;
    const params = [sistemaId];
    const term = query.trim();
    if (term) {
        const q = `%${term}%`;
        sql += ' AND (u.user LIKE ? OR u.name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
        params.push(q, q, q, q);
    }
    sql += ' ORDER BY u.user LIMIT ?';
    params.push(limit);
    const [rows] = await getPool().query(sql, params);
    return rows;
}

async function addUserToSistema(username, sistemaId, sistemaRoleId, linkedBy, sistemaRoleIds = null) {
    await ensureMultiRoleTables();
    const [existing] = await getPool().query(
        'SELECT 1 FROM userSSO_sistema WHERE user = ? AND sistema_id = ?',
        [username, sistemaId]
    );
    if (existing.length) throw new Error('El usuario ya tiene acceso a este sistema');

    const roleIds = Array.isArray(sistemaRoleIds)
        ? sistemaRoleIds
        : (sistemaRoleId != null ? [sistemaRoleId] : []);
    const resolved = await resolveRoleIdsForSistema(sistemaId, roleIds);
    const primary = resolved[0] || null;

    await getPool().query(
        'INSERT INTO userSSO_sistema (user, sistema_id, sistema_role_id, linked_by) VALUES (?, ?, ?, ?)',
        [username, sistemaId, primary, linkedBy || null]
    );
    await replaceLinkRoles(
        getPool(),
        'userSSO_sistema_role',
        ['user', 'sistema_id'],
        [username, sistemaId],
        sistemaId,
        resolved
    );
}

async function removeUserFromSistema(username, sistemaId) {
    const [result] = await getPool().query(
        'DELETE FROM userSSO_sistema WHERE user = ? AND sistema_id = ?',
        [username, sistemaId]
    );
    if (!result.affectedRows) throw new Error('El usuario no está vinculado a este sistema');
}

async function updateUserSistemaRole(username, sistemaId, sistemaRoleId, sistemaRoleIds = null) {
    await ensureMultiRoleTables();
    // Si llega sistema_role_ids (aunque vacío), respetar la selección; no forzar el rol default.
    const explicitIds = Array.isArray(sistemaRoleIds);
    const roleIds = explicitIds
        ? sistemaRoleIds
        : (sistemaRoleId != null ? [sistemaRoleId] : []);
    const resolved = await resolveRoleIdsForSistema(sistemaId, roleIds, null, {
        fallbackDefault: !explicitIds,
    });
    const primary = resolved[0] || null;

    const [result] = await getPool().query(
        'UPDATE userSSO_sistema SET sistema_role_id = ? WHERE user = ? AND sistema_id = ?',
        [primary, username, sistemaId]
    );
    if (!result.affectedRows) throw new Error('El usuario no está vinculado a este sistema');
    await replaceLinkRoles(
        getPool(),
        'userSSO_sistema_role',
        ['user', 'sistema_id'],
        [username, sistemaId],
        sistemaId,
        resolved,
        { fallbackDefault: false }
    );
}

async function setUserSistemas(username, sistemaIds, linkedBy, allowedSistemaIds = null, sistemaLinks = null) {
    await ensureMultiRoleTables();
    const links = sistemaLinks?.length
        ? sistemaLinks.map(normalizeSistemaLink)
        : sistemaIds.map((id) => ({ sistema_id: Number(id), sistema_role_ids: [] }));

    const targetIds = links.map((l) => l.sistema_id);
    if (allowedSistemaIds) {
        const allowed = new Set(allowedSistemaIds.map(Number));
        for (const id of targetIds) {
            if (!allowed.has(id)) throw new Error(`No tienes permiso para vincular el sistema ${id}`);
        }
    }

    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        if (allowedSistemaIds) {
            const placeholders = allowedSistemaIds.map(() => '?').join(',');
            await conn.query(
                `DELETE FROM userSSO_sistema WHERE user = ? AND sistema_id IN (${placeholders})`,
                [username, ...allowedSistemaIds]
            );
        } else {
            await conn.query('DELETE FROM userSSO_sistema WHERE user = ?', [username]);
        }
        for (const link of links) {
            const roleIds = await resolveRoleIdsForSistema(link.sistema_id, link.sistema_role_ids, conn);
            const primary = roleIds[0] || null;
            await conn.query(
                'INSERT INTO userSSO_sistema (user, sistema_id, sistema_role_id, linked_by) VALUES (?, ?, ?, ?)',
                [username, link.sistema_id, primary, linkedBy || null]
            );
            await replaceLinkRoles(
                conn,
                'userSSO_sistema_role',
                ['user', 'sistema_id'],
                [username, link.sistema_id],
                link.sistema_id,
                roleIds
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function getDefaultSistemaRoleId(sistemaId, conn = null) {
    const q = conn || getPool();
    const [rows] = await q.query(
        `SELECT id FROM sistemaRoleSSO WHERE sistema_id = ? ORDER BY is_default DESC, id ASC LIMIT 1`,
        [sistemaId]
    );
    return rows[0]?.id || null;
}

async function getAllUserSistemaLinks() {
    await ensureMultiRoleTables();
    const [rows] = await getPool().query(
        `SELECT us.user, us.sistema_id, s.client_id,
                COALESCE(sr.codigo, sr_legacy.codigo) AS role_codigo
         FROM userSSO_sistema us
         JOIN sistemaSSO s ON s.id = us.sistema_id
         LEFT JOIN userSSO_sistema_role usr ON usr.user = us.user AND usr.sistema_id = us.sistema_id
         LEFT JOIN sistemaRoleSSO sr ON sr.id = usr.sistema_role_id
         LEFT JOIN sistemaRoleSSO sr_legacy ON sr_legacy.id = us.sistema_role_id`
    );
    return rows;
}

// ── Roles internos por sistema (sistemaRoleSSO) ──

async function listSistemaRoles(sistemaId) {
    const [rows] = await getPool().query(
        `SELECT id, sistema_id, codigo, nombre, descripcion, is_default, require_2fa, created_at
         FROM sistemaRoleSSO WHERE sistema_id = ? ORDER BY is_default DESC, nombre`,
        [sistemaId]
    );
    return rows;
}

async function getSistemaRole(id) {
    const [rows] = await getPool().query(
        'SELECT id, sistema_id, codigo, nombre, descripcion, is_default, require_2fa FROM sistemaRoleSSO WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

async function createSistemaRole({ sistema_id, codigo, nombre, descripcion, is_default, require_2fa }) {
    const code = codigo.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!code) throw new Error('Código de rol inválido');
    if (code === 'access' || code === 'otp_required') {
        throw new Error(`El código "${code}" está reservado para el SSO`);
    }

    if (is_default) {
        await getPool().query('UPDATE sistemaRoleSSO SET is_default = 0 WHERE sistema_id = ?', [sistema_id]);
    }

    const [result] = await getPool().query(
        `INSERT INTO sistemaRoleSSO (sistema_id, codigo, nombre, descripcion, is_default, require_2fa)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sistema_id, code, nombre.trim(), descripcion || null, is_default ? 1 : 0, require_2fa ? 1 : 0]
    );
    return getSistemaRole(result.insertId);
}

async function updateSistemaRole(id, { nombre, descripcion, is_default, require_2fa }) {
    const existing = await getSistemaRole(id);
    if (!existing) return null;

    if (is_default) {
        await getPool().query('UPDATE sistemaRoleSSO SET is_default = 0 WHERE sistema_id = ?', [existing.sistema_id]);
    }

    const fields = [];
    const values = [];
    if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre.trim()); }
    if (descripcion !== undefined) { fields.push('descripcion = ?'); values.push(descripcion || null); }
    if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }
    if (require_2fa !== undefined) { fields.push('require_2fa = ?'); values.push(require_2fa ? 1 : 0); }
    if (!fields.length) return existing;

    values.push(id);
    await getPool().query(`UPDATE sistemaRoleSSO SET ${fields.join(', ')} WHERE id = ?`, values);
    return getSistemaRole(id);
}

async function deleteSistemaRole(id) {
    const role = await getSistemaRole(id);
    if (!role) return false;
    await ensureMultiRoleTables();
    const [usedUser] = await getPool().query(
        'SELECT COUNT(*) AS c FROM userSSO_sistema_role WHERE sistema_role_id = ?',
        [id]
    );
    const [usedLegacy] = await getPool().query(
        'SELECT COUNT(*) AS c FROM userSSO_sistema WHERE sistema_role_id = ?',
        [id]
    );
    const [usedPuesto] = await getPool().query(
        'SELECT COUNT(*) AS c FROM orgPuesto_sistema_role WHERE sistema_role_id = ?',
        [id]
    );
    if (usedUser[0].c > 0 || usedLegacy[0].c > 0 || usedPuesto[0].c > 0) {
        throw new Error('No se puede eliminar: hay usuarios o puestos con este rol');
    }
    await getPool().query('DELETE FROM sistemaRoleSSO WHERE id = ?', [id]);
    return role;
}

async function seedDefaultSistemaRoles(sistemaId) {
    const defaults = [
        { codigo: 'usuario', nombre: 'Usuario', descripcion: 'Acceso estándar', is_default: 1 },
        { codigo: 'admin', nombre: 'Administrador', descripcion: 'Gestión completa en la app', is_default: 0 },
        { codigo: 'consulta', nombre: 'Consulta', descripcion: 'Solo lectura', is_default: 0 },
    ];
    const created = [];
    for (const r of defaults) {
        try {
            created.push(await createSistemaRole({ sistema_id: sistemaId, ...r }));
        } catch (err) {
            if (err.code !== 'ER_DUP_ENTRY') throw err;
            const [rows] = await getPool().query(
                'SELECT id, sistema_id, codigo, nombre, descripcion, is_default, require_2fa FROM sistemaRoleSSO WHERE sistema_id = ? AND codigo = ?',
                [sistemaId, r.codigo]
            );
            if (rows[0]) created.push(rows[0]);
        }
    }
    return created;
}

async function updateRole2fa(roleId, require2fa) {
    await getPool().query('UPDATE roleSSO SET require_2fa = ? WHERE id = ?', [require2fa ? 1 : 0, roleId]);
}

async function getDashboardStats(owner = null) {
    const pool = getPool();

    const [[{ activeUsers }]] = await pool.query(
        'SELECT COUNT(*) AS activeUsers FROM userSSO WHERE enabled = 1'
    );

    const [[{ blockedUsers }]] = await pool.query(
        'SELECT COUNT(*) AS blockedUsers FROM userSSO WHERE enabled = 0'
    );

    const systemsSql = owner
        ? 'SELECT COUNT(*) AS systems FROM sistemaSSO WHERE owner = ? AND enabled = 1'
        : 'SELECT COUNT(*) AS systems FROM sistemaSSO WHERE enabled = 1';
    const [[systemsRow]] = await pool.query(systemsSql, owner ? [owner] : []);
    const systemsCount = systemsRow.systems;

    const linksSql = owner
        ? `SELECT COUNT(*) AS links FROM userSSO_sistema us
           JOIN sistemaSSO s ON s.id = us.sistema_id
           WHERE s.owner = ?`
        : 'SELECT COUNT(*) AS links FROM userSSO_sistema';
    const [[{ links }]] = await pool.query(linksSql, owner ? [owner] : []);

    let usersWithoutSql;
    let usersWithoutParams;
    if (owner) {
        usersWithoutSql = `
            SELECT u.user, u.name, u.last_name, u.email, u.rol, r.nombre AS rol_nombre
            FROM userSSO u
            JOIN roleSSO r ON r.id = u.rol
            WHERE u.enabled = 1
              AND u.user NOT IN (
                  SELECT us.user FROM userSSO_sistema us
                  JOIN sistemaSSO s ON s.id = us.sistema_id
                  WHERE s.owner = ?
              )
            ORDER BY u.user
            LIMIT 10`;
        usersWithoutParams = [owner];
    } else {
        usersWithoutSql = `
            SELECT u.user, u.name, u.last_name, u.email, u.rol, r.nombre AS rol_nombre
            FROM userSSO u
            JOIN roleSSO r ON r.id = u.rol
            WHERE u.enabled = 1
              AND NOT EXISTS (SELECT 1 FROM userSSO_sistema us WHERE us.user = u.user)
            ORDER BY u.user
            LIMIT 10`;
        usersWithoutParams = [];
    }

    const [usersWithoutSystem] = await pool.query(usersWithoutSql, usersWithoutParams);

    const [[{ usersWithoutCount }]] = await pool.query(
        owner
            ? `SELECT COUNT(*) AS usersWithoutCount FROM userSSO u
               WHERE u.enabled = 1
                 AND u.user NOT IN (
                     SELECT us.user FROM userSSO_sistema us
                     JOIN sistemaSSO s ON s.id = us.sistema_id
                     WHERE s.owner = ?
                 )`
            : `SELECT COUNT(*) AS usersWithoutCount FROM userSSO u
               WHERE u.enabled = 1
                 AND NOT EXISTS (SELECT 1 FROM userSSO_sistema us WHERE us.user = u.user)`,
        owner ? [owner] : []
    );

    const systemsSql2 = owner
        ? `SELECT s.id, s.client_id, s.nombre, s.owner, s.enabled,
                  COUNT(us.user) AS user_count
           FROM sistemaSSO s
           LEFT JOIN userSSO_sistema us ON us.sistema_id = s.id
           WHERE s.owner = ?
           GROUP BY s.id, s.client_id, s.nombre, s.owner, s.enabled
           ORDER BY user_count DESC, s.nombre`
        : `SELECT s.id, s.client_id, s.nombre, s.owner, s.enabled,
                  COUNT(us.user) AS user_count
           FROM sistemaSSO s
           LEFT JOIN userSSO_sistema us ON us.sistema_id = s.id
           GROUP BY s.id, s.client_id, s.nombre, s.owner, s.enabled
           ORDER BY user_count DESC, s.nombre`;

    const [systemsWithUsers] = await pool.query(systemsSql2, owner ? [owner] : []);

    const [recentUsers] = await pool.query(
        `SELECT u.user, u.name, u.last_name, u.rol, r.nombre AS rol_nombre, u.enabled, u.created_at
         FROM userSSO u
         JOIN roleSSO r ON r.id = u.rol
         ORDER BY u.created_at DESC
         LIMIT 5`
    );

    return {
        activeUsers,
        blockedUsers,
        systems: systemsCount,
        links,
        usersWithoutCount,
        usersWithoutSystem,
        systemsWithUsers,
        recentUsers,
    };
}

let _auditTableReady = false;

async function ensureAuditTable() {
    if (_auditTableReady) return;
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS auditSSO (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            sistema_id INT NOT NULL,
            actor_user VARCHAR(100) NOT NULL,
            actor_rol TINYINT NULL,
            accion VARCHAR(120) NOT NULL,
            metodo VARCHAR(10) NOT NULL,
            ruta VARCHAR(500) NOT NULL,
            detalle JSON NULL,
            ip VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_auditSSO_sistema_fecha (sistema_id, created_at),
            KEY idx_auditSSO_actor_fecha (actor_user, created_at),
            CONSTRAINT fk_auditSSO_sistema FOREIGN KEY (sistema_id)
                REFERENCES sistemaSSO (id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    _auditTableReady = true;
}

async function logAudit({ sistema_id, actor_user, actor_rol, accion, metodo, ruta, detalle, ip }) {
    await ensureAuditTable();
    await getPool().query(
        `INSERT INTO auditSSO
            (sistema_id, actor_user, actor_rol, accion, metodo, ruta, detalle, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            sistema_id, actor_user, actor_rol || null, accion, metodo, ruta,
            detalle ? JSON.stringify(detalle) : null, ip || null,
        ]
    );
}

async function listAudit(sistemaId, limit = 200) {
    await ensureAuditTable();
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const [rows] = await getPool().query(
        `SELECT id, sistema_id, actor_user, actor_rol, accion, metodo, ruta, detalle, ip, created_at
         FROM auditSSO
         WHERE sistema_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [sistemaId, safeLimit]
    );
    return rows.map((row) => {
        if (typeof row.detalle === 'string') {
            try { row.detalle = JSON.parse(row.detalle); } catch { row.detalle = null; }
        }
        return row;
    });
}

module.exports = {
    getPool,
    listRoles,
    listUsers,
    listPuestos,
    getPuesto,
    getPuestoSistemaLinks,
    setPuestoSistemas,
    applyPuestoSystemsToUser,
    applyPuestoSystemsToUsers,
    PUESTO_LINKED_BY,
    getUser,
    getUserCredentials,
    getPuestoByNombre,
    upsertUserSistemaOverride,
    userExists,
    createUser,
    updateUser,
    updatePassword,
    clearPrimerInicio,
    setPrimerInicio,
    deleteUser,
    getActiveUsersForSync,
    listSistemas,
    getSistema,
    getSistemaByClientId,
    createSistema,
    updateSistema,
    deleteSistema,
    getUserSistemaIds,
    getUserSistemas,
    getSistemaUserLinks,
    listSistemaUsers,
    searchUsersForSistema,
    addUserToSistema,
    removeUserFromSistema,
    updateUserSistemaRole,
    setUserSistemas,
    getAllUserSistemaLinks,
    getDefaultSistemaRoleId,
    listSistemaRoles,
    getSistemaRole,
    createSistemaRole,
    updateSistemaRole,
    deleteSistemaRole,
    seedDefaultSistemaRoles,
    updateRole2fa,
    getDashboardStats,
    ensureAuditTable,
    logAudit,
    listAudit,
};
