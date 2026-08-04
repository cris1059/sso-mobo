const express = require('express');
const session = require('express-session');
const path = require('path');
const { Issuer, generators, custom } = require('openid-client');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const { requireAuth } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/audit');
const { canAccessPanel } = require('./middleware/permissions');
const db = require('./services/db');
const pages = require('./lib/pages');
const usersApi = require('./routes/api/users');
const rolesApi = require('./routes/api/roles');
const systemsApi = require('./routes/api/systems');
const puestosApi = require('./routes/api/puestos');
const dashboardApi = require('./routes/api/dashboard');
const monitoringApi = require('./routes/api/monitoring');
const seedApi = require('./routes/api/seed');
const passwordRecoveryApi = require('./routes/public/password-recovery');

const app = express();
const port = process.env.PORT || 3002;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BASE_PATH = (process.env.BASE_PATH || process.env.ADMIN_BASE_PATH || '').replace(/\/$/, '');
const publicBase = () =>
    (process.env.ADMIN_PUBLIC_URL || `http://localhost:${port}${BASE_PATH}`).replace(/\/$/, '');

// Proxy Abraham usa cert que Node no confía por defecto (p. ej. cadena incompleta / interna).
if (process.env.KC_TLS_INSECURE !== '0') {
    custom.setHttpOptionsDefaults({
        timeout: 20000,
        rejectUnauthorized: false,
    });
}

const router = express.Router();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

router.get('/downloads/SKILL.md', (_req, res) => {
    const file = path.join(__dirname, 'public', 'downloads', 'integrate-mobo-sso', 'SKILL.md');
    res.download(file, 'SKILL.md', (err) => {
        if (err && !res.headersSent) {
            res.status(404).send('SKILL.md no encontrado');
        }
    });
});

router.use(express.static(path.join(__dirname, 'public')));
router.use(
    session({
        secret: process.env.SESSION_SECRET || 'fallback-secret',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            maxAge: SESSION_MAX_AGE_MS,
            path: BASE_PATH || '/',
            // Necesario detrás de HTTPS del proxy (X-Forwarded-Proto)
            secure: publicBase().startsWith('https://') ? 'auto' : false,
            sameSite: 'lax',
        },
    })
);

let oidcClient;

async function setupKeycloak() {
    const publicIssuer = (
        process.env.KEYCLOAK_URL
        || `${(process.env.KC_PUBLIC_URL || '').replace(/\/$/, '')}/realms/mobo`
    ).replace(/\/$/, '');
    const internalIssuer = (
        process.env.KEYCLOAK_INTERNAL_URL
        || `${(process.env.KC_BASE_URL || 'http://keycloak:8080/auth').replace(/\/$/, '')}/realms/mobo`
    ).replace(/\/$/, '');

    for (let attempt = 1; attempt <= 30; attempt++) {
        try {
            // Interno para token/jwks (Docker). Issuer público = iss del id_token (KC_HOSTNAME_URL).
            // Requiere KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true en Keycloak.
            const discovered = await Issuer.discover(internalIssuer);
            const issuer = new Issuer({
                ...discovered.metadata,
                issuer: publicIssuer,
                authorization_endpoint: `${publicIssuer}/protocol/openid-connect/auth`,
                end_session_endpoint: `${publicIssuer}/protocol/openid-connect/logout`,
                token_endpoint: discovered.metadata.token_endpoint,
                userinfo_endpoint: discovered.metadata.userinfo_endpoint,
                jwks_uri: discovered.metadata.jwks_uri,
            });

            oidcClient = new issuer.Client({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                redirect_uris: [process.env.REDIRECT_URL],
                post_logout_redirect_uris: [`${publicBase()}/`],
                response_types: ['code'],
            });
            console.log('✅ Keycloak configurado (realm mobo — login consola admin)');
            console.log(`   iss esperado: ${publicIssuer}`);
            console.log(`   token:        ${issuer.metadata.token_endpoint}`);
            console.log(`   redirect:     ${process.env.REDIRECT_URL}`);
            return;
        } catch (error) {
            console.error(`❌ Keycloak no listo (intento ${attempt}/30):`, error.message);
            await new Promise((r) => setTimeout(r, 5000));
        }
    }
    console.error('❌ Keycloak no respondió tras 30 intentos:', internalIssuer);
}

setupKeycloak();

function withBase(p) {
    if (!p.startsWith('/')) return `${BASE_PATH}/${p}`;
    return `${BASE_PATH}${p}`;
}

// ── Auth routes ──

const OIDC_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const OIDC_MAX_PENDING_TRANSACTIONS = 5;

function pruneOidcTransactions(session) {
    const now = Date.now();
    const entries = Object.entries(session.oidcTransactions || {})
        .filter(([, tx]) => tx?.nonce && now - Number(tx.createdAt || 0) < OIDC_TRANSACTION_TTL_MS)
        .sort((a, b) => Number(b[1].createdAt) - Number(a[1].createdAt))
        .slice(0, OIDC_MAX_PENDING_TRANSACTIONS);
    session.oidcTransactions = Object.fromEntries(entries);
}

