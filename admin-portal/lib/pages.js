const { renderLayout, escapeHtml, href } = require('../lib/layout');

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
            <a href="${href('/usuarios')}" class="btn-primary">+ Nuevo usuario</a>
            <a href="${href('/sistemas')}" class="btn-secondary">+ Nuevo sistema</a>
            <button type="button" class="btn-secondary" id="btn-dashboard-sync">Sincronizar todo</button>
        </div>

        <div class="dashboard-grid">
            <section class="dashboard-panel">
                <div class="panel-header">
                    <h2>Usuarios sin acceso a sistema</h2>
                    <a href="${href('/usuarios')}" class="panel-link">Ver todos</a>
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
                    <a href="${href('/sistemas')}" class="panel-link">Gestionar</a>
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
        <script src="${href('/js/admin.js')}?v=35"></script>`;
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
        <div class="toolbar-filters">
            <input type="search" id="users-search" placeholder="Buscar usuario, nombre o correo..." class="filter-input">
        </div>
        <div class="table-card table-scroll">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Puesto</th>
                        <th>Área</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="8" class="loading">Cargando...</td></tr>
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
                            <label id="force-first-field" class="hidden">Primer inicio
                                <select id="f-force-first">
                                    <option value="0">No forzar cambio</option>
                                    <option value="1">Forzar cambio en próximo login</option>
                                </select>
                            </label>
                            <label>División
                                <input type="text" id="f-division" list="dl-division">
                            </label>
                            <label>Área
                                <input type="text" id="f-area" list="dl-area">
                            </label>
                            <label>Región
                                <input type="text" id="f-region" list="dl-region" placeholder="Ej. R9">
                            </label>
                            <label>Sucursal / Store
                                <input type="text" id="f-store" list="dl-store">
                            </label>
                            <label>Puesto
                                <input type="text" id="f-jobd" list="dl-puesto">
                            </label>
                            <label>Departamento
                                <input type="text" id="f-dept">
                            </label>
                            <datalist id="dl-division"></datalist>
                            <datalist id="dl-area"></datalist>
                            <datalist id="dl-region"></datalist>
                            <datalist id="dl-store"></datalist>
                            <datalist id="dl-puesto"></datalist>
                        </div>
                        <div class="sistemas-link-section">
                            <h3>Sistemas vinculados</h3>
                            <p class="section-hint">Marca los sistemas y selecciona uno o más roles internos por cada uno.</p>
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
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}

function rolesContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Roles</h1>
                <p class="page-subtitle">Catálogo de roles del sistema SSO (<code>roleSSO</code>).</p>
            </div>
        </div>
        <div class="table-card table-scroll">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Acceso</th>
                        <th>2FA</th>
                    </tr>
                </thead>
                <tbody id="roles-tbody">
                    <tr><td colspan="5" class="loading">Cargando...</td></tr>
                </tbody>
            </table>
        </div>
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}

function sistemasContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Sistemas</h1>
                <p class="page-subtitle">Clientes OIDC en Keycloak — haz clic en un sistema para configurarlo y gestionar sus roles internos.</p>
            </div>
            <div class="page-actions">
                <a href="${href('/ayuda')}#registrar" class="btn-secondary">¿Cómo registro mi app?</a>
                <button type="button" class="btn-primary" id="btn-new-system">+ Nuevo sistema</button>
            </div>
        </div>
        <div id="alert" class="alert hidden"></div>
        <div class="table-card table-scroll">
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
                            <span class="hint">Client secret OIDC: la app backend lo usa en /token. Guárdalo en sso-config.php o .env.</span>
                        </label>
                        <label>Estado
                            <select id="f-enabled">
                                <option value="1">Activo</option>
                                <option value="0">Inactivo</option>
                            </select>
                        </label>
                    </div>
                    <div id="secret-display" class="secret-box hidden">
                        <strong>Secreto del cliente (OIDC):</strong>
                        <p class="hint">Credencial de la aplicación ante Keycloak. Cópialo a la config del backend.</p>
                        <code id="secret-value"></code>
                        <button type="button" class="btn-secondary btn-sm" id="btn-copy-secret">Copiar</button>
                        <a href="#" id="btn-go-to-system" class="btn-primary btn-sm hidden">Ir al sistema →</a>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" data-close>Cancelar</button>
                        <button type="submit" class="btn-primary">Crear sistema</button>
                    </div>
                </form>
            </div>
        </div>
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}

function sistemaDetailContent(systemId) {
    return `
        <div id="system-detail-root" data-system-id="${systemId}">
            <div class="page-header system-detail-header">
                <div>
                    <a href="${href('/sistemas')}" class="back-link">← Volver a sistemas</a>
                    <h1 id="detail-title">Cargando…</h1>
                    <p class="page-subtitle">Cliente OIDC <code id="detail-client-id">—</code></p>
                </div>
                <div class="page-actions">
                    <button type="button" class="btn-secondary btn-danger-outline" id="btn-detail-delete">Eliminar sistema</button>
                </div>
            </div>
            <div id="alert" class="alert hidden"></div>

            <div class="system-detail-layout">
                <section class="detail-panel">
                    <div class="panel-header">
                        <h2>Configuración OIDC</h2>
                        <button type="button" class="btn-icon detail-edit-button" id="btn-detail-edit" title="Editar configuración OIDC" aria-label="Editar configuración OIDC">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.2 9.3l-3.5-3.5L4 16.5Zm16.7-9.7a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.6-1.6Z"/></svg>
                        </button>
                    </div>
                    <form id="system-detail-form" class="detail-form">
                        <div class="form-grid">
                            <label>ID Cliente
                                <input type="text" id="df-clientId" disabled>
                            </label>
                            <label>Nombre
                                <input type="text" id="df-name" placeholder="Mi Aplicación" disabled>
                            </label>
                            <label class="full-width">Redirect URIs * <span class="hint">una por línea</span>
                                <textarea id="df-redirectUris" rows="4" required disabled></textarea>
                            </label>
                            <label>Web Origins
                                <input type="text" id="df-webOrigins" placeholder="+" disabled>
                            </label>
                            <label>Estado
                                <select id="df-enabled" disabled>
                                    <option value="1">Activo</option>
                                    <option value="0">Inactivo</option>
                                </select>
                            </label>
                        </div>
                        <div class="detail-form-actions hidden" id="system-detail-edit-actions">
                            <button type="submit" class="btn-primary">Guardar cambios</button>
                            <button type="button" class="btn-secondary" id="btn-detail-cancel-edit">Cancelar</button>
                        </div>
                    </form>
                </section>

                <section class="detail-panel">
                    <div class="panel-header">
                        <h2>Secreto del cliente</h2>
                    </div>
                    <p class="section-hint">Credencial OIDC de la aplicación (no es la contraseña del usuario). La usa el backend en <code>/token</code>.</p>
                    <div id="detail-secret-display" class="secret-box hidden">
                        <code id="detail-secret-value"></code>
                        <button type="button" class="btn-secondary btn-sm" id="btn-detail-copy-secret">Copiar</button>
                    </div>
                    <div class="detail-form-actions">
                        <button type="button" class="btn-secondary" id="btn-detail-show-secret">Ver secreto</button>
                        <button type="button" class="btn-secondary" id="btn-detail-regen-secret">Regenerar secreto</button>
                    </div>
                </section>

                <section class="detail-panel detail-panel-full">
                    <div class="panel-header">
                        <h2>Roles internos</h2>
                    </div>
                    <p class="section-hint">Catálogo de client roles en Keycloak (además de <code>access</code>). Puedes asignar varios a cada usuario.</p>
                    <div class="table-card table-card-flat">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Nombre</th>
                                    <th>Descripción</th>
                                    <th>Default</th>
                                    <th>2FA</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="system-roles-tbody">
                                <tr><td colspan="6" class="loading">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="role-add-card">
                        <div class="role-add-header">
                            <span class="role-add-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24"><path d="M12 2 4.5 5v5.4c0 5.1 3.2 9.8 7.5 11.6 4.3-1.8 7.5-6.5 7.5-11.6V5L12 2Zm1 11v3h-2v-3H8v-2h3V8h2v3h3v2h-3Z"/></svg>
                            </span>
                            <div>
                                <h3>Agregar rol interno</h3>
                                <p>Define cómo se identificará el rol y si requiere autenticación adicional.</p>
                            </div>
                        </div>
                        <div class="form-grid form-grid-3 role-add-fields">
                            <label>Código *
                                <input type="text" id="new-role-codigo" placeholder="operador">
                            </label>
                            <label>Nombre *
                                <input type="text" id="new-role-nombre" placeholder="Operador">
                            </label>
                            <label>Descripción
                                <input type="text" id="new-role-desc" placeholder="Opcional">
                            </label>
                        </div>
                        <label class="role-add-2fa-option">
                            <input type="checkbox" id="new-role-require-2fa">
                            <span class="role-add-checkmark" aria-hidden="true"></span>
                            <span class="role-add-option-copy">
                                <strong>Solicitar autenticación 2FA</strong>
                                <small>El usuario deberá validar su segundo factor al acceder con este rol.</small>
                            </span>
                        </label>
                        <div class="role-add-actions">
                            <button type="button" class="btn-primary" id="btn-add-system-role">+ Agregar rol</button>
                        </div>
                    </div>
                </section>

                <section class="detail-panel detail-panel-full system-users-panel">
                    <div class="panel-header system-users-header">
                        <div class="system-users-title">
                            <span class="system-users-title-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24"><path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3ZM8 11c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V19h10v-2.5c0-.8.3-1.6.9-2.2C10.6 13.4 9.1 13 8 13Zm8 0c-.4 0-.9 0-1.4.1 1.5 1.1 2.4 2.4 2.4 3.9v2h6v-2.5c0-2.3-4.7-3.5-7-3.5Z"/></svg>
                            </span>
                            <div>
                                <h2>Usuarios con acceso</h2>
                                <p class="section-hint">Administra las personas que pueden entrar y sus roles internos.</p>
                            </div>
                        </div>
                        <label class="table-search" for="system-users-filter">
                            <span>Buscar en la tabla</span>
                            <span class="table-search-control">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.7 19.3-4.2-4.2a7.5 7.5 0 1 0-1.4 1.4l4.2 4.2 1.4-1.4ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/></svg>
                                <input type="search" id="system-users-filter" placeholder="No. de empleado, nombre o correo" autocomplete="off">
                            </span>
                        </label>
                    </div>

                    <div class="user-add-card">
                        <div class="user-add-card-copy">
                            <span class="user-add-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24"><path d="M15 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6Zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z"/></svg>
                            </span>
                            <div>
                                <h3>Dar acceso a un usuario</h3>
                                <p>Busca una persona que todavía no esté vinculada y agrégala al sistema.</p>
                            </div>
                        </div>
                        <div class="user-search-wrap">
                            <span class="user-search-control">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.7 19.3-4.2-4.2a7.5 7.5 0 1 0-1.4 1.4l4.2 4.2 1.4-1.4ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/></svg>
                                <input type="search" id="system-user-search" placeholder="Buscar usuario disponible" autocomplete="off">
                            </span>
                            <button type="button" class="btn-secondary" id="btn-load-available-users">Ver usuarios disponibles</button>
                        </div>
                        <div id="system-user-search-results" class="search-results hidden"></div>
                    </div>

                    <div class="table-card table-card-flat system-users-table">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Nombre</th>
                                    <th>Correo</th>
                                    <th>Roles</th>
                                    <th>Estado</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="system-users-tbody">
                                <tr><td colspan="6" class="loading">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="system-users-pagination" class="table-pagination hidden" aria-label="Paginación de usuarios"></div>
                </section>
            </div>
        </div>
        <div id="system-user-roles-modal" class="modal hidden">
            <div class="modal-backdrop" data-close-user-roles-modal></div>
            <div class="modal-card modal-wide">
                <h2 id="system-user-roles-title">Roles del usuario</h2>
                <p class="page-subtitle" id="system-user-roles-sub"></p>
                <div id="system-user-roles-list" class="roles-check-list"></div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" data-close-user-roles-modal>Cancelar</button>
                    <button type="button" class="btn-primary" id="btn-save-user-roles">Guardar roles</button>
                </div>
            </div>
        </div>
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}


function puestosContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Puestos</h1>
                <p class="page-subtitle">Catálogo de puestos y sistemas a los que dan acceso automáticamente.</p>
            </div>
        </div>
        <div id="alert" class="alert hidden"></div>
        <div class="toolbar-filters toolbar-filters-wrap">
            <input type="search" id="puestos-search" placeholder="Buscar puesto..." class="filter-input">
            <span class="filter-count" id="puestos-count"></span>
        </div>
        <div class="table-card table-scroll">
            <table class="data-table data-table-compact">
                <thead>
                    <tr>
                        <th>Puesto</th>
                        <th>Usuarios</th>
                        <th>Sistemas</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="puestos-tbody">
                    <tr><td colspan="4" class="loading">Cargando...</td></tr>
                </tbody>
            </table>
        </div>
        <div id="puesto-modal" class="modal hidden">
            <div class="modal-backdrop" data-close-puesto-modal></div>
            <div class="modal-card modal-wide">
                <h2 id="puesto-modal-title">Vincular sistemas</h2>
                <p class="page-subtitle" id="puesto-modal-sub"></p>
                <div id="puesto-sistemas-checkboxes" class="checkbox-grid"></div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" data-close-puesto-modal>Cancelar</button>
                    <button type="button" class="btn-primary" id="btn-save-puesto-sistemas">Guardar y aplicar</button>
                </div>
            </div>
        </div>
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}

