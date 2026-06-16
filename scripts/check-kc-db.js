const mysql = require('mysql2/promise');

async function run() {
    const pool = mysql.createPool({
        host: '192.168.10.150', port: 3306,
        user: 'aec', password: '240893', database: 'keycloak'
    });

    const [realms] = await pool.query('SELECT id, name FROM REALM');
    console.log('\n=== REALMS ===');
    realms.forEach(r => console.log(' -', r.name, '(id:', r.id.substring(0,8) + '...)'));

    const [users] = await pool.query(`
        SELECT u.USERNAME, u.EMAIL, u.FIRST_NAME, u.LAST_NAME, u.ENABLED, r.NAME as REALM_NAME
        FROM USER_ENTITY u
        JOIN REALM r ON u.REALM_ID = r.ID
        ORDER BY r.NAME, u.USERNAME
    `);
    console.log('\n=== USUARIOS EN BD keycloak ===');
    users.forEach(u => console.log(
        ` [${u.REALM_NAME}] ${u.USERNAME} | ${u.EMAIL || 'sin email'} | activo: ${u.ENABLED}`
    ));

    const [roles] = await pool.query(`
        SELECT u.USERNAME, r.NAME as REALM_NAME, ro.NAME as ROL
        FROM USER_ROLE_MAPPING urm
        JOIN USER_ENTITY u ON urm.USER_ID = u.ID
        JOIN KEYCLOAK_ROLE ro ON urm.ROLE_ID = ro.ID
        JOIN REALM r ON u.REALM_ID = r.ID
        ORDER BY r.NAME, u.USERNAME
    `);
    console.log('\n=== ROLES ASIGNADOS ===');
    roles.forEach(r => console.log(` [${r.REALM_NAME}] ${r.USERNAME} → ${r.ROL}`));

    await pool.end();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
