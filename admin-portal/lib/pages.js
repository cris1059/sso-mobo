const { renderLayout } = require('../lib/layout');

function dashboardContent() {
    return `
        <div class="page-header dashboard-header">
            <div>
                <h1>Dashboard</h1>
                <p class="page-subtitle">Resumen del ecosistema SSO MOBO.</p>
            </div>
            <div class="dashboard-status" id="kc-status">
                <span class="status-dot loading"></span>
                <span>Keycloak...</span>
            </div>
        </div>
        <div id="alert" class="alert hidden"></div>

        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-label">Usuarios activos</span>
                <span class="stat-value" id="stat-active">—</span>
                <span class="stat-hint" id="stat-blocked-hint"></span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Sistemas</span>
                <span class="stat-value" id="stat-systems">—</span>
                <span class="stat-hint">Apps conectadas al SSO</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Vínculos</span>
                <span class="stat-value" id="stat-links">—</span>
                <span class="stat-hint">Usuario ↔ sistema</span>
            </div>
            <div class="stat-card stat-card-warn">
                <span class="stat-label">Sin sistema</span>
                <span class="stat-value" id="stat-unlinked">—</span>
                <span class="stat-hint" id="stat-unlinked-hint">Usuarios activos sin acceso</span>
            </div>
        </div>

        <div class="dashboard-actions">
            <a href="/usuarios" class="btn-primary">+ Nuevo usuario</a>
            <a href="/sistemas" class="btn-secondary">+ Nuevo sistema</a>
            <button type="button" class="btn-secondary" id="btn-dashboard-sync">Sincronizar todo</button>
        </div>

        <div class="dashboard-grid">
            <section class="dashboard-panel">
                <div class="panel-header">
                    <h2>Usuarios sin acceso a sistema</h2>
                    <a href="/usuarios" class="panel-link">Ver todos</a>
                </div>
                <div class="table-card table-card-flat">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Nombre</th>
                                <th>Rol</th>
                            </tr>
                        </thead>
                        <tbody id="unlinked-tbody">
                            <tr><td colspan="3" class="loading">Cargando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="dashboard-panel">
                <div class="panel-header">
                    <h2>Sistemas y usuarios vinculados</h2>
                    <a href="/sistemas" class="panel-link">Gestionar</a>
                </div>
                <div class="table-card table-card-flat">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Sistema</th>
                                <th>Client ID</th>
                                <th>Usuarios</th>
                            </tr>
                        </thead>
                        <tbody id="systems-stats-tbody">
                            <tr><td colspan="3" class="loading">Cargando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>

        <section class="dashboard-panel">
            <div class="panel-header">
                <h2>Últimos usuarios creados</h2>
            </div>
            <div class="table-card table-card-flat">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Alta</th>
                        </tr>
                    </thead>
                    <tbody id="recent-tbody">
                        <tr><td colspan="5" class="loading">Cargando...</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
        <script src="/js/admin.js?v=2"></script>`;
}

function usuariosContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Usuarios</h1>
                <p class="page-subtitle">Catálogo maestro en <code>userSSO</code> — se sincroniza automáticamente a Keycloak.</p>
            </div>
            <div class="page-actions">
                <button type="button" class="btn-secondary" id="btn-sync">Sincronizar todo</button>
                <button type="button" class="btn-primary" id="btn-new-user">+ Nuevo usuario</button>
            </div>
        </div>
        <div id="alert" class="alert hidden"></div>
        <div class="table-card">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="6" class="loading">Cargando...</td></tr>
                </tbody>
            </table>
        </div>
        <div id="modal" class="modal hidden">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-card modal-user">
                <h2 id="modal-title">Nuevo usuario</h2>
                <form id="user-form" class="modal-form">
                    <input type="hidden" id="edit-mode" value="create">
                    <div class="modal-body">
                        <div class="form-grid form-grid-3">
                            <label>Usuario / No. empleado *
                                <input type="text" id="f-user" required>
                            </label>
                            <label>Contraseña <span id="pw-hint">*</span>
                                <input type="password" id="f-password">
                            </label>
                            <label>Estado
                                <select id="f-enabled">
                                    <option value="1">Activo</option>
                                    <option value="0">Bloqueado</option>
                                </select>
                            </label>
                            <label>Nombre *
                                <input type="text" id="f-name" required>
                            </label>
                            <label>Apellido *
                                <input type="text" id="f-lastname" required>
                            </label>
                            <label>Correo *
                                <input type="email" id="f-email" required>
                            </label>
                            <label id="rol-field">Rol *
                                <select id="f-rol" required></select>
                            </label>
                            <label>Área
                                <input type="text" id="f-area">
                            </label>
                            <label>Departamento
                                <input type="text" id="f-dept">
                            </label>
                        </div>
                        <div class="sistemas-link-section">
                            <h3>Sistemas vinculados</h3>
                            <p class="section-hint">El usuario solo podrá acceder a los sistemas marcados.</p>
                            <div id="sistemas-checkboxes" class="checkbox-grid"></div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" data-close>Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
        <script src="/js/admin.js?v=2"></script>`;
}

function rolesContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Roles</h1>
                <p class="page-subtitle">Catálogo de roles del sistema SSO (<code>roleSSO</code>).</p>
            </div>
        </div>
        <div class="table-card">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Acceso</th>
                    </tr>
                </thead>
                <tbody id="roles-tbody">
                    <tr><td colspan="4" class="loading">Cargando...</td></tr>
                </tbody>
            </table>
        </div>
        <script src="/js/admin.js?v=2"></script>`;
}

function sistemasContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Sistemas</h1>
                <p class="page-subtitle">Clientes OIDC registrados en Keycloak (realm <code>mobo</code>) — aplicaciones conectadas al SSO.</p>
            </div>
            <div class="page-actions">
                <button type="button" class="btn-primary" id="btn-new-system">+ Nuevo sistema</button>
            </div>
        </div>
        <div id="alert" class="alert hidden"></div>
        <div class="table-card">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID Cliente</th>
                        <th>Nombre</th>
                        <th class="col-owner">Propietario</th>
                        <th>Redirect URIs</th>
                        <th>Estado</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="systems-tbody">
                    <tr><td colspan="6" class="loading">Cargando...</td></tr>
                </tbody>
            </table>
        </div>
        <div id="modal" class="modal hidden">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-card modal-wide">
                <h2 id="modal-title">Nuevo sistema</h2>
                <form id="system-form">
                    <input type="hidden" id="edit-id" value="">
                    <input type="hidden" id="edit-mode" value="create">
                    <div class="form-grid">
                        <label>ID Cliente (clientId) *
                            <input type="text" id="f-clientId" placeholder="mi-app" required>
                        </label>
                        <label>Nombre
                            <input type="text" id="f-name" placeholder="Mi Aplicación">
                        </label>
                        <label class="full-width">Redirect URIs * <span class="hint">una por línea</span>
                            <textarea id="f-redirectUris" rows="3" placeholder="http://localhost:9000/*" required></textarea>
                        </label>
                        <label>Web Origins
                            <input type="text" id="f-webOrigins" placeholder="+" value="+">
                        </label>
                        <label id="secret-field">Secreto
                            <input type="text" id="f-secret" placeholder="(auto-generado si vacío)">
                        </label>
                        <label>Estado
                            <select id="f-enabled">
                                <option value="1">Activo</option>
                                <option value="0">Inactivo</option>
                            </select>
                        </label>
                    </div>
                    <div id="secret-display" class="secret-box hidden">
                        <strong>Secreto del cliente:</strong>
                        <code id="secret-value"></code>
                        <button type="button" class="btn-secondary btn-sm" id="btn-copy-secret">Copiar</button>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" id="btn-show-secret" style="display:none">Ver secreto</button>
                        <button type="button" class="btn-secondary" id="btn-regen-secret" style="display:none">Regenerar secreto</button>
                        <button type="button" class="btn-secondary" data-close>Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
        <script src="/js/admin.js?v=2"></script>`;
}

module.exports = {
    dashboardContent,
    usuariosContent,
    rolesContent,
    sistemasContent,
    renderPage(userInfo, appUser, page) {
        const pages = {
            dashboard: { title: 'Dashboard', active: 'dashboard', content: dashboardContent() },
            usuarios: { title: 'Usuarios', active: 'usuarios', content: usuariosContent() },
            roles: { title: 'Roles', active: 'roles', content: rolesContent() },
            sistemas: { title: 'Sistemas', active: 'sistemas', content: sistemasContent() },
        };
        const p = pages[page];
        return renderLayout({
            title: p.title,
            activePage: p.active,
            userInfo,
            appUser,
            content: p.content,
        });
    },
};