function docsContent() {
    const kcPublic = process.env.KC_PUBLIC_URL
        || (process.env.KEYCLOAK_URL || '').replace(/\/realms\/.*$/, '')
        || 'https://sso.mobo.com.mx/auth';
    const kcOidc = process.env.KEYCLOAK_URL
        ? `${String(process.env.KEYCLOAK_URL).replace(/\/$/, '')}/protocol/openid-connect`
        : `${kcPublic.replace(/\/$/, '')}/realms/mobo/protocol/openid-connect`;
    const kcIssuer = kcOidc.replace(/\/protocol\/openid-connect$/, '');
    const adminPublic = (process.env.ADMIN_PUBLIC_URL || 'https://sso.mobo.com.mx/admin').replace(/\/$/, '');
    const seedApi = `${adminPublic}/api/seed`;

    return `
        <div class="page-header">
            <h1>Docs — Seeders API</h1>
            <p class="page-subtitle">
                Pobla accesos y <strong>varios roles internos</strong> por puesto, por usuario o por sistema.
                Autenticación Bearer vía <code>POST ${escapeHtml(seedApi)}/login</code>.
            </p>
        </div>

        <section class="docs-section">
            <h2>Base URL</h2>
            <p>La API de seeders vive en la <strong>consola admin</strong> (<code>/admin</code>), <em>no</em> en Keycloak (<code>/auth</code>).</p>
            <pre class="docs-code">UAT / público:  ${escapeHtml(seedApi)}
Local Docker:   http://localhost:3010/admin/api/seed

Incorrecto:     https://sso.mobo.com.mx/auth/api/seed/...   ← Keycloak (404)
Correcto:       ${escapeHtml(seedApi)}/login</pre>
        </section>

        <section class="docs-section">
            <h2>OIDC — Revocar e introspectar tokens</h2>
            <p>Endpoints del SSO (Keycloak) para el backend de tu app. <strong>No son el logout</strong> del navegador (<code>/logout</code> con redirect); sirven para invalidar o consultar un token concreto.</p>
            <pre class="docs-code">Base:         ${escapeHtml(kcOidc)}
Revoke:       …/revoke
Introspect:   …/token/introspect
UserInfo:     …/userinfo
Logout:       …/logout</pre>
            <h3>Revocar (<code>/revoke</code>)</h3>
            <p>Invalida un token (suele usarse el <code>refresh_token</code>). Tras revocarlo ya no se pueden pedir access tokens nuevos con ese refresh.</p>
            <pre class="docs-code">POST ${escapeHtml(kcOidc)}/revoke
Content-Type: application/x-www-form-urlencoded

client_id=mi-reportes
&amp;client_secret=EL_SECRET
&amp;token=EL_REFRESH_TOKEN
&amp;token_type_hint=refresh_token</pre>
            <h3>Introspect (<code>/token/introspect</code>)</h3>
            <p>Indica si el token sigue activo en el SSO (<code>active: true/false</code>). Útil en middlewares o peticiones sensibles.</p>
            <pre class="docs-code">POST ${escapeHtml(kcOidc)}/token/introspect
Content-Type: application/x-www-form-urlencoded

client_id=mi-reportes
&amp;client_secret=EL_SECRET
&amp;token=EL_ACCESS_O_REFRESH</pre>
            <p class="muted">Los <code>access_token</code> JWT pueden seguir siendo válidos por firma hasta que expiren; revocar el refresh corta la renovación. Para cerrar la sesión SSO del usuario usa el flujo de logout (ver <a href="${href('/ayuda')}#logout">Ayuda → Cerrar sesión</a>).</p>
        </section>

        <section class="docs-section">
            <h2>Modelo de acceso</h2>
            <ol class="docs-list">
                <li><strong>Por puesto</strong> — política en el puesto; usuarios con ese <code>puesto_id</code> heredan acceso (<code>linked_by = "puesto"</code>).</li>
                <li><strong>Por sistema → usuarios</strong> — igual que la consola <em>Sistemas → Usuarios con acceso</em>: un usuario puede tener <strong>varios roles</strong> del mismo sistema.</li>
                <li><strong>Por usuario</strong> — override manual (excepciones).</li>
            </ol>
            <p class="muted">Los roles internos viven en <code>sistemaRoleSSO</code> y se guardan en <code>userSSO_sistema_role</code> (varios por usuario/sistema). En Keycloak se sincronizan como client roles además de <code>access</code>.</p>
        </section>

        <section class="docs-section">
            <h2>1. Obtener token</h2>
            <p>Solo usuarios con rol SSO <strong>Admin</strong> o <strong>DevelopAdmin</strong> (credenciales de <code>userSSO</code>). DevelopAdmin solo ve/opera sobre <em>sus</em> sistemas.</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/login
Content-Type: application/json

{
  "user": "admin",
  "password": "tu_password"
}</pre>
            <p>Respuesta:</p>
            <pre class="docs-code">{
  "token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": "2026-07-20T19:00:00.000Z",
  "user": "admin",
  "rol": 1,
  "rol_nombre": "Admin"
}</pre>
            <p>En las siguientes peticiones envía:</p>
            <pre class="docs-code">Authorization: Bearer &lt;token&gt;</pre>
            <p class="muted">Alternativa: header <code>X-API-Token: &lt;token&gt;</code>. TTL por defecto 3600s (<code>SEED_TOKEN_TTL_SEC</code>).</p>
        </section>

        <section class="docs-section">
            <h2>1b. Login de usuario normal (chatbots / APIs)</h2>
            <p>Autentica un usuario de <code>userSSO</code> y devuelve un perfil de identidad y roles compatible con integraciones de backend, más un Bearer corto para reconsultar.</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/usuario/login
Content-Type: application/json

{
  "user": "10001",
  "password": "su_password",
  "client_id": "mi-reportes"
}</pre>
            <p>Respuesta (ejemplo ficticio):</p>
            <pre class="docs-code">{
  "username": "10001",
  "email": "ana.demo@ejemplo.com",
  "nombre": "Ana Demo Pérez",
  "roles": ["Usuario"],
  "client_roles": ["access", "admin", "consulta"],
  "internal_roles": ["admin", "consulta"],
  "primary_role": "admin",
  "has_access": true,
  "client_id": "mi-reportes",
  "sistema_id": 1,
  "sistema_nombre": "Mi Reportes",
  "token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": "2026-07-21T18:00:00.000Z"
}</pre>
            <p>Si el usuario no está vinculado al sistema: <code>has_access: false</code> y arrays de roles vacíos (salvo <code>roles</code> de realm).</p>
            <pre class="docs-code">GET ${escapeHtml(seedApi)}/usuario/me?client_id=mi-reportes
Authorization: Bearer &lt;token de usuario/login&gt;</pre>
            <p class="muted">TTL del token de usuario: <code>USER_SESSION_TOKEN_TTL_SEC</code> (default 3600). No requiere ser Admin.</p>
            <p><strong>Importante:</strong> este endpoint autentica contra <code>userSSO</code>, pero no crea una sesión OIDC de Keycloak ni acredita 2FA/ACR. No lo uses como sustituto del Authorization Code Flow en una aplicación web o para operaciones que exijan <code>mobo-2fa</code>.</p>
        </section>

        <section class="docs-section">
            <h2>2. Catálogo (IDs y códigos)</h2>
            <pre class="docs-code">GET ${escapeHtml(seedApi)}/catalog
Authorization: Bearer &lt;token&gt;</pre>
            <p>Devuelve puestos, sistemas con sus roles internos (<code>codigo</code>) y roles SSO. Úsalo para armar los payloads.</p>
        </section>

        <section class="docs-section">
            <h2>Resumen de endpoints disponibles</h2>
            <p>Estas son las rutas implementadas actualmente. Los tokens de <code>/login</code> y <code>/usuario/login</code> no son intercambiables.</p>
            <div class="table-card table-scroll">
                <table class="data-table docs-table">
                    <thead><tr><th>Método y endpoint</th><th>Autenticación</th><th>Permiso / uso</th></tr></thead>
                    <tbody>
                        <tr><td><code>POST /login</code></td><td>Público; usuario y contraseña</td><td>Admin o DevelopAdmin. Emite Bearer para seeders.</td></tr>
                        <tr><td><code>POST /usuario/login</code></td><td>Público; usuario, contraseña y <code>client_id</code></td><td>Cualquier usuario activo. Devuelve acceso y roles del sistema.</td></tr>
                        <tr><td><code>GET /usuario/me?client_id=…</code></td><td>Bearer emitido por <code>/usuario/login</code></td><td>Reconsulta acceso y roles del usuario autenticado.</td></tr>
                        <tr><td><code>GET /catalog</code></td><td>Bearer de seeder</td><td>Admin: catálogo global. DevelopAdmin: solo sus sistemas.</td></tr>
                        <tr><td><code>POST /sistemas/usuarios</code></td><td>Bearer de seeder</td><td>Admin o DevelopAdmin sobre sistemas propios.</td></tr>
                        <tr><td><code>POST /usuarios/roles</code></td><td>Bearer de seeder</td><td>Admin o DevelopAdmin sobre sistemas propios.</td></tr>
                        <tr><td><code>POST /puestos/roles</code></td><td>Bearer de seeder</td><td>Solo Admin.</td></tr>
                        <tr><td><code>POST /reaplicar-puestos</code></td><td>Bearer de seeder</td><td>Solo Admin.</td></tr>
                    </tbody>
                </table>
            </div>
            <p class="muted">En la tabla se omite la base común <code>${escapeHtml(seedApi)}</code>. Ejemplo completo: <code>${escapeHtml(seedApi)}/catalog</code>.</p>
        </section>

        <section class="docs-section">
            <h2>3. Seed por sistema → usuarios (varios roles)</h2>
            <p>Equivalente a <em>Sistemas → abrir → Usuarios con acceso → Roles</em>. Cada usuario puede recibir <strong>uno o varios</strong> roles internos del sistema.</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/sistemas/usuarios
Authorization: Bearer &lt;token&gt;
Content-Type: application/json

{
  "sync_keycloak": true,
  "items": [
    {
      "client_id": "mobonet",
      "usuarios": [
        { "user": "10001", "role_codigos": ["admin", "consulta"] },
        { "user": "10002", "role_codigos": ["usuario", "admin"] },
        { "user": "10003", "role_codigo": "usuario" }
      ]
    },
    {
      "sistema_id": 2,
      "usuarios": [
        { "user": "10001", "sistema_role_ids": [4, 5] }
      ]
    }
  ]
}</pre>
            <p>Identifica el sistema con <code>client_id</code> o <code>sistema_id</code>. Los roles van como <code>role_codigos[]</code>, <code>role_codigo</code>, <code>sistema_role_ids[]</code> o <code>sistema_role_id</code>.</p>
        </section>

        <section class="docs-section">
            <h2>4. Seed masivo por puesto</h2>
            <p><strong>Solo Admin.</strong> Reemplaza la política del puesto y la aplica a todos sus usuarios. Sincroniza Keycloak salvo <code>"sync_keycloak": false</code>.</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/puestos/roles
Authorization: Bearer &lt;token&gt;
Content-Type: application/json

{
  "sync_keycloak": true,
  "items": [
    {
      "puesto": "Gerente de Tienda",
      "sistemas": [
        { "client_id": "mobonet", "role_codigos": ["admin", "consulta"] }
      ]
    },
    {
      "puesto_id": 12,
      "sistemas": [
        { "sistema_id": 1, "role_codigo": "usuario" }
      ]
    }
  ]
}</pre>
        </section>

        <section class="docs-section">
            <h2>5. Seed por usuario (override)</h2>
            <ul class="docs-list">
                <li><code>mode: "merge"</code> (default) — inserta/actualiza vínculos manuales sin borrar el resto.</li>
                <li><code>mode: "replace"</code> — reemplaza los vínculos del usuario y luego reaplica la herencia del puesto.</li>
            </ul>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/usuarios/roles
Authorization: Bearer &lt;token&gt;
Content-Type: application/json

{
  "mode": "merge",
  "sync_keycloak": true,
  "items": [
    {
      "user": "10001",
      "sistemas": [
        { "client_id": "mobonet", "role_codigos": ["admin", "consulta"] }
      ]
    }
  ]
}</pre>
        </section>

        <section class="docs-section">
            <h2>6. Reaplicar todos los puestos</h2>
            <p><strong>Solo Admin.</strong> Útil tras migraciones o si cambiaste usuarios de puesto sin propagar.</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/reaplicar-puestos
Authorization: Bearer &lt;token&gt;
Content-Type: application/json

{ "sync_keycloak": true }</pre>
        </section>

        <section class="docs-section">
            <h2>Ejemplo curl (UAT) — multi-rol por sistema</h2>
            <pre class="docs-code"># 1) Token
TOKEN=$(curl -s -X POST ${escapeHtml(seedApi)}/login \\
  -H "Content-Type: application/json" \\
  -d '{"user":"admin","password":"TU_PASS"}' | jq -r .token)

# 2) Catálogo (ver códigos de roles)
curl -s ${escapeHtml(seedApi)}/catalog \\
  -H "Authorization: Bearer $TOKEN" | jq .

# 3) Asignar varios roles a usuarios de un sistema
curl -s -X POST ${escapeHtml(seedApi)}/sistemas/usuarios \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [
      {
        "client_id": "mobonet",
        "usuarios": [
          { "user": "10001", "role_codigos": ["admin", "consulta"] },
          { "user": "10002", "role_codigos": ["usuario"] }
        ]
      }
    ]
  }' | jq .</pre>
            <p class="muted">Local: sustituye la base por <code>http://localhost:3010/admin/api/seed</code>.</p>
        </section>

        <section class="docs-section">
            <h2>Errores frecuentes</h2>
            <table class="data-table docs-table">
                <thead>
                    <tr><th>HTTP</th><th>Causa</th></tr>
                </thead>
                <tbody>
                    <tr><td>401</td><td>Sin token, token inválido/expirado, o credenciales incorrectas en login</td></tr>
                    <tr><td>403</td><td>Usuario no es Admin/DevelopAdmin, o DevelopAdmin intenta un sistema que no es suyo / endpoint solo Admin</td></tr>
                    <tr><td>400</td><td>Faltan campos, el payload es inválido o una referencia a puesto/sistema/rol/usuario no existe</td></tr>
                    <tr><td>404</td><td>Ruta inexistente o <code>/usuario/login</code> / <code>/usuario/me</code> recibió un sistema o usuario inexistente</td></tr>
                    <tr><td>500</td><td>Error interno o fallo al reaplicar políticas; revisa el cuerpo JSON y los logs del servicio</td></tr>
                </tbody>
            </table>
            <p class="muted">Si toda ruta devuelve 404, confirma que estás usando <code>${escapeHtml(adminPublic)}/api/seed</code> y no <code>${escapeHtml(kcPublic)}/api/seed</code>.</p>
        </section>`;
}

