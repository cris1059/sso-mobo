/**
 * Sincroniza UUIDs de Keycloak, roles access y enforcement de login por sistema.
 * Uso: node scripts/sync-all-access.js
 */
const path = require('path');
const adminPortalDir = path.join(__dirname, '../admin-portal');
module.paths.push(path.join(adminPortalDir, 'node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(adminPortalDir, '.env'), override: true });

const db = require(path.join(adminPortalDir, 'services/db'));
const kcAccess = require(path.join(adminPortalDir, 'services/keycloak-access'));
const kcEnforcement = require(path.join(adminPortalDir, 'services/keycloak-enforcement'));

async function syncKcUuids() {
    const sistemas = await db.listSistemas();
    let updated = 0;
    for (const s of sistemas) {
        if (s.kc_client_uuid) continue;
        const uuid = await kcAccess.getClientUuid(s.client_id);
        if (uuid) {
            await db.updateSistema(s.id, { kc_client_uuid: uuid });
            await kcAccess.ensureAccessRole(uuid);
            updated++;
            console.log(`  UUID ${s.client_id} -> ${uuid}`);
        }
    }
    return updated;
}

async function main() {
    console.log('Sincronizando acceso por sistema...');

    const uuids = await syncKcUuids();
    console.log(`UUIDs actualizados: ${uuids}`);

    const accessUsers = await kcAccess.syncAllSistemaAccess(
        db.getAllUserSistemaLinks,
        () => db.listSistemas()
    );
    console.log(`Usuarios con acceso sincronizados: ${accessUsers}`);

    const enforced = await kcEnforcement.enforceAllClients(() => db.listSistemas());
    console.log(`Clientes con enforcement de login: ${enforced}`);

    console.log('Listo.');
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