router.get('/login', (req, res) => {
    if (!oidcClient) {
        return res.status(503).send('Keycloak no está listo. Levanta Docker y ejecuta register-admin-portal-client.ps1');
    }
    const nonce = generators.nonce();
    const state = generators.state();
    req.session.nonce = nonce;
    req.session.state = state;
    pruneOidcTransactions(req.session);
    req.session.oidcTransactions[state] = { nonce, createdAt: Date.now() };

    const authorizationUrl = oidcClient.authorizationUrl({
        scope: 'openid profile email',
        state,
        nonce,
    });
    req.session.save((error) => {
        if (error) {
            console.error('No se pudo guardar la transacción OIDC:', error.message);
            return res.status(500).send('No se pudo iniciar la autenticación. Intenta nuevamente.');
        }
        return res.redirect(authorizationUrl);
    });
});

router.get('/callback', async (req, res) => {
    if (!oidcClient) return res.status(503).send('Keycloak no está listo.');
    try {
        const params = oidcClient.callbackParams(req);
        pruneOidcTransactions(req.session);
        const transaction = params.state
            ? req.session.oidcTransactions?.[params.state]
            : null;
        const legacyNonce = params.state === req.session.state ? req.session.nonce : null;
        const expectedNonce = transaction?.nonce || legacyNonce;

        if (!params.state || !expectedNonce) {
            console.warn('Callback OIDC obsoleto o de otra pestaña; iniciando un flujo nuevo');
            return res.redirect(withBase('/login'));
        }

        const tokenSet = await oidcClient.callback(process.env.REDIRECT_URL, params, {
            nonce: expectedNonce,
            state: params.state,
        });
        delete req.session.oidcTransactions[params.state];
        if (params.state === req.session.state) {
            delete req.session.state;
            delete req.session.nonce;
        }
        req.session.tokenSet = tokenSet;
        req.session.userInfo = await oidcClient.userinfo(tokenSet.access_token);

        const username = req.session.userInfo.preferred_username;
        const dbUser = await db.getUser(username);

        if (!dbUser) {
            req.session.destroy();
            return res.status(403).send(
                `El usuario "${username}" no existe en userSSO. Debe darse de alta en la consola o con insert-userSSO.ps1.`
            );
        }
        if (!Number(dbUser.enabled)) {
            req.session.destroy();
            return res.status(403).send('Tu cuenta está bloqueada en userSSO. Contacta al administrador.');
        }
        if (!canAccessPanel(dbUser.rol)) {
            req.session.destroy();
            return res.status(403).send(
                `Tu rol actual es "${dbUser.rol_nombre}". Solo Admin y developAdmin pueden entrar a la consola.`
            );
        }
        req.session.appUser = dbUser;
        res.redirect(withBase('/'));
    } catch (error) {
        if (/state mismatch|checks\.state argument is missing/i.test(error.message)) {
            console.warn('Transacción OIDC inválida; iniciando un flujo nuevo:', error.message);
            return res.redirect(withBase('/login'));
        }
        res.status(500).send('Error de autenticación: ' + error.message);
    }
});

router.get('/logout', (req, res) => {
    const idToken = req.session?.tokenSet?.id_token;
    const postLogout = `${publicBase()}/`;

    const redirectAway = () => {
        if (!oidcClient || !idToken) {
            return res.redirect(withBase('/'));
        }
        return res.redirect(
            oidcClient.endSessionUrl({
                id_token_hint: idToken,
                post_logout_redirect_uri: postLogout,
                client_id: process.env.CLIENT_ID,
            })
        );
    };

    if (req.session) {
        req.session.destroy(() => redirectAway());
    } else {
        redirectAway();
    }
});

router.use('/api', auditMiddleware);
router.use('/api/seed', seedApi);
router.use('/api/public/password-recovery', passwordRecoveryApi);
router.use('/api/users', requireAuth, usersApi);
router.use('/api/roles', requireAuth, rolesApi);
router.use('/api/systems', requireAuth, systemsApi);
router.use('/api/puestos', requireAuth, puestosApi);
router.use('/api/dashboard', requireAuth, dashboardApi);
router.use('/api/monitoring', requireAuth, monitoringApi);

function noCacheHtml(_req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
}

router.get('/', noCacheHtml, (req, res) => {
    if (!req.session.userInfo || !req.session.appUser || !canAccessPanel(req.session.appUser.rol)) {
        return res.redirect(withBase('/login'));
    }
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'dashboard'));
});

router.get('/usuarios', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'usuarios'));
});

router.get('/puestos', noCacheHtml, requireAuth, (req, res) => {
    if (Number(req.session.appUser?.rol) !== 1) {
        return res.redirect(withBase('/'));
    }
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'puestos'));
});

router.get('/docs', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'docs'));
});

router.get('/ayuda', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'ayuda'));
});

router.get('/roles', noCacheHtml, requireAuth, (req, res) => {
    if (Number(req.session.appUser?.rol) !== 1) {
        return res.redirect(withBase('/'));
    }
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'roles'));
});

router.get('/monitoreo', noCacheHtml, requireAuth, (req, res) => {
    if (Number(req.session.appUser?.rol) !== 1) {
        return res.redirect(withBase('/'));
    }
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'monitoreo'));
});

router.get('/sistemas', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'sistemas'));
});

router.get('/sistemas/:id', noCacheHtml, requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.redirect(withBase('/sistemas'));
    }
    res.send(pages.renderSystemDetailPage(req.session.userInfo, req.session.appUser, id));
});

if (BASE_PATH) {
    app.use(BASE_PATH, router);
    app.get('/', (_req, res) => res.redirect(`${BASE_PATH}/`));
} else {
    app.use(router);
}

app.listen(port, () => {
    console.log(`🚀 Consola Admin MOBO en http://localhost:${port}${BASE_PATH || ''}`);
});
