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
        'SELECT id, nombre, descripcion FROM roleSSO ORDER BY id'
    );
    return rows;
}

async function listUsers() {
    const [rows] = await getPool().query(`
        SELECT u.user, u.name, u.last_name, u.email, u.area, u.dept, u.store,
               u.enabled, u.rol, r.nombre AS rol_nombre, u.created_at
        FROM userSSO u
        JOIN roleSSO r ON r.id = u.rol
        ORDER BY u.user
    `);
    return rows;
}

async function getUser(username) {
    const [rows] = await getPool().query(
        `SELECT u.user, u.name, u.last_name, u.email, u.area, u.dept, u.store,
                u.enabled, u.rol, r.nombre AS rol_nombre
         FROM userSSO u
         JOIN roleSSO r ON r.id = u.rol
         WHERE u.user = ?`,
        [username]
    );
    return rows[0] || null;
}

async function userExists(username) {
    const [rows] = await getPool().query('SELECT 1 FROM userSSO WHERE user = ?', [username]);
    return rows.length > 0;
}

async function createUser({ user, pass_hash, name, last_name, email, area, dept, store, enabled, rol }) {
    await getPool().query(
        `INSERT INTO userSSO (user, pass_hash, name, last_name, email, area, dept, store, enabled, rol, intrDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
        [user, pass_hash, name, last_name, email, area || '', dept || '', store || '', enabled, rol]
    );
}

async function updateUser(username, { name, last_name, email, area, dept, store, enabled, rol }) {
    await getPool().query(
        `UPDATE userSSO
         SET name = ?, last_name = ?, email = ?, area = ?, dept = ?, store = ?, enabled = ?, rol = ?
         WHERE user = ?`,
        [name, last_name, email, area || '', dept || '', store || '', enabled, rol, username]
    );
}

async function updatePassword(username, pass_hash) {
    await getPool().query('UPDATE userSSO SET pass_hash = ? WHERE user = ?', [pass_hash, username]);
}

async function deleteUser(username) {
    await getPool().query('DELETE FROM userSSO WHERE user = ?', [username]);
}

async function getActiveUsersForSync() {
    const [rows] = await getPool().query(`
        SELECT user, IFNULL(name,'') AS name, IFNULL(last_name,'') AS last_name,
               IFNULL(email,'') AS email, enabled, rol
        FROM userSSO
        WHERE enabled = 1
    `);
    return rows;
}

// ── Sistemas (sistemaSSO) ──

async function listSistemas(owner = null) {
    let sql = `SELECT id, client_id, nombre, owner, redirect_uris, web_origins,
                      kc_client_uuid, enabled, created_at
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
                kc_client_uuid, enabled, created_at
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

async function createSistema({ client_id, nombre, owner, redirectUris, web_origins, kc_client_uuid, enabled }) {
    const [result] = await getPool().query(
        `INSERT INTO sistemaSSO (client_id, nombre, owner, redirect_uris, web_origins, kc_client_uuid, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            client_id,
            nombre,
            owner || null,
            JSON.stringify(redirectUris),
            web_origins || '+',
            kc_client_uuid || null,
            enabled ?? 1,
        ]
    );
    return getSistema(result.insertId);
}

async function updateSistema(id, { nombre, redirectUris, web_origins, enabled, kc_client_uuid }) {
    const fields = [];
    const values = [];
    if (nombre !== undefined) { fields.push('nombre = ?'); values.push(nombre); }
    if (redirectUris !== undefined) { fields.push('redirect_uris = ?'); values.push(JSON.stringify(redirectUris)); }
    if (web_origins !== undefined) { fields.push('web_origins = ?'); values.push(web_origins); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled); }
    if (kc_client_uuid !== undefined) { fields.push('kc_client_uuid = ?'); values.push(kc_client_uuid); }
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
    const [rows] = await getPool().query(
        `SELECT s.id, s.client_id, s.nombre, s.owner, us.linked_by, us.created_at
         FROM userSSO_sistema us
         JOIN sistemaSSO s ON s.id = us.sistema_id
         WHERE us.user = ?
         ORDER BY s.nombre`,
        [username]
    );
    return rows;
}

async function getSistemaUserLinks(sistemaId) {
    const [rows] = await getPool().query(
        'SELECT user, linked_by, created_at FROM userSSO_sistema WHERE sistema_id = ?',
        [sistemaId]
    );
    return rows;
}

async function setUserSistemas(username, sistemaIds, linkedBy, allowedSistemaIds = null) {
    const targetIds = sistemaIds.map(Number);
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
        for (const sid of targetIds) {
            await conn.query(
                'INSERT INTO userSSO_sistema (user, sistema_id, linked_by) VALUES (?, ?, ?)',
                [username, sid, linkedBy || null]
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

async function getAllUserSistemaLinks() {
    const [rows] = await getPool().query(
        `SELECT us.user, us.sistema_id, s.client_id
         FROM userSSO_sistema us
         JOIN sistemaSSO s ON s.id = us.sistema_id`
    );
    return rows;
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

module.exports = {
    getPool,
    listRoles,
    listUsers,
    getUser,
    userExists,
    createUser,
    updateUser,
    updatePassword,
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
    setUserSistemas,
    getAllUserSistemaLinks,
    getDashboardStats,
};
