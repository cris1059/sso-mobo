const { kcRequest } = require('./keycloak-admin');
const kcAccess = require('./keycloak-access');

const APPS_REALM = process.env.KC_REALM || 'mobo';
const STEP_UP_ACR = 'mobo-2fa';
const STEP_UP_LOA = 2;

async function ensureRealmAcrMapping() {
    const realm = await kcRequest('GET', `/realms/${APPS_REALM}`);
    const attributes = { ...(realm.attributes || {}) };
    let mapping = {};
    try {
        mapping = JSON.parse(attributes['acr.loa.map'] || '{}');
    } catch {
        mapping = {};
    }
    if (Number(mapping[STEP_UP_ACR]) === STEP_UP_LOA) return false;
    mapping[STEP_UP_ACR] = STEP_UP_LOA;
    attributes['acr.loa.map'] = JSON.stringify(mapping);
    await kcRequest('PUT', `/realms/${APPS_REALM}`, { attributes });
    return true;
}
const ACCESS_ROLE = kcAccess.ACCESS_ROLE;

async function getClientUuid(clientId) {
    return kcAccess.getClientUuid(clientId);
}

async function listFlows() {
    return kcRequest('GET', `/realms/${APPS_REALM}/authentication/flows`);
}

async function flowExists(alias) {
    const flows = await listFlows();
    return (flows || []).some((f) => f.alias === alias);
}

async function getFlowByAlias(alias) {
    const flows = await listFlows();
    return (flows || []).find((f) => f.alias === alias) || null;
}

async function deleteFlow(alias) {
    const flow = await getFlowByAlias(alias);
    if (!flow) return;
    await kcRequest('DELETE', `/realms/${APPS_REALM}/authentication/flows/${flow.id}`);
}

async function getFlowExecutions(flowAlias) {
    return kcRequest('GET', `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions`);
}

async function setExecutionRequirement(flowAlias, execution, requirement) {
    await kcRequest('PUT', `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions`, {
        ...execution,
        requirement,
    });
}

async function findExecution(flowAlias, predicate) {
    const executions = await getFlowExecutions(flowAlias);
    return (executions || []).find(predicate) || null;
}

async function getInteractiveFormsAlias(flowAlias) {
    const loginAlias = `${flowAlias}-login`;
    const formsAlias = `${flowAlias}-forms`;
    const loginExec = await findExecution(
        flowAlias,
        (e) => e.displayName === loginAlias || e.alias === loginAlias
    );
    if (!loginExec) return flowAlias;

    const formsExec = await findExecution(
        loginAlias,
        (e) => e.displayName === formsAlias || e.alias === formsAlias
    );
    return formsExec ? formsAlias : flowAlias;
}

/**
 * Estructura compatible con Keycloak 25 (sin plugins):
 *   browser-access-{clientId}          (top-level)
 *     {alias}-login                    REQUIRED  (cookie | idp | forms)
 *       {alias}-forms                  ALTERNATIVE
 *         username/password            REQUIRED
 *         OTP condicional              (solo en login interactivo)
 *     {alias}-access-check             CONDITIONAL
 *       conditional-user-role          REQUIRED  (negate: sin rol clientId.access)
 *       deny-access-authenticator      REQUIRED
 */