function ayudaContent() {
    const kcPublic = process.env.KC_PUBLIC_URL
        || (process.env.KEYCLOAK_URL || '').replace(/\/realms\/.*$/, '')
        || 'https://sso.mobo.com.mx/auth';
    const kcOidc = process.env.KEYCLOAK_URL
        ? `${String(process.env.KEYCLOAK_URL).replace(/\/$/, '')}/protocol/openid-connect`
        : `${kcPublic.replace(/\/$/, '')}/realms/mobo/protocol/openid-connect`;
    const kcIssuer = kcOidc.replace(/\/protocol\/openid-connect$/, '');
    const adminUrl = (process.env.ADMIN_PUBLIC_URL || 'https://sso.mobo.com.mx/admin').replace(/\/$/, '');
    const seedApi = `${adminUrl}/api/seed`;

    return `
        <div class="page-header">
            <div>
                <h1>Ayuda — Integrar tu aplicación</h1>
                <p class="page-subtitle">Guía para <strong>DevelopAdmin</strong>: registrar un sistema, enlazar el login SSO y dar acceso a usuarios.</p>
            </div>
            <div class="page-actions">
                <a href="${href('/sistemas')}" class="btn-primary">Ir a Sistemas</a>
            </div>
        </div>

        <nav class="help-toc docs-section">
            <h2>Contenido</h2>
            <ol class="docs-list">
                <li><a href="#que-haces">Qué hace un DevelopAdmin</a></li>
                <li><a href="#registrar">Registrar el sistema en la consola</a></li>
                <li><a href="#secreto">Guardar el client secret</a></li>
                <li><a href="#roles-internos">Crear roles internos</a></li>
                <li><a href="#step-up-2fa">Configurar 2FA por rol interno</a></li>
                <li><a href="#usuarios">Dar acceso a usuarios</a></li>
                <li><a href="#app">Enlazar el login (PHP y Node)</a></li>
                <li><a href="#logout">Cerrar sesión (logout)</a></li>
                <li><a href="#respuesta-sso">Qué JSON te devuelve el SSO</a></li>
                <li><a href="#flujo">Cómo funciona el login (flujo)</a></li>
                <li><a href="#checklist">Checklist y errores comunes</a></li>
                <li><a href="#cursor">Integrar otra app con Cursor (prompt)</a></li>
            </ol>
        </nav>

        <section class="docs-section" id="que-haces">
            <h2>1. Qué hace un DevelopAdmin</h2>
            <p>Como DevelopAdmin eres dueño de <strong>tus</strong> sistemas. Puedes:</p>
            <ul class="docs-list">
                <li>Crear y configurar clientes OIDC (Redirect URIs, Web Origins y secreto).</li>
                <li>Definir roles internos de la app (<code>admin</code>, <code>usuario</code>, <code>consulta</code>, …).</li>
                <li>Vincular usuarios a tu sistema y asignarles uno o varios roles.</li>
                <li>Usar la API de seeders con token (<code>${escapeHtml(seedApi)}/*</code>) solo sobre tus sistemas.</li>
            </ul>
            <p class="muted">No gestionas puestos globales ni la documentación de seeders de Admin. Si necesitas un sistema “global” sin owner, pídelo a un Admin.</p>
        </section>

        <section class="docs-section" id="registrar">
            <h2>2. Registrar el sistema en la consola</h2>
            <ol class="help-steps">
                <li>
                    <strong>Ve a <a href="${href('/sistemas')}">Sistemas</a></strong> y pulsa <em>+ Nuevo sistema</em>.
                </li>
                <li>
                    <strong>ID Cliente (<code>client_id</code>)</strong> — identificador único, sin espacios.
                    <pre class="docs-code">mi-reportes</pre>
                </li>
                <li>
                    <strong>Nombre</strong> — etiqueta visible (ej. “Reportes MOBO”).
                </li>
                <li>
                    <strong>Redirect URIs</strong> — una por línea. Deben coincidir <em>exactamente</em> con la URL de callback de tu app.
                    <pre class="docs-code">http://localhost:9000/sso-callback
https://reportes.mobo.com.mx/sso-callback
https://reportes.mobo.com.mx/*</pre>
                    <p class="muted"><code>http://localhost:9000</code> y <code>http://127.0.0.1:9000</code> son distintos para Keycloak. Registra la que usará la app.</p>
                </li>
                <li>
                    <strong>Web Origins</strong> — normalmente <code>+</code>, que deriva los orígenes permitidos de las Redirect URIs. No uses <code>*</code> salvo una necesidad excepcional y controlada.
                </li>
                <li>
                    Pulsa <em>Crear sistema</em>. La consola crea el cliente en Keycloak (realm <code>mobo</code>), el rol <code>access</code> y te deja como <strong>owner</strong>.
                </li>
            </ol>
        </section>

        <section class="docs-section" id="secreto">
            <h2>3. Guardar el client secret</h2>
            <p>Al crear el sistema (o luego con <em>Mostrar / Regenerar secreto</em> en el detalle) obtienes el <strong>client secret</strong>.</p>
            <ul class="docs-list">
                <li>Va <strong>solo en el backend</strong> de tu app (nunca en JavaScript del navegador).</li>
                <li>Guárdalo en <code>sso-config.php</code>, <code>.env</code> o el secreto del servidor.</li>
                <li>Si lo regeneras, actualiza la config de la app o el login fallará.</li>
            </ul>
        </section>

        <section class="docs-section" id="roles-internos">
            <h2>4. Crear roles internos</h2>
            <p>Abre el sistema → sección <strong>Roles internos</strong>. Ahí defines permisos <em>dentro</em> de la app (no son los roles SSO Admin/Usuario).</p>
            <pre class="docs-code">codigo: admin     → Administrador
codigo: usuario   → Usuario (suele ser el default)
codigo: consulta  → Solo lectura</pre>
            <p>Un usuario puede tener <strong>varios</strong> roles a la vez. En el token OIDC aparecen así:</p>
            <pre class="docs-code">{
  "resource_access": {
    "mi-reportes": {
      "roles": ["access", "admin", "consulta"]
    }
  }
}</pre>
            <p class="muted"><code>access</code> = puede entrar. El resto = permisos de negocio que lee tu app.</p>
        </section>

        <section class="docs-section" id="step-up-2fa">
            <h2>4.1 Configurar 2FA por rol interno</h2>
            <p>En <strong>Sistemas → tu sistema → Roles internos</strong> puedes activar 2FA para cualquier rol. Cuando un usuario tiene un rol protegido, el SSO añade <code>otp_required</code> a los roles de ese cliente.</p>
            <pre class="docs-code">{
  "resource_access": {
    "mi-reportes": {
      "roles": ["access", "admin", "otp_required"]
    }
  }
}</pre>
            <p><strong>No programes una condición fija como <code>role == "admin"</code>.</strong> El rol protegido lo elige el owner del sistema y puede tener cualquier código.</p>

            <h3>Contrato de step-up</h3>
            <ol class="help-steps">
                <li>La app valida el token firmado y lee <code>otp_required</code>.</li>
                <li>Si requiere 2FA y todavía no tiene <code>acr=mobo-2fa</code>, no crea ni eleva la sesión.</li>
                <li>Inicia otra autorización OIDC con <code>acr_values=mobo-2fa</code>.</li>
                <li>La nueva autorización usa <code>state</code>, <code>nonce</code> y PKCE nuevos.</li>
                <li>En el callback valida firma, issuer, audience, vigencia, <code>state</code> y <code>nonce</code>.</li>
                <li>Sólo concede privilegios si el token final contiene <code>acr=mobo-2fa</code>.</li>
            </ol>
            <pre class="docs-code">if (roles.includes('otp_required') && claims.acr !== 'mobo-2fa') {
  // Guardar una transacción OIDC nueva y redirigir:
  // …/auth?…&amp;acr_values=mobo-2fa
}</pre>

            <h3>Sesión y middleware</h3>
            <ul class="docs-list">
                <li>Guarda <code>acr</code> y <code>requires_2fa</code> en la sesión del servidor.</li>
                <li>Revalida ambos al renovar tokens o permisos.</li>
                <li>Protege operaciones privilegiadas con middleware del backend.</li>
                <li>No confíes en flags enviados por el frontend ni en el payload de un JWT sin validar su firma.</li>
                <li>Permite varias transacciones pendientes para evitar errores <code>state mismatch</code> entre pestañas.</li>
            </ul>
            <p class="muted">Activa el interruptor del rol sólo cuando la aplicación ya soporte este flujo. Keycloak usa el mapeo <code>mobo-2fa → LoA 2</code>.</p>
        </section>

        <section class="docs-section" id="usuarios">
            <h2>5. Dar acceso a usuarios</h2>
            <ol class="help-steps">
                <li>En el detalle del sistema → <strong>Usuarios con acceso</strong>.</li>
                <li>Busca el No. de empleado y pulsa <em>Agregar</em>.</li>
                <li>Con el botón <em>Roles</em> marca uno o varios roles internos y guarda.</li>
            </ol>
            <p>También puedes vincular desde <a href="${href('/usuarios')}">Usuarios</a> marcando tu sistema en el formulario.</p>
            <p class="muted">Sin vínculo (y sin rol <code>access</code> en Keycloak) la persona puede autenticarse en el SSO pero <strong>no entra</strong> a tu app.</p>
        </section>

        <section class="docs-section" id="app">
            <h2>6. Enlazar el login (PHP y Node)</h2>
            <p>Regla corta: el navegador <strong>nunca</strong> ve el client secret. Todo el intercambio <code>code → tokens</code> va en el backend.</p>

            <h3>Endpoints OIDC (este ambiente)</h3>
            <pre class="docs-code">Base:   ${escapeHtml(kcOidc)}
Auth:   …/auth
Token:  …/token
Logout: …/logout
UserInfo: …/userinfo</pre>

            <h3>Config mínima (.env / sso-config)</h3>
            <pre class="docs-code">SSO_KC_ISSUER=${escapeHtml(kcIssuer)}
SSO_KC_BASE=${escapeHtml(kcOidc)}
SSO_CLIENT_ID=mi-reportes
SSO_CLIENT_SECRET=el-secret-de-la-consola
SSO_REDIRECT_URI=https://reportes.mobo.com.mx/sso-callback
SSO_POST_LOGOUT_URI=https://reportes.mobo.com.mx/</pre>

            <h3>Rutas que debe exponer tu app</h3>
            <table class="data-table docs-table">
                <thead>
                    <tr><th>Ruta</th><th>Acción</th></tr>
                </thead>
                <tbody>
                    <tr><td><code>/login</code> o inicio sin sesión</td><td>Genera <code>state</code>, <code>nonce</code> y PKCE; redirect a <code>/auth</code> con <code>response_type=code</code> y <code>scope=openid profile email</code></td></tr>
                    <tr><td><code>/sso-callback</code></td><td>Valida la transacción → POST a <code>/token</code> desde backend → valida tokens firmados y rol <code>access</code> → crea sesión local</td></tr>
                    <tr><td><code>/logout</code></td><td>Misma pestaña: borra sesión local → redirect 302 a <code>/logout</code> de Keycloak con <code>id_token_hint</code> + <code>post_logout_redirect_uri</code> (sin confirmación ni pestaña nueva)</td></tr>
                </tbody>
            </table>

            <h3>PHP (resumen)</h3>
            <p>Usa una librería OIDC mantenida que valide firma, issuer, vigencia, <code>state</code>, <code>nonce</code> y PKCE. <code>templates/sso-app/php/SsoAppRoles.php</code> solo ayuda a interpretar roles; no sustituye la validación del token.</p>
            <pre class="docs-code">// Sin sesión → login
KeycloakSSO::redirectToLogin();

// /sso-callback
$sso = KeycloakSSO::handleCallback();
if (empty($sso['has_access'])) {
    header('Location: /?sso_error=Sin acceso');
    exit;
}

$_SESSION['app'] = [
    'usuario'   => $sso['username'],
    'nombre'    => $sso['nombre'],
    'email'     => $sso['email'],
    'sso_roles' => $sso['internal_roles'], // ['admin','consulta']
    'sso_role'  => $sso['primary_role'],   // 'admin'
];
header('Location: /dashboard');</pre>

            <h3>Node.js / Express (resumen)</h3>
            <p>El ejemplo usa las APIs de <code>openid-client@5</code>. Se fija la versión para evitar incompatibilidad con la API distinta de v6 y se valida el access token con JWKS antes de leer roles.</p>
            <pre class="docs-code">// npm i openid-client@5 jose@4 express-session
import { Issuer, generators } from 'openid-client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  hasSystemAccess, getInternalRoles, getPrimaryInternalRole
} from './sso-roles.js';

const expectedIssuer = process.env.SSO_KC_ISSUER;
const issuer = await Issuer.discover(expectedIssuer);
const client = new issuer.Client({
  client_id: process.env.SSO_CLIENT_ID,
  client_secret: process.env.SSO_CLIENT_SECRET,
  redirect_uris: [process.env.SSO_REDIRECT_URI],
  response_types: ['code'],
});
const jwks = createRemoteJWKSet(new URL('${escapeHtml(kcOidc)}/certs'));

// GET /login
app.get('/login', (req, res) => {
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  req.session.oidc = { state, nonce, codeVerifier };
  res.redirect(client.authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }));
});

// GET /sso-callback
app.get('/sso-callback', async (req, res) => {
  const tx = req.session.oidc;
  if (!tx) return res.status(400).send('Transacción OIDC inexistente o expirada');
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(
    process.env.SSO_REDIRECT_URI,
    params,
    { state: tx.state, nonce: tx.nonce, code_verifier: tx.codeVerifier }
  );
  delete req.session.oidc;
  const claims = tokenSet.claims(); // ID token validado por openid-client
  const clientId = process.env.SSO_CLIENT_ID;
  const { payload: access } = await jwtVerify(tokenSet.access_token, jwks, {
    issuer: expectedIssuer,
    algorithms: ['RS256'],
  });
  if (access.azp !== clientId) {
    return res.status(403).send('El token no fue emitido para este cliente');
  }

  if (!hasSystemAccess(access, clientId)) {
    return res.redirect('/?sso_error=Sin acceso');
  }

  req.session.user = {
    username: claims.preferred_username,
    email: claims.email,
    nombre: [claims.given_name, claims.family_name].filter(Boolean).join(' '),
    sso_roles: getInternalRoles(access, clientId),
    sso_role: getPrimaryInternalRole(access, clientId),
  };
  req.session.tokenSet = { id_token: tokenSet.id_token }; // logout
  res.redirect('/dashboard');
});

// Proteger rutas
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
// Logout → ver § 6.1</pre>
            <p class="muted">Plantillas de interpretación de roles: <code>templates/sso-app/</code>. Nunca autorices usando un JWT meramente decodificado.</p>
        </section>

        <section class="docs-section" id="logout">
            <h2>6.1 Cerrar sesión (logout)</h2>

            <h3>Cómo debe funcionar</h3>
            <p>El usuario <strong>no</strong> escribe la URL de Keycloak a mano. En tu app pone un enlace a <strong>tu</strong> ruta <code>/logout</code>:</p>
            <pre class="docs-code">&lt;a href="/logout"&gt;Cerrar sesión&lt;/a&gt;</pre>
            <p>Tu backend hace esto (todo en la <strong>misma pestaña</strong>, sin <code>window.open</code> ni <code>target="_blank"</code>):</p>
            <ol class="help-steps">
                <li>Lee el <code>id_token</code> de la sesión.</li>
                <li>Borra la sesión local de la app.</li>
                <li>Responde <code>302</code> a Keycloak con la URL <strong>completa</strong> (parámetros incluidos).</li>
                <li>Keycloak cierra el SSO y te regresa a tu app (<code>post_logout_redirect_uri</code>).</li>
            </ol>

            <h3>Qué pasa si abres solo el endpoint</h3>
            <p>Si entras directo a:</p>
            <pre class="docs-code">${escapeHtml(kcOidc)}/logout</pre>
            <p>Keycloak no sabe de qué app vienes ni tiene <code>id_token_hint</code>, entonces:</p>
            <ol class="help-steps">
                <li>Te pide <strong>confirmar</strong> el cierre de sesión.</li>
                <li>Te deja en <strong>«Estás desconectado»</strong> y <em>no</em> te regresa a tu app.</li>
            </ol>
            <p class="muted">Eso es normal. Esa URL corta es solo el destino del redirect que arma tu backend, no una página para abrir a mano.</p>

            <h3>URL completa que debe armar tu backend</h3>
            <pre class="docs-code">${escapeHtml(kcOidc)}/logout
  ?id_token_hint=EYJhbGciOi...
  &amp;client_id=mi-reportes
  &amp;post_logout_redirect_uri=https://tu-app.mobo.com.mx/</pre>
            <p>Con esos parámetros Keycloak cierra la sesión <strong>sin</strong> pantalla de confirmación y redirige a tu app.</p>

            <h3>PHP</h3>
            <pre class="docs-code">// Ruta /logout de TU app
KeycloakSSO::logoutRedirect();</pre>

            <h3>Node</h3>
            <pre class="docs-code">// Ruta /logout de TU app (guarda tokenSet.id_token al hacer login)
app.get('/logout', (req, res) => {
  const idToken = req.session.tokenSet?.id_token; // ANTES de destroy
  req.session.destroy(() => {
    if (!idToken) return res.redirect('/');
    res.redirect(client.endSessionUrl({
      id_token_hint: idToken,
      client_id: process.env.SSO_CLIENT_ID,
      post_logout_redirect_uri: process.env.SSO_POST_LOGOUT_URI,
    }));
  });
});</pre>

            <h3>Resumen</h3>
            <table class="data-table docs-table">
                <thead>
                    <tr><th>Incorrecto</th><th>Correcto</th></tr>
                </thead>
                <tbody>
                    <tr><td>Abrir <code>…/openid-connect/logout</code> en el navegador</td><td>Enlace a <code>/logout</code> de <strong>tu app</strong></td></tr>
                    <tr><td><code>window.open</code> / pestaña nueva</td><td>Redirect 302 en la misma pestaña</td></tr>
                    <tr><td>Solo borrar sesión local</td><td>Borrar sesión + redirect a Keycloak con parámetros</td></tr>
                    <tr><td>Destruir sesión y luego buscar el <code>id_token</code></td><td>Leer <code>id_token_hint</code> <strong>antes</strong> de destruir la sesión</td></tr>
                </tbody>
            </table>
        </section>

        <section class="docs-section" id="respuesta-sso">
            <h2>6.2 Qué JSON / datos te devuelve el SSO</h2>
            <p>Tras validar el callback, conviene normalizar la sesión del backend con una estructura equivalente a esta:</p>
            <pre class="docs-code">{
  "username": "10001",
  "email": "ana.demo@ejemplo.com",
  "nombre": "Ana Demo Pérez",
  "roles": ["Usuario"],
  "client_roles": ["access", "admin", "consulta"],
  "internal_roles": ["admin", "consulta"],
  "primary_role": "admin",
  "has_access": true,
  "requires_2fa": true,
  "acr": "mobo-2fa"
}</pre>
            <table class="data-table docs-table">
                <thead>
                    <tr><th>Campo</th><th>Significado</th><th>¿Lo usas en la app?</th></tr>
                </thead>
                <tbody>
                    <tr><td><code>username</code></td><td>No. de empleado (<code>preferred_username</code>)</td><td>Sí — id de sesión</td></tr>
                    <tr><td><code>email</code> / <code>nombre</code></td><td>Perfil</td><td>Sí — UI</td></tr>
                    <tr><td><code>has_access</code></td><td>Tiene client role <code>access</code></td><td>Sí — si es false, denegar entrada</td></tr>
                    <tr><td><code>internal_roles</code></td><td>Roles de negocio (sin <code>access</code>)</td><td>Sí — permisos de pantallas</td></tr>
                    <tr><td><code>requires_2fa</code></td><td>Derivado de que <code>client_roles</code> contiene <code>otp_required</code></td><td>Sí — iniciar <code>acr_values=mobo-2fa</code></td></tr>
                    <tr><td><code>acr</code></td><td>Claim del token que indica el nivel de autenticación alcanzado</td><td>Sí — exigir <code>mobo-2fa</code> para privilegios protegidos</td></tr>
                    <tr><td><code>primary_role</code></td><td>Rol principal (prioridad admin → usuario → consulta)</td><td>Opcional</td></tr>
                    <tr><td><code>client_roles</code></td><td>Todos los roles del cliente OIDC</td><td>Debug / raro</td></tr>
                    <tr><td><code>roles</code></td><td>Roles de realm (Admin SSO, etc.)</td><td>Casi nunca en apps de negocio</td></tr>
                </tbody>
            </table>

            <h3>Claims útiles del access_token (JWT)</h3>
            <pre class="docs-code">{
  "sub": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "preferred_username": "10001",
  "email": "ana.demo@ejemplo.com",
  "given_name": "Ana",
  "family_name": "Demo Pérez",
  "realm_access": {
    "roles": ["Usuario"]
  },
  "resource_access": {
    "mi-reportes": {
      "roles": ["access", "admin", "consulta"]
    }
  }
}</pre>
            <p class="muted">Lo crítico para tu app es <code>resource_access["tu-client_id"].roles</code>: debe incluir <code>access</code> + los roles internos que asignaste en la consola.</p>
            <p>Para chatbots / APIs sin navegador puedes obtener el mismo perfil con:</p>
            <pre class="docs-code">POST ${escapeHtml(seedApi)}/usuario/login
{ "user": "10001", "password": "…", "client_id": "mi-reportes" }</pre>
            <p class="muted">Este acceso directo sirve para integraciones servidor-a-servidor, pero no acredita una sesión OIDC ni 2FA. Detalle en <a href="${href('/docs')}">Docs / Seeders → 1b</a>.</p>
        </section>

        <section class="docs-section" id="flujo">
            <h2>7. Cómo funciona el login (flujo)</h2>
            <ol class="help-steps">
                <li>El usuario abre tu app.</li>
                <li>Sin sesión → tu app lo manda a Keycloak (pantalla SSO MOBO).</li>
                <li>Escribe No. de empleado y contraseña (una sola vez por sesión SSO).</li>
                <li>Keycloak valida las credenciales y emite tokens para el cliente.</li>
                <li>Vuelve a tu <code>redirect_uri</code> con un <code>code</code>.</li>
                <li>Tu backend canjea el code, valida criptográficamente los tokens y comprueba que incluyan <code>access</code> para tu <code>client_id</code>.</li>
                <li>Solo después de esas validaciones crea la sesión local de la app.</li>
            </ol>
            <p class="muted">Si ya tenía sesión en otra app MOBO, no vuelve a pedir contraseña (SSO). Si le quitas el vínculo a tu sistema, deja de entrar aunque siga logueado en otras.</p>
        </section>

        <section class="docs-section" id="checklist">
            <h2>8. Checklist y errores comunes</h2>
            <ul class="docs-list">
                <li>☐ Sistema creado en <a href="${href('/sistemas')}">Sistemas</a> y activo</li>
                <li>☐ Redirect URI de la app = exactamente el registrado</li>
                <li>☐ Client secret en el backend</li>
                <li>☐ Al menos un rol interno (default) creado</li>
                <li>☐ Usuario de prueba vinculado + roles asignados</li>
                <li>☐ App usa realm <code>mobo</code> y el <code>client_id</code> correcto</li>
                <li>☐ Si usa roles con 2FA: valida <code>otp_required</code> y <code>acr=mobo-2fa</code></li>
                <li>☐ Cada autorización utiliza <code>state</code>, <code>nonce</code> y PKCE nuevos</li>
                <li>☐ Access/ID Tokens se validan criptográficamente; no sólo se decodifican</li>
                <li>☐ Logout en la misma pestaña con <code>id_token_hint</code> + <code>post_logout_redirect_uri</code> (<a href="#logout">ver logout</a>)</li>
            </ul>

            <table class="data-table docs-table">
                <thead>
                    <tr><th>Síntoma</th><th>Causa típica</th></tr>
                </thead>
                <tbody>
                    <tr><td><code>invalid_redirect_uri</code></td><td>La URL de callback no está en Redirect URIs (o difiere en host/puerto/path)</td></tr>
                    <tr><td><code>unauthorized_client</code> / error en /token</td><td>Client secret incorrecto o regenerado</td></tr>
                    <tr><td>Login OK pero “sin acceso”</td><td>Usuario no vinculado al sistema o sin rol <code>access</code></td></tr>
                    <tr><td>No aparecen roles en la app</td><td>Falta sincronizar / no marcaste roles en Usuarios con acceso</td></tr>
                    <tr><td>Tiene <code>otp_required</code> pero no pide OTP</td><td>La app no solicita <code>acr_values=mobo-2fa</code> o no está habilitado el flujo LoA</td></tr>
                    <tr><td>OTP se solicita repetidamente</td><td>La app no conserva/revalida <code>acr</code> o reutiliza incorrectamente la transacción</td></tr>
                    <tr><td><code>state mismatch</code></td><td>Se guarda un solo state o se reutiliza entre pestañas; usa transacciones independientes</td></tr>
                    <tr><td>CORS</td><td>Revisa Web Origins; el intercambio de tokens debe ser en backend</td></tr>
                    <tr><td>Logout pide confirmación o abre otra pestaña</td><td>Ver <a href="#logout">Cerrar sesión</a>: falta <code>id_token_hint</code> o usaste <code>window.open</code></td></tr>
                </tbody>
            </table>
        </section>

        <section class="docs-section" id="cursor">
            <h2>9. Integrar otra app con Cursor (prompt)</h2>
            <p>Ambiente mostrado por esta consola: Keycloak <code>${escapeHtml(kcPublic)}</code> · Consola <code>${escapeHtml(adminUrl)}</code> · Realm <code>mobo</code>.</p>
            <p>En el repo SSO hay una skill de Cursor: <code>.cursor/skills/integrate-mobo-sso/</code>. Para integrar un sistema nuevo, abre un chat en el repo de la app (o aquí), pega el prompt, completa los campos <code>«…»</code> y deja que el agente implemente login + callback + access + logout.</p>

            <h3>Prompt (copiar y pegar)</h3>
            <pre class="docs-code">Usa la skill integrate-mobo-sso y la guía GUIA-PROYECTO-E-INTEGRACION.md / Ayuda de la consola.

Integra esta aplicación al SSO MOBO en PRODUCCIÓN (Keycloak realm mobo, OIDC Authorization Code).

Datos del sistema:
- Nombre / client_id: «ej. portal-sed-dos»
- Stack: «PHP | Node | otro»
- URL pública de la app: «https://…»
- Callback (redirect_uri): «https://…/sso-callback»
- Post-logout URI: «https://…/»
- Ambiente: «UAT | PROD»
- Issuer Keycloak: ${escapeHtml(kcIssuer)}
- Consola admin: ${escapeHtml(adminUrl)}
- Client secret: «lo pego del panel Sistemas (no lo subas a git)»
- Roles internos que necesita la app: «admin, usuario, consulta»
- Ruta del repo / carpeta de la app: «…»

Haz esto:
1. Revisa el código actual de login/sesión de la app.
2. Implementa login → callback → validación de rol access → sesión local.
3. Guarda id_token para logout.
4. Implementa /logout en la MISMA pestaña (id_token_hint + post_logout_redirect_uri). Nunca window.open ni abrir …/openid-connect/logout a mano.
5. El client secret solo en backend (.env).
6. Déjame un checklist de prueba: crear/vincular usuario en consola, login, roles, logout.

No inventes URLs ni secretos. Si falta registrar el sistema en la consola admin, indícamelo antes.
No cambies de ambiente ni inventes dominios: usa exactamente las URLs anteriores.</pre>

            <h3>Variante corta</h3>
            <pre class="docs-code">Skill integrate-mobo-sso: conecta esta app al SSO MOBO (realm mobo).
auth=${escapeHtml(kcPublic)} · admin=${escapeHtml(adminUrl)}
client_id=«…», stack=«…», callback=«…», post_logout=«…».
Login + callback + access + roles internos + logout misma pestaña con id_token_hint.
Secret solo backend. Checklist de prueba al final.</pre>

            <p class="muted">Antes de pedir la integración: registra el sistema en <a href="${href('/sistemas')}">Sistemas</a>, copia el secret y ten lista la Redirect URI exacta. Detalle del flujo: secciones 6 y 6.1 de esta Ayuda.</p>

            <h3>Descargar skill de Cursor</h3>
            <p>Descarga <code>SKILL.md</code> y guárdalo en <code>.cursor/skills/integrate-mobo-sso/SKILL.md</code> del proyecto de la app.</p>
            <p class="page-actions" style="justify-content:flex-start;margin-top:0.75rem">
                <a class="btn-primary" href="${href('/downloads/SKILL.md')}">Descargar SKILL.md</a>
            </p>
            <ol class="help-steps">
                <li>Copia el archivo a <code>.cursor/skills/integrate-mobo-sso/SKILL.md</code>.</li>
                <li>Abre un chat nuevo en Cursor y di «usa integrate-mobo-sso» (o pega el prompt de arriba).</li>
                <li>Completa <code>client_id</code>, URLs, secret y stack.</li>
            </ol>
        </section>`;
}

