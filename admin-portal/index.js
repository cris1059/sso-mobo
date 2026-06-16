const express = require('express');
const session = require('express-session');
const path = require('path');
const { Issuer, generators } = require('openid-client');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const { requireAuth } = require('./middleware/auth');
const { canAccessPanel } = require('./middleware/permissions');
const db = require('./services/db');
const pages = require('./lib/pages');
const usersApi = require('./routes/api/users');
const rolesApi = require('./routes/api/roles');
const systemsApi = require('./routes/api/systems');
const dashboardApi = require('./routes/api/dashboard');

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'fallback-secret',
        resave: false,
        saveUninitialized: false,
    })
);

let oidcClient;

async function setupKeycloak() {
    try {
        const issuer = await Issuer.discover(process.env.KEYCLOAK_URL);
        oidcClient = new issuer.Client({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uris: [process.env.REDIRECT_URL],
            response_types: ['code'],
        });
        console.log('✅ Keycloak configurado (realm mobo — login consola admin)');
    } catch (error) {
        console.error('❌ Error configurando Keycloak:', error.message);
    }
}

setupKeycloak();

// ── Auth routes ──

app.get('/login', (req, res) => {
    if (!oidcClient) {
        return res.status(503).send('Keycloak no está listo. Levanta Docker y ejecuta register-admin-portal-client.ps1');
    }
    const nonce = generators.nonce();
    const state = generators.state();
    req.session.nonce = nonce;
    req.session.state = state;
    res.redirect(oidcClient.authorizationUrl({ scope: 'openid profile email', state, nonce }));
});

app.get('/callback', async (req, res) => {
    if (!oidcClient) return res.status(503).send('Keycloak no está listo.');
    try {
        const params = oidcClient.callbackParams(req);
        const tokenSet = await oidcClient.callback(process.env.REDIRECT_URL, params, {
            nonce: req.session.nonce,
            state: req.session.state,
        });
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
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error de autenticación: ' + error.message);
    }
});

app.get('/logout', (req, res) => {
    if (!oidcClient || !req.session.tokenSet) {
        req.session.destroy();
        return res.redirect('/');
    }
    const logoutUrl = oidcClient.endSessionUrl({
        id_token_hint: req.session.tokenSet.id_token,
        post_logout_redirect_uri: `http://localhost:${port}/`,
    });
    req.session.destroy();
    res.redirect(logoutUrl);
});

// ── API (protegida) ──

app.use('/api/users', requireAuth, usersApi);
app.use('/api/roles', requireAuth, rolesApi);
app.use('/api/systems', requireAuth, systemsApi);
app.use('/api/dashboard', requireAuth, dashboardApi);

function noCacheHtml(_req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
}

// ── Páginas (protegidas) ──

app.get('/', noCacheHtml, (req, res) => {
    if (!req.session.userInfo || !req.session.appUser || !canAccessPanel(req.session.appUser.rol)) {
        return res.redirect('/login');
    }
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'dashboard'));
});

app.get('/usuarios', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'usuarios'));
});

app.get('/roles', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'roles'));
});

app.get('/sistemas', noCacheHtml, requireAuth, (req, res) => {
    res.send(pages.renderPage(req.session.userInfo, req.session.appUser, 'sistemas'));
});

app.listen(port, () => {
    console.log(`🚀 Consola Admin MOBO corriendo en http://localhost:${port}`);
});