async function buildBrowserAccessFlow(clientId) {
    const flowAlias = `browser-access-${clientId}`;
    const loginAlias = `${flowAlias}-login`;
    const formsAlias = `${flowAlias}-forms`;
    const accessAlias = `${flowAlias}-access-check`;

    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows`, {
        alias: flowAlias,
        description: `Browser con enforcement de rol access para ${clientId}`,
        providerId: 'basic-flow',
        topLevel: true,
        builtIn: false,
    });

    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions/flow`, {
        alias: loginAlias,
        type: 'basic-flow',
        description: 'Autenticación (cookie / idp / forms)',
    });
    let loginExec = await findExecution(flowAlias, (e) => e.displayName === loginAlias || e.alias === loginAlias);
    if (loginExec) await setExecutionRequirement(flowAlias, loginExec, 'REQUIRED');

    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${loginAlias}/executions/execution`, {
        provider: 'auth-cookie',
    });
    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${loginAlias}/executions/execution`, {
        provider: 'identity-provider-redirector',
    });
    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${loginAlias}/executions/flow`, {
        alias: formsAlias,
        type: 'basic-flow',
        description: 'Username/password forms',
    });

    for (const exec of (await getFlowExecutions(loginAlias)) || []) {
        if (
            exec.providerId === 'auth-cookie' ||
            exec.providerId === 'identity-provider-redirector' ||
            exec.displayName === formsAlias ||
            exec.alias === formsAlias
        ) {
            await setExecutionRequirement(loginAlias, exec, 'ALTERNATIVE');
        }
    }

    await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${formsAlias}/executions/execution`, {
        provider: 'auth-username-password-form',
    });
    const pwdExec = await findExecution(formsAlias, (e) => e.providerId === 'auth-username-password-form');
    if (pwdExec) await setExecutionRequirement(formsAlias, pwdExec, 'REQUIRED');

    await ensureAccessDenyCheck(flowAlias, accessAlias, clientId);
    return flowAlias;
}

