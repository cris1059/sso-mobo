const { kcRequest } = require('./keycloak-admin');
const kcAccess = require('./keycloak-access');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const ACCESS_ROLE = kcAccess.ACCESS_ROLE;

async function getClientUuid(clientId) {
    return kcAccess.getClientUuid(clientId);
}

async function flowExists(alias) {
    try {
        await kcRequest('GET', `/realms/${APPS_REALM}/authentication/flows/${alias}`);
        return true;
    } catch {
        return false;
    }
}

async function ensureBrowserAccessFlow(clientId) {
    const flowAlias = `browser-access-${clientId}`;
    if (!(await flowExists(flowAlias))) {
        try {
            await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/browser/copy`, {
                newName: flowAlias,
            });
        } catch (err) {
            if (!String(err.message).toLowerCase().includes('already exists')) {
                throw err;
            }
        }
    }

    const executions = await kcRequest(
        'GET',
        `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions`
    );

    const hasCondition = executions.some(
        (e) => e.providerId === 'client-role' || e.displayName?.includes('Client Role')
    );

    if (!hasCondition) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions/execution`,
            { provider: 'client-role' }
        );

        const updated = await kcRequest(
            'GET',
            `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions`
        );
        const roleExec = updated.find((e) => e.providerId === 'client-role');
        if (roleExec) {
            await kcRequest('PUT', `/realms/${APPS_REALM}/authentication/executions/${roleExec.id}`, {
                requirement: 'REQUIRED',
            });
            await kcRequest('POST', `/realms/${APPS_REALM}/authentication/executions/${roleExec.id}/config`, {
                alias: `access-${clientId}`,
                config: {
                    clientId,
                    role: ACCESS_ROLE,
                },
            });
        }
    }

    return flowAlias;
}

async function bindClientBrowserFlow(clientId, flowAlias) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) throw new Error(`Cliente ${clientId} no encontrado en Keycloak`);

    const client = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}`);
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${clientUuid}`, {
        ...client,
        authenticationFlowBindingOverrides: {
            ...(client.authenticationFlowBindingOverrides || {}),
            browser: flowAlias,
        },
    });
}

async function ensureClientLoginEnforcement(clientId) {
    await kcAccess.ensureAccessRole(await getClientUuid(clientId));
    const flowAlias = await ensureBrowserAccessFlow(clientId);
    await bindClientBrowserFlow(clientId, flowAlias);
}

async function enforceAllClients(getSistemasFn) {
    const sistemas = await getSistemasFn();
    let count = 0;
    for (const s of sistemas) {
        try {
            await ensureClientLoginEnforcement(s.client_id);
            count++;
        } catch (err) {
            console.warn(`  ⚠ No se pudo configurar enforcement para ${s.client_id}: ${err.message}`);
        }
    }
    return count;
}

module.exports = {
    ensureClientLoginEnforcement,
    enforceAllClients,
};