function monitoreoContent() {
    return `
        <div class="page-header">
            <div>
                <h1>Monitoreo por sistema</h1>
                <p class="page-subtitle">Sesiones activas de Keycloak y movimientos administrativos registrados en la consola.</p>
            </div>
            <button type="button" class="btn-secondary" id="btn-monitor-refresh">Actualizar</button>
        </div>
        <section class="detail-panel monitor-system-picker">
            <div class="panel-header"><h2>Sistema monitoreado</h2></div>
            <div class="monitor-select-wrap">
                <span class="monitor-select-icon" aria-hidden="true">◎</span>
                <div class="monitor-select-copy">
                    <span>Selecciona una aplicación</span>
                    <select id="monitor-system" class="monitor-native-select" tabindex="-1" aria-hidden="true">
                        <option value="">Cargando sistemas…</option>
                    </select>
                    <button type="button" id="monitor-system-trigger" class="monitor-system-trigger"
                        aria-haspopup="listbox" aria-expanded="false">
                        <span id="monitor-system-label">Cargando sistemas…</span>
                    </button>
                    <div id="monitor-system-options" class="monitor-system-options hidden" role="listbox"></div>
                </div>
                <span class="monitor-select-arrow" aria-hidden="true">⌄</span>
            </div>
            <p class="section-hint" id="monitor-updated">Selecciona un sistema para consultar su actividad.</p>
        </section>
        <section class="detail-panel detail-panel-full">
            <div class="panel-header"><h2>Sesiones activas</h2><span class="badge" id="monitor-session-count">0</span></div>
            <div class="table-card table-card-flat"><table class="data-table">
                <thead><tr><th>Usuario</th><th>IP</th><th>Inicio</th><th>Última actividad</th><th>Duración</th></tr></thead>
                <tbody id="monitor-sessions-tbody"><tr><td colspan="5" class="empty">Sin sistema seleccionado.</td></tr></tbody>
            </table></div>
            <div id="monitor-sessions-pagination" class="table-pagination hidden" aria-label="Paginación de sesiones"></div>
        </section>
        <section class="detail-panel detail-panel-full">
            <div class="panel-header"><h2>Bitácora administrativa</h2></div>
            <p class="section-hint">Registra cambios realizados desde la consola a partir de la instalación de esta función.</p>
            <div class="table-card table-card-flat"><table class="data-table">
                <thead><tr><th>Fecha</th><th>Responsable</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
                <tbody id="monitor-audit-tbody"><tr><td colspan="5" class="empty">Sin sistema seleccionado.</td></tr></tbody>
            </table></div>
        </section>
        <script src="${href('/js/admin.js')}?v=35"></script>`;
}

module.exports = {
    dashboardContent,
    usuariosContent,
    puestosContent,
    rolesContent,
    sistemasContent,
    sistemaDetailContent,
    docsContent,
    ayudaContent,
    monitoreoContent,
    renderPage(userInfo, appUser, page) {
        const pages = {
            dashboard: { title: 'Dashboard', active: 'dashboard', content: dashboardContent() },
            usuarios: { title: 'Usuarios', active: 'usuarios', content: usuariosContent() },
            puestos: { title: 'Puestos', active: 'puestos', content: puestosContent() },
            roles: { title: 'Roles', active: 'roles', content: rolesContent() },
            sistemas: { title: 'Sistemas', active: 'sistemas', content: sistemasContent() },
            docs: { title: 'Docs / Seeders', active: 'docs', content: docsContent() },
            ayuda: { title: 'Ayuda', active: 'ayuda', content: ayudaContent() },
            monitoreo: { title: 'Monitoreo', active: 'monitoreo', content: monitoreoContent() },
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
    renderSystemDetailPage(userInfo, appUser, systemId) {
        return renderLayout({
            title: 'Detalle del sistema',
            activePage: 'sistemas',
            userInfo,
            appUser,
            content: sistemaDetailContent(systemId),
        });
    },
};