async function ensureAccessDenyCheck(flowAlias, accessAlias, clientId) {
    let accessExec = await findExecution(
        flowAlias,
        (e) => e.displayName === accessAlias || e.alias === accessAlias
    );

    if (!accessExec) {
        await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions/flow`, {
            alias: accessAlias,
            type: 'basic-flow',
            description: `Denegar si el usuario no tiene rol ${clientId}.${ACCESS_ROLE}`,
        });
        accessExec = await findExecution(
            flowAlias,
            (e) => e.displayName === accessAlias || e.alias === accessAlias
        );
    }
    if (accessExec && accessExec.requirement !== 'CONDITIONAL') {
        await setExecutionRequirement(flowAlias, accessExec, 'CONDITIONAL');
    }

    let condExec = await findExecution(accessAlias, (e) => e.providerId === 'conditional-user-role');
    if (!condExec) {
        await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${accessAlias}/executions/execution`, {
            provider: 'conditional-user-role',
        });
        condExec = await findExecution(accessAlias, (e) => e.providerId === 'conditional-user-role');
    }
    if (condExec) {
        if (condExec.requirement !== 'REQUIRED') {
            await setExecutionRequirement(accessAlias, condExec, 'REQUIRED');
        }
        if (!condExec.authenticationConfig) {
            await kcRequest('POST', `/realms/${APPS_REALM}/authentication/executions/${condExec.id}/config`, {
                alias: `no-access-${clientId}`,
                config: {
                    condUserRole: `${clientId}.${ACCESS_ROLE}`,
                    negate: 'true',
                },
            });
        }
    }

    let denyExec = await findExecution(accessAlias, (e) => e.providerId === 'deny-access-authenticator');
    if (!denyExec) {
        await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${accessAlias}/executions/execution`, {
            provider: 'deny-access-authenticator',
        });
        denyExec = await findExecution(accessAlias, (e) => e.providerId === 'deny-access-authenticator');
    }
    if (denyExec && denyExec.requirement !== 'REQUIRED') {
        await setExecutionRequirement(accessAlias, denyExec, 'REQUIRED');
    }
}

async function flowHasNativeAccessCheck(flowAlias, clientId) {
    const accessAlias = `${flowAlias}-access-check`;
    const accessExec = await findExecution(
        flowAlias,
        (e) => e.displayName === accessAlias || e.alias === accessAlias
    );
    if (!accessExec) return false;
    const cond = await findExecution(accessAlias, (e) => e.providerId === 'conditional-user-role');
    const deny = await findExecution(accessAlias, (e) => e.providerId === 'deny-access-authenticator');
    return Boolean(cond && deny);
}

/** Flujos copiados del browser mezclan ALTERNATIVE en top-level; no sirven con CONDITIONAL. */
async function flowNeedsRebuild(flowAlias) {
    const executions = await getFlowExecutions(flowAlias);
    const topLevel = (executions || []).filter((e) => e.level === 0);
    const hasAlt = topLevel.some((e) => e.requirement === 'ALTERNATIVE');
    const hasLoginWrapper = topLevel.some(
        (e) => e.displayName === `${flowAlias}-login` || e.alias === `${flowAlias}-login`
    );
    const hasMisplacedOtp = topLevel.some(
        (e) =>
            e.providerId === 'auth-otp-form' ||
            String(e.displayName || e.alias || '').startsWith(`${flowAlias}-otp-`)
    );
    return (hasAlt && !hasLoginWrapper) || hasMisplacedOtp;
}

async function unbindClientBrowserFlow(clientId) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) return;
    const client = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}`);
    const overrides = { ...(client.authenticationFlowBindingOverrides || {}) };
    if (!overrides.browser) return;
    delete overrides.browser;
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${clientUuid}`, {
        ...client,
        authenticationFlowBindingOverrides: overrides,
    });
}

async function ensureBrowserAccessFlow(clientId) {
    const flowAlias = `browser-access-${clientId}`;
    const accessAlias = `${flowAlias}-access-check`;

    if (await flowExists(flowAlias)) {
        if (await flowNeedsRebuild(flowAlias)) {
            await unbindClientBrowserFlow(clientId);
            await deleteFlow(flowAlias);
            return buildBrowserAccessFlow(clientId);
        }
        if (!(await flowHasNativeAccessCheck(flowAlias, clientId))) {
            await ensureAccessDenyCheck(flowAlias, accessAlias, clientId);
        }
        return flowAlias;
    }

    return buildBrowserAccessFlow(clientId);
}

async function ensureOtpExecution(flowAlias, requirement = 'REQUIRED') {
    const targetAlias = await getInteractiveFormsAlias(flowAlias);

    const otpExec = await findExecution(targetAlias, (e) => e.providerId === 'auth-otp-form');
    if (otpExec) {
        if (otpExec.requirement !== requirement) {
            await setExecutionRequirement(targetAlias, otpExec, requirement);
        }
        return;
    }

    await kcRequest(
        'POST',
        `/realms/${APPS_REALM}/authentication/flows/${targetAlias}/executions/execution`,
        { provider: 'auth-otp-form' }
    );

    const newOtp = await findExecution(targetAlias, (e) => e.providerId === 'auth-otp-form');
    if (newOtp) await setExecutionRequirement(targetAlias, newOtp, requirement);
}

async function removeOtpExecution(flowAlias) {
    const targetAlias = await getInteractiveFormsAlias(flowAlias);
    const aliases = targetAlias === flowAlias ? [flowAlias] : [targetAlias, flowAlias];
    for (const alias of aliases) {
        const otpExec = await findExecution(alias, (e) => e.providerId === 'auth-otp-form');
        if (otpExec) {
            await kcRequest('DELETE', `/realms/${APPS_REALM}/authentication/executions/${otpExec.id}`);
        }
    }
}

async function ensureRoleOtpCondition(flowAlias, roleName) {
    const parentAlias = await getInteractiveFormsAlias(flowAlias);
    const subAlias = `${flowAlias}-otp-${roleName}`;
    let subFlow = await findExecution(
        parentAlias,
        (e) => e.displayName === subAlias || e.alias === subAlias
    );

    if (!subFlow) {
        await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${parentAlias}/executions/flow`, {
            alias: subAlias,
            type: 'basic-flow',
            description: `OTP condicional para rol ${roleName}`,
        });

        subFlow = await findExecution(parentAlias, (e) => e.displayName === subAlias || e.alias === subAlias);
    }

    if (!subFlow) return;

    if (subFlow.requirement !== 'CONDITIONAL') {
        await setExecutionRequirement(parentAlias, subFlow, 'CONDITIONAL');
    }

    let condExec = await findExecution(subAlias, (e) => e.providerId === 'conditional-user-role');
    if (!condExec) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${subAlias}/executions/execution`,
            { provider: 'conditional-user-role' }
        );
        condExec = await findExecution(subAlias, (e) => e.providerId === 'conditional-user-role');
    }

    if (condExec) {
        if (condExec.requirement !== 'REQUIRED') {
            await setExecutionRequirement(subAlias, condExec, 'REQUIRED');
        }
        if (!condExec.authenticationConfig) {
            await kcRequest('POST', `/realms/${APPS_REALM}/authentication/executions/${condExec.id}/config`, {
                alias: `role-${roleName}`,
                config: { condUserRole: roleName },
            });
        }
    }

    let otpExec = await findExecution(subAlias, (e) => e.providerId === 'auth-otp-form');
    if (!otpExec) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${subAlias}/executions/execution`,
            { provider: 'auth-otp-form' }
        );
        otpExec = await findExecution(subAlias, (e) => e.providerId === 'auth-otp-form');
    }

    if (otpExec && otpExec.requirement !== 'REQUIRED') {
        await setExecutionRequirement(subAlias, otpExec, 'REQUIRED');
    }
}

