function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function appBase() {
    return (process.env.BASE_PATH || process.env.ADMIN_BASE_PATH || '').replace(/\/$/, '');
}

function href(path) {
    const base = appBase();
    if (!path.startsWith('/')) return `${base}/${path}`;
    return `${base}${path}`;
}

function navItem(path, label, active, badge) {
    const cls = active ? 'nav-item active' : 'nav-item';
    const badgeHtml = badge ? `<span class="badge-soon">${escapeHtml(badge)}</span>` : '';
    return `<a href="${href(path)}" class="${cls}"><span>${escapeHtml(label)}</span>${badgeHtml}</a>`;
}

function renderLayout({ title, activePage, userInfo, appUser, content, extraScripts = '' }) {
    const username = escapeHtml(userInfo.preferred_username || userInfo.sub);
    const name = escapeHtml(
        [userInfo.given_name, userInfo.family_name].filter(Boolean).join(' ') || username
    );
    const rolLabel = escapeHtml(appUser?.rol_nombre || '');
    const isAdmin = Number(appUser?.rol) === 1;
    const base = appBase();

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MOBO SSO — ${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${href('/css/admin.css')}?v=38">
    <script>window.__APP_BASE__=${JSON.stringify(base)};</script>
</head>
<body data-rol="${appUser?.rol || ''}" data-is-admin="${isAdmin ? '1' : '0'}">
    <div class="layout">
        <aside class="sidebar">
            <div class="sidebar-brand">
                <h2>MOBO SSO</h2>
                <span>Consola de administración</span>
            </div>
            <nav class="sidebar-nav">
                <div class="nav-main">
                    ${navItem('/', 'Dashboard', activePage === 'dashboard')}
                    ${navItem('/usuarios', 'Usuarios', activePage === 'usuarios')}
                    ${isAdmin ? navItem('/puestos', 'Puestos', activePage === 'puestos') : ''}
                    ${isAdmin ? navItem('/roles', 'Roles', activePage === 'roles') : ''}
                    ${isAdmin ? navItem('/monitoreo', 'Monitoreo', activePage === 'monitoreo') : ''}
                    ${navItem('/sistemas', 'Sistemas', activePage === 'sistemas')}
                </div>
                <div class="nav-footer">
                    ${navItem('/ayuda', 'Ayuda', activePage === 'ayuda')}
                    ${navItem('/docs', 'Docs / Seeders', activePage === 'docs')}
                </div>
            </nav>
        </aside>
        <div class="main">
            <header class="topbar">
                <div class="topbar-user">Sesión: <strong>${name}</strong> (${username}) — ${rolLabel}</div>
                <a href="${href('/logout')}" class="btn-logout">Cerrar sesión</a>
            </header>
            <main class="content">${content}</main>
        </div>
    </div>
    ${extraScripts}
</body>
</html>`;
}

function renderLoginPage() {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MOBO SSO — Consola Admin</title>
    <link rel="stylesheet" href="${href('/css/admin.css')}?v=23">
    <script>window.__APP_BASE__=${JSON.stringify(appBase())};</script>
</head>
<body>
    <div class="login-page">
        <div class="login-card">
            <h1>Consola de Administración</h1>
            <p>Gestión centralizada de usuarios, roles y sistemas SSO de MOBO.</p>
            <a href="${href('/login')}" class="btn-primary">Iniciar sesión</a>
        </div>
    </div>
</body>
</html>`;
}

module.exports = { escapeHtml, renderLayout, renderLoginPage, href, appBase };