async function removeUnexpectedRoleOtpConditions(flowAlias, allowedRoleNames = []) {
    const parentAlias = await getInteractiveFormsAlias(flowAlias);
    const prefix = `${flowAlias}-otp-`;
    const allowedAliases = new Set(
        allowedRoleNames.filter(Boolean).map((roleName) => `${prefix}${roleName}`)
    );
    const executions = await getFlowExecutions(parentAlias);
    const obsoleteExecutions = (executions || []).filter((execution) => {
        const alias = execution.displayName || execution.alias || '';
        return alias.startsWith(prefix) && !allowedAliases.has(alias);
    });

    for (const execution of obsoleteExecutions) {
        await kcRequest(
            'DELETE',
            `/realms/${APPS_REALM}/authentication/executions/${execution.id}`
        );
    }
}

async function ensureClientOtpStepUp(flowAlias, clientId) {
    const subAlias = `${flowAlias}-client-step-up`;
    let subFlow = await findExecution(
        flowAlias,
        (execution) => execution.displayName === subAlias || execution.alias === subAlias
    );

    if (!subFlow) {
        await kcRequest('POST', `/realms/${APPS_REALM}/authentication/flows/${flowAlias}/executions/flow`, {
            alias: subAlias,
            type: 'basic-flow',
            description: `OTP step-up para ${clientId}.${kcAccess.OTP_REQUIRED_ROLE}`,
        });
        subFlow = await findExecution(
            flowAlias,
            (execution) => execution.displayName === subAlias || execution.alias === subAlias
        );
    }
    if (!subFlow) return;

    if (subFlow.requirement !== 'CONDITIONAL') {
        await setExecutionRequirement(flowAlias, subFlow, 'CONDITIONAL');
    }

    let roleCondition = await findExecution(
        subAlias,
        (execution) => execution.providerId === 'conditional-user-role'
    );
    if (!roleCondition) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${subAlias}/executions/execution`,
            { provider: 'conditional-user-role' }
        );
        roleCondition = await findExecution(
            subAlias,
            (execution) => execution.providerId === 'conditional-user-role'
        );
    }
    if (roleCondition) {
        if (roleCondition.requirement !== 'REQUIRED') {
            await setExecutionRequirement(subAlias, roleCondition, 'REQUIRED');
        }
        if (!roleCondition.authenticationConfig) {
            await kcRequest(
                'POST',
                `/realms/${APPS_REALM}/authentication/executions/${roleCondition.id}/config`,
                {
                    alias: `client-otp-role-${clientId}`,
                    config: { condUserRole: `${clientId}.${kcAccess.OTP_REQUIRED_ROLE}` },
                }
            );
        }
    }

    let loaCondition = await findExecution(
        subAlias,
        (execution) => execution.providerId === 'conditional-level-of-authentication'
    );
    if (!loaCondition) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${subAlias}/executions/execution`,
            { provider: 'conditional-level-of-authentication' }
        );
        loaCondition = await findExecution(
            subAlias,
            (execution) => execution.providerId === 'conditional-level-of-authentication'
        );
    }
    if (loaCondition) {
        if (loaCondition.requirement !== 'REQUIRED') {
            await setExecutionRequirement(subAlias, loaCondition, 'REQUIRED');
        }
        if (!loaCondition.authenticationConfig) {
            await kcRequest(
                'POST',
                `/realms/${APPS_REALM}/authentication/executions/${loaCondition.id}/config`,
                {
                    alias: `client-otp-loa-${clientId}`,
                    config: {
                        'loa-condition-level': String(STEP_UP_LOA),
                        'loa-max-age': '36000',
                    },
                }
            );
        }
    }

    let otpExecution = await findExecution(
        subAlias,
        (execution) => execution.providerId === 'auth-otp-form'
    );
    if (!otpExecution) {
        await kcRequest(
            'POST',
            `/realms/${APPS_REALM}/authentication/flows/${subAlias}/executions/execution`,
            { provider: 'auth-otp-form' }
        );
        otpExecution = await findExecution(
            subAlias,
            (execution) => execution.providerId === 'auth-otp-form'
        );
    }
    if (otpExecution && otpExecution.requirement !== 'REQUIRED') {
        await setExecutionRequirement(subAlias, otpExecution, 'REQUIRED');
    }
}

async function bindClientBrowserFlow(clientId, flowAlias) {
    const clientUuid = await getClientUuid(clientId);
    if (!clientUuid) throw new Error(`Cliente ${clientId} no encontrado en Keycloak`);

    const flow = await getFlowByAlias(flowAlias);
    if (!flow?.id) throw new Error(`Flujo ${flowAlias} no encontrado en Keycloak`);

    // Keycloak guarda el UUID interno del flujo, no el alias.
    const client = await kcRequest('GET', `/realms/${APPS_REALM}/clients/${clientUuid}`);
    await kcRequest('PUT', `/realms/${APPS_REALM}/clients/${clientUuid}`, {
        ...client,
        authenticationFlowBindingOverrides: {
            ...(client.authenticationFlowBindingOverrides || {}),
            browser: flow.id,
        },
    });
}

async function ensureClientLoginEnforcement(clientId, { require2fa = false, rolesRequiring2fa = [] } = {}) {
    await ensureRealmAcrMapping();
    await kcAccess.ensureAccessRole(await getClientUuid(clientId));
    const flowAlias = await ensureBrowserAccessFlow(clientId);
    const allowedRoleNames = rolesRequiring2fa.map((role) => role.nombre).filter(Boolean);

    if (require2fa) {
        await ensureOtpExecution(flowAlias, 'REQUIRED');
    } else {
        await removeOtpExecution(flowAlias);
    }

    await removeUnexpectedRoleOtpConditions(flowAlias, allowedRoleNames);
    await ensureClientOtpStepUp(flowAlias, clientId);

    for (const role of rolesRequiring2fa) {
        if (role.nombre) {
            await ensureRoleOtpCondition(flowAlias, role.nombre);
        }
    }

    await bindClientBrowserFlow(clientId, flowAlias);
}

async function enforceAllClients(getSistemasFn, getRolesFn) {
    const sistemas = await getSistemasFn();
    const roles = await getRolesFn ? await getRolesFn() : [];
    const rolesRequiring2fa = roles.filter((r) => Number(r.require_2fa) === 1);

    let count = 0;
    for (const s of sistemas) {
        try {
            const systemRequires2fa = Number(s.require_2fa) === 1;
            // Los roles globales Admin/developAdmin solo protegen la consola SSO.
            // Las aplicaciones usan su client role otp_required para solicitar step-up.
            const usesGlobalAdminRoles = s.client_id === 'admin-portal';
            await ensureClientLoginEnforcement(s.client_id, {
                require2fa: systemRequires2fa,
                rolesRequiring2fa:
                    systemRequires2fa || !usesGlobalAdminRoles ? [] : rolesRequiring2fa,
            });
            count++;
        } catch (err) {
            console.warn(`  ⚠ No se pudo configurar enforcement para ${s.client_id}: ${err.message}`);
        }
    }
    return count;
}

module.exports = {
    STEP_UP_ACR,
    STEP_UP_LOA,
    ensureRealmAcrMapping,
    ensureClientLoginEnforcement,
    enforceAllClients,
};
