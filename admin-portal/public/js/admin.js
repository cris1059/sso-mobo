const APP_BASE = String(window.__APP_BASE__ || '').replace(/\/$/, '');

function appUrl(path) {
    if (!path) return APP_BASE || '/';
    if (/^https?:\/\//i.test(path)) return path;
    if (!path.startsWith('/')) return `${APP_BASE}/${path}`;
    return `${APP_BASE}${path}`;
}

async function api(path, options = {}) {
    const res = await fetch(appUrl(path), {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
    return data;
}

function showAlert(msg, type = 'error', ms = 5000) {
    const el = document.getElementById('alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.classList.remove('hidden');
    clearTimeout(showAlert._t);
    showAlert._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function badge(text, variant) {
    return `<span class="badge badge-${variant}">${text}</span>`;
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Roles page ──
async function loadRoles() {
    const tbody = document.getElementById('roles-tbody');
    if (!tbody) return;

    try {
        const roles = await api('/api/roles');
        const access = {
            1: 'Consola admin + todos los sistemas',
            2: 'Solo apps vinculadas',
            3: 'Consola admin + sus sistemas',
        };
        tbody.innerHTML = roles.map((r) => `
            <tr>
                <td>${r.id}</td>
                <td><strong>${r.nombre}</strong></td>
                <td>${r.descripcion || '—'}</td>
                <td>${access[r.id] || '—'}</td>
                <td>
                    ${isAdmin()
                        ? `<label class="inline-check"><input type="checkbox" data-role-id="${r.id}" ${Number(r.require_2fa) ? 'checked' : ''}> OTP</label>`
                        : badge(Number(r.require_2fa) ? 'Sí' : 'No', Number(r.require_2fa) ? 'ok' : 'off')}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-role-id]').forEach((el) => {
            el.addEventListener('change', async () => {
                try {
                    await api(`/api/roles/${el.dataset.roleId}/2fa`, {
                        method: 'PUT',
                        body: JSON.stringify({ require_2fa: el.checked ? 1 : 0 }),
                    });
                    showAlert('2FA por rol actualizado. Ejecuta Sincronizar todo para aplicar flujos.', 'ok');
                } catch (err) {
                    el.checked = !el.checked;
                    showAlert(err.message);
                }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="error">${err.message}</td></tr>`;
    }
}

// ── Users page ──
let rolesCache = [];
let sistemasCache = [];
const isAdmin = () => document.body.dataset.isAdmin === '1';

async function loadRolesSelect() {
    rolesCache = await api('/api/roles');
    const sel = document.getElementById('f-rol');
    const rolField = document.getElementById('rol-field');
    if (!sel) return;

    const allowed = isAdmin() ? rolesCache : rolesCache.filter((r) => r.id === 2);
    sel.innerHTML = allowed.map((r) => `<option value="${r.id}">${r.nombre}</option>`).join('');
    if (rolField) rolField.style.display = isAdmin() ? '' : 'none';
}

async function loadSistemasCheckboxes(userLinks = []) {
    const box = document.getElementById('sistemas-checkboxes');
    if (!box) return;
    sistemasCache = await api('/api/systems');
    const linkMap = new Map(
        userLinks.map((l) => {
            if (typeof l === 'number') return [l, []];
            const ids = Array.isArray(l.sistema_role_ids) && l.sistema_role_ids.length
                ? l.sistema_role_ids.map(Number)
                : (l.sistema_role_id != null ? [Number(l.sistema_role_id)] : []);
            return [Number(l.sistema_id ?? l), ids];
        })
    );
    if (!sistemasCache.length) {
        box.innerHTML = '<p class="empty">No hay sistemas disponibles.</p>';
        return;
    }

    const rolesBySystem = await Promise.all(
        sistemasCache.map((s) => api(`/api/systems/${s.id}/roles`).catch(() => []))
    );

    const fromPuesto = new Set(
        userLinks.filter((l) => l && (l.from_puesto || l.linked_by === 'puesto')).map((l) => Number(l.sistema_id ?? l))
    );

    box.innerHTML = sistemasCache.map((s, i) => {
        const roles = rolesBySystem[i];
        const sid = Number(s.id);
        const checked = linkMap.has(sid);
        const selectedRoles = new Set(linkMap.get(sid) || []);
        const inherited = fromPuesto.has(sid);
        const roleChecks = roles.length
            ? roles.map((r) => {
                const on = checked
                    ? (selectedRoles.size ? selectedRoles.has(Number(r.id)) : Number(r.is_default) === 1)
                    : Number(r.is_default) === 1;
                return `<label class="role-chip"><input type="checkbox" data-sistema-role="${s.id}" value="${r.id}" ${on ? 'checked' : ''} ${checked && !inherited ? '' : 'disabled'}> ${esc(r.nombre)}</label>`;
            }).join('')
            : '<span class="muted">Sin roles internos</span>';
        return `
        <div class="sistema-link-row" data-sistema-row="${s.id}">
            <label class="checkbox-item">
                <input type="checkbox" name="sistema" value="${s.id}" data-sistema-check ${checked ? 'checked' : ''} ${inherited ? 'disabled' : ''}>
                <span>${esc(s.nombre)} <code>${esc(s.client_id)}</code>${inherited ? ' <em class="muted">(por puesto)</em>' : ''}</span>
            </label>
            <div class="role-chips" data-sistema-roles-for="${s.id}">${roleChecks}</div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-sistema-check]').forEach((cb) => {
        cb.addEventListener('change', () => {
            box.querySelectorAll(`[data-sistema-role="${cb.value}"]`).forEach((roleCb) => {
                roleCb.disabled = !cb.checked;
                if (cb.checked && !box.querySelector(`[data-sistema-role="${cb.value}"]:checked`)) {
                    // leave as-is; defaults already set when rendered
                }
                if (!cb.checked) roleCb.checked = false;
            });
            if (cb.checked) {
                const roles = box.querySelectorAll(`[data-sistema-role="${cb.value}"]`);
                const any = [...roles].some((r) => r.checked);
                if (!any && roles.length) {
                    const def = [...roles].find((r) => r.closest('label')?.textContent?.toLowerCase().includes('usuario')) || roles[0];
                    if (def) def.checked = true;
                }
            }
        });
    });
}

function getSelectedSistemaLinks() {
    return [...document.querySelectorAll('#sistemas-checkboxes [data-sistema-check]:checked')].map((cb) => {
        const roleIds = [...document.querySelectorAll(`#sistemas-checkboxes [data-sistema-role="${cb.value}"]:checked`)]
            .map((r) => Number(r.value))
            .filter((n) => Number.isFinite(n) && n > 0);
        return { sistema_id: Number(cb.value), sistema_role_ids: roleIds };
    });
}

function getSelectedSistemaIds() {
    return getSelectedSistemaLinks().map((l) => l.sistema_id);
}

let _usersCache = [];

function fillOrgDatalists(users) {
    const sets = {
        'dl-division': new Set(),
        'dl-area': new Set(),
        'dl-region': new Set(),
        'dl-store': new Set(),
        'dl-puesto': new Set(),
    };
    users.forEach((u) => {
        if (u.division) sets['dl-division'].add(u.division);
        if (u.area) sets['dl-area'].add(u.area);
        if (u.region) sets['dl-region'].add(u.region);
        if (u.store) sets['dl-store'].add(u.store);
        if (u.jobD) sets['dl-puesto'].add(u.jobD);
    });
    Object.entries(sets).forEach(([id, values]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = [...values].sort().map((v) => `<option value="${esc(v)}">`).join('');
    });
}

function renderUsersRows(users) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay usuarios registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u) => `
        <tr>
            <td><strong>${esc(u.user)}</strong></td>
            <td>${esc(u.name)} ${esc(u.last_name)}</td>
            <td>${esc(u.email || '—')}</td>
            <td>${esc(u.jobD || '—')}</td>
            <td>${esc(u.area || '—')}</td>
            <td>${badge(u.rol_nombre, u.rol === 1 ? 'admin' : u.rol === 3 ? 'devadmin' : 'user')}</td>
            <td>${badge(u.enabled ? 'Activo' : 'Bloqueado', u.enabled ? 'ok' : 'off')}</td>
            <td class="actions">
                <button class="btn-icon" data-edit="${esc(u.user)}" title="Editar">✎</button>
            </td>
        </tr>
    `).join('');
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    try {
        const users = await api('/api/users');
        _usersCache = users;
        fillOrgDatalists(users);
        const q = (document.getElementById('users-search')?.value || '').trim().toLowerCase();
        const filtered = !q ? users : users.filter((u) =>
            [u.user, u.name, u.last_name, u.email, u.jobD, u.area]
                .some((v) => String(v || '').toLowerCase().includes(q))
        );
        renderUsersRows(filtered);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="error">${esc(err.message)}</td></tr>`;
    }
}

function openModal(mode, user) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const pwHint = document.getElementById('pw-hint');
    document.getElementById('edit-mode').value = mode;
    document.getElementById('f-user').disabled = mode === 'edit';
    document.getElementById('f-password').required = mode === 'create';
    pwHint.textContent = mode === 'create' ? '*' : '(dejar vacío para no cambiar)';
    document.getElementById('force-first-field')?.classList.toggle('hidden', mode !== 'edit');

    if (mode === 'create') {
        title.textContent = 'Nuevo usuario';
        document.getElementById('user-form').reset();
        document.getElementById('f-enabled').value = '1';
        document.getElementById('f-force-first')?.setAttribute('value', '1');
        loadRolesSelect().then(() => loadSistemasCheckboxes([]));
    } else {
        title.textContent = `Editar: ${user.user}`;
        document.getElementById('f-user').value = user.user;
        document.getElementById('f-name').value = user.name || '';
        document.getElementById('f-lastname').value = user.last_name || '';
        document.getElementById('f-email').value = user.email || '';
        document.getElementById('f-division').value = user.division || '';
        document.getElementById('f-area').value = user.area || '';
        document.getElementById('f-region').value = user.region || '';
        document.getElementById('f-store').value = user.store || '';
        document.getElementById('f-jobd').value = user.jobD || '';
        document.getElementById('f-dept').value = user.dept || '';
        document.getElementById('f-enabled').value = String(user.enabled);
        document.getElementById('f-password').value = '';
        document.getElementById('f-force-first').value = Number(user.PrimerInicio) ? '1' : '0';
        loadRolesSelect().then(() => {
            document.getElementById('f-rol').value = String(user.rol);
            loadSistemasCheckboxes(user.sistema_links?.length ? user.sistema_links : (user.sistema_ids || []).map((id) => ({ sistema_id: id })));
        });
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal')?.classList.add('hidden');
}

function initUsersPage() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    loadRolesSelect().then(loadUsers);
    document.getElementById('users-search')?.addEventListener('input', () => {
        const q = (document.getElementById('users-search').value || '').trim().toLowerCase();
        const filtered = !q ? _usersCache : _usersCache.filter((u) =>
            [u.user, u.name, u.last_name, u.email, u.jobD, u.area]
                .some((v) => String(v || '').toLowerCase().includes(q))
        );
        renderUsersRows(filtered);
    });

    if (!isAdmin()) {
        document.getElementById('btn-sync')?.remove();
    }

    document.getElementById('btn-new-user')?.addEventListener('click', () => openModal('create'));
    document.getElementById('btn-sync')?.addEventListener('click', () => runFullSync(document.getElementById('btn-sync')));

    tbody.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        if (edit) {
            try {
                const user = await api(`/api/users/${edit.dataset.edit}`);
                openModal('edit', user);
            } catch (err) { showAlert(err.message); }
        }
    });

    document.getElementById('user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mode = document.getElementById('edit-mode').value;
        const body = {
            user: document.getElementById('f-user').value,
            name: document.getElementById('f-name').value,
            last_name: document.getElementById('f-lastname').value,
            email: document.getElementById('f-email').value,
            division: document.getElementById('f-division')?.value || '',
            area: document.getElementById('f-area').value,
            region: document.getElementById('f-region')?.value || '',
            store: document.getElementById('f-store')?.value || '',
            jobD: document.getElementById('f-jobd')?.value || '',
            dept: document.getElementById('f-dept').value,
            enabled: document.getElementById('f-enabled').value,
            rol: document.getElementById('f-rol').value,
        };
        if (mode === 'edit') {
            body.PrimerInicio = document.getElementById('f-force-first')?.value === '1' ? 1 : 0;
        }
        const password = document.getElementById('f-password').value;

        try {
            const sistemaLinks = getSelectedSistemaLinks();
            if (mode === 'create') {
                body.password = password;
                body.sistema_links = sistemaLinks;
                await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
                showAlert('Usuario creado y sincronizado', 'ok');
            } else {
                await api(`/api/users/${body.user}`, { method: 'PUT', body: JSON.stringify(body) });
                if (password) {
                    await api(`/api/users/${body.user}/password`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            password,
                            force_first_login: body.PrimerInicio === 1,
                        }),
                    });
                }
                await api(`/api/users/${body.user}/sistemas`, {
                    method: 'PUT',
                    body: JSON.stringify({ sistema_links: getSelectedSistemaLinks() }),
                });
                showAlert('Usuario actualizado', 'ok');
            }
            closeModal();
            loadUsers();
        } catch (err) { showAlert(err.message); }
    });

    document.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
    });
}

// ── Systems page ──

async function loadSystems() {
    const tbody = document.getElementById('systems-tbody');
    if (!tbody) return;

    try {
        const systems = await api('/api/systems');
        const colSpan = isAdmin() ? 6 : 5;
        if (!systems.length) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty">No hay sistemas registrados.</td></tr>`;
            return;
        }
        tbody.innerHTML = systems.map((s) => `
            <tr class="clickable-row" data-href="${appUrl(`/sistemas/${s.id}`)}">
                <td><strong>${esc(s.client_id)}</strong></td>
                <td>${esc(s.nombre)}</td>
                ${isAdmin() ? `<td class="col-owner">${esc(s.owner || '—')}</td>` : ''}
                <td class="uris-cell">${(s.redirectUris || []).map((u) => `<code>${esc(u)}</code>`).join('<br>')}</td>
                <td>${badge(s.enabled ? 'Activo' : 'Inactivo', s.enabled ? 'ok' : 'off')}</td>
                <td class="actions">
                    <span class="row-open-hint">Abrir →</span>
                    <button class="btn-icon danger" data-delete-system="${s.id}" data-name="${esc(s.client_id)}" title="Eliminar">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`;
    }
}

function showSecretBox(secret) {
    const box = document.getElementById('secret-display');
    const val = document.getElementById('secret-value');
    if (!box || !val) return;
    val.textContent = secret;
    box.classList.remove('hidden');
}

function openSystemModal() {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = 'Nuevo sistema';
    document.getElementById('system-form').reset();
    document.getElementById('f-webOrigins').value = '+';
    document.getElementById('f-enabled').value = '1';
    document.getElementById('secret-display').classList.add('hidden');
    document.getElementById('btn-go-to-system')?.classList.add('hidden');
    modal.classList.remove('hidden');
}

function initSystemsPage() {
    const tbody = document.getElementById('systems-tbody');
    if (!tbody) return;

    loadSystems();

    document.getElementById('btn-new-system')?.addEventListener('click', () => openSystemModal());

    tbody.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-delete-system]');
        if (del) {
            e.stopPropagation();
            const name = del.dataset.name;
            if (!confirm(`¿Eliminar sistema "${name}"?`)) return;
            try {
                await api(`/api/systems/${del.dataset.deleteSystem}`, { method: 'DELETE' });
                showAlert('Sistema eliminado', 'ok');
                loadSystems();
            } catch (err) { showAlert(err.message); }
            return;
        }
        const row = e.target.closest('[data-href]');
        if (row) window.location.href = row.dataset.href;
    });

    document.getElementById('btn-copy-secret')?.addEventListener('click', () => {
        const secret = document.getElementById('secret-value')?.textContent;
        if (secret) navigator.clipboard.writeText(secret).then(() => showAlert('Copiado al portapapeles', 'ok'));
    });

    document.getElementById('system-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            clientId: document.getElementById('f-clientId').value,
            name: document.getElementById('f-name').value,
            redirectUris: document.getElementById('f-redirectUris').value,
            webOrigins: document.getElementById('f-webOrigins').value,
            enabled: document.getElementById('f-enabled').value,
            secret: document.getElementById('f-secret').value,
        };

        try {
            const created = await api('/api/systems', { method: 'POST', body: JSON.stringify(body) });
            showAlert('Sistema creado', 'ok');
            if (created.secret) {
                showSecretBox(created.secret);
                const goBtn = document.getElementById('btn-go-to-system');
                if (goBtn && created.id) {
                    goBtn.href = `/sistemas/${created.id}`;
                    goBtn.classList.remove('hidden');
                }
            } else {
                closeModal();
                if (created.id) window.location.href = appUrl(`/sistemas/${created.id}`);
            }
            loadSystems();
        } catch (err) { showAlert(err.message); }
    });

    document.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
    });
}

let currentRolesSistemaId = null;
let systemRolesCache = [];
let systemUserSearchTimer = null;
let systemUsersPage = 1;
let systemUsersQuery = '';
const systemUsersPageSize = 20;

async function refreshSystemRolesCache() {
    if (!currentRolesSistemaId) return [];
    systemRolesCache = await api(`/api/systems/${currentRolesSistemaId}/roles`);
    return systemRolesCache;
}

async function loadSystemRolesList() {
    const tbody = document.getElementById('system-roles-tbody');
    if (!tbody || !currentRolesSistemaId) return;
    try {
        const roles = await refreshSystemRolesCache();
        if (!roles.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin roles. Agrega uno abajo.</td></tr>';
            return;
        }
        tbody.innerHTML = roles.map((r) => `
            <tr>
                <td><code>${esc(r.codigo)}</code></td>
                <td><strong>${esc(r.nombre)}</strong></td>
                <td>${esc(r.descripcion || '—')}</td>
                <td>${Number(r.is_default) ? badge('Por defecto', 'ok') : '—'}</td>
                <td>
                    <label class="inline-check" title="Solicitar autenticador al entrar con este rol">
                        <input type="checkbox" data-role-id="${r.id}" ${Number(r.require_2fa) ? 'checked' : ''}>
                        ${Number(r.require_2fa) ? 'Activo' : 'Inactivo'}
                    </label>
                </td>
                <td class="actions">
                    <button type="button" class="btn-icon" data-edit-role-description="${r.id}" title="Editar descripción">✎</button>
                    ${!Number(r.is_default) ? `<button type="button" class="btn-icon" data-set-default-role="${r.id}" title="Marcar por defecto">★</button>` : ''}
                    <button type="button" class="btn-icon danger" data-delete-role="${r.id}" title="Eliminar">✕</button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-edit-role-description]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const roleId = Number(btn.dataset.editRoleDescription);
                const role = roles.find((item) => Number(item.id) === roleId);
                if (!role) return showAlert('Rol no encontrado');
                const description = prompt('Descripción del rol:', role.descripcion || '');
                if (description === null) return;
                try {
                    await api(`/api/systems/${currentRolesSistemaId}/roles/${roleId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ descripcion: description.trim() }),
                    });
                    showAlert('Descripción del rol actualizada', 'ok');
                    loadSystemRolesList();
                } catch (err) { showAlert(err.message); }
            });
        });

        tbody.querySelectorAll('[data-set-default-role]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api(`/api/systems/${currentRolesSistemaId}/roles/${btn.dataset.setDefaultRole}`, {
                        method: 'PUT',
                        body: JSON.stringify({ is_default: 1 }),
                    });
                    showAlert('Rol por defecto actualizado', 'ok');
                    loadSystemRolesList();
                } catch (err) { showAlert(err.message); }
            });
        });
        tbody.querySelectorAll('[data-role-id]').forEach((input) => {
            input.addEventListener('change', async () => {
                const enabled = input.checked;
                input.disabled = true;
                try {
                    await api(`/api/systems/${currentRolesSistemaId}/roles/${input.dataset.roleId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ require_2fa: enabled ? 1 : 0 }),
                    });
                    showAlert(`2FA ${enabled ? 'activado' : 'desactivado'} para el rol`, 'ok');
                    loadSystemRolesList();
                } catch (err) {
                    input.checked = !enabled;
                    input.disabled = false;
                    showAlert(err.message);
                }
            });
        });
        tbody.querySelectorAll('[data-delete-role]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar este rol?')) return;
                try {
                    await api(`/api/systems/${currentRolesSistemaId}/roles/${btn.dataset.deleteRole}`, { method: 'DELETE' });
                    showAlert('Rol eliminado', 'ok');
                    loadSystemRolesList();
                } catch (err) { showAlert(err.message); }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin() ? 6 : 5}" class="error">${esc(err.message)}</td></tr>`;
    }
}

function renderSystemUsersPagination(meta) {
    const pager = document.getElementById('system-users-pagination');
    if (!pager) return;
    const total = Number(meta.total) || 0;
    const page = Number(meta.page) || 1;
    const totalPages = Number(meta.totalPages) || 1;
    if (!total) {
        pager.classList.add('hidden');
        pager.innerHTML = '';
        return;
    }
    const first = ((page - 1) * systemUsersPageSize) + 1;
    const last = Math.min(page * systemUsersPageSize, total);
    pager.innerHTML = `
        <span>Mostrando ${first}–${last} de ${total}</span>
        <div class="pagination-actions">
            <button type="button" class="btn-secondary btn-sm" data-users-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${page} de ${totalPages}</span>
            <button type="button" class="btn-secondary btn-sm" data-users-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button>
        </div>`;
    pager.classList.remove('hidden');
    pager.querySelectorAll('[data-users-page]').forEach((button) => {
        button.addEventListener('click', () => {
            systemUsersPage = Number(button.dataset.usersPage);
            loadSystemUsersList();
        });
    });
}

async function loadSystemUsersList(page = systemUsersPage) {
    const tbody = document.getElementById('system-users-tbody');
    if (!tbody || !currentRolesSistemaId) return;
    try {
        await refreshSystemRolesCache();
        const result = await api(`/api/systems/${currentRolesSistemaId}/users?page=${page}&page_size=${systemUsersPageSize}&q=${encodeURIComponent(systemUsersQuery)}`);
        const users = Array.isArray(result) ? result : (result.items || []);
        systemUsersPage = Number(result.page) || 1;
        renderSystemUsersPagination(Array.isArray(result)
            ? { page: 1, totalPages: 1, total: result.length }
            : result);
        if (!users.length) {
            tbody.innerHTML = systemUsersQuery
                ? '<tr><td colspan="6" class="empty">No hay usuarios con ese criterio.</td></tr>'
                : '<tr><td colspan="6" class="empty">Aún no hay usuarios vinculados. Usa el buscador superior para dar acceso.</td></tr>';
            return;
        }
        tbody.innerHTML = users.map((u) => {
            const roleNames = (u.roles || []).map((r) => r.nombre).filter(Boolean);
            const summary = roleNames.length
                ? (roleNames.length <= 2
                    ? roleNames.join(', ')
                    : `${roleNames.slice(0, 2).join(', ')} +${roleNames.length - 2}`)
                : 'Sin roles';
            return `
            <tr>
                <td><strong>${esc(u.user)}</strong></td>
                <td>${esc(u.name)} ${esc(u.last_name)}</td>
                <td>${esc(u.email || '—')}</td>
                <td><span class="muted">${esc(summary)}</span></td>
                <td>${badge(u.enabled ? 'Activo' : 'Bloqueado', u.enabled ? 'ok' : 'off')}</td>
                <td class="actions actions-row">
                    <button type="button" class="btn-secondary btn-sm" data-edit-user-roles="${esc(u.user)}"
                        data-user-name="${esc(((u.name || '') + ' ' + (u.last_name || '')).trim())}"
                        data-role-ids="${esc((u.sistema_role_ids || []).join(','))}">Roles</button>
                    <button type="button" class="btn-icon danger" data-remove-user="${esc(u.user)}" title="Quitar acceso">✕</button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-edit-user-roles]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const ids = String(btn.dataset.roleIds || '')
                    .split(',')
                    .map((n) => Number(n))
                    .filter((n) => Number.isFinite(n) && n > 0);
                openSystemUserRolesModal(btn.dataset.editUserRoles, btn.dataset.userName || '', ids);
            });
        });

        tbody.querySelectorAll('[data-remove-user]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.removeUser;
                if (!confirm(`¿Quitar acceso de "${username}" a este sistema?`)) return;
                try {
                    await api(`/api/systems/${currentRolesSistemaId}/users/${encodeURIComponent(username)}`, {
                        method: 'DELETE',
                    });
                    showAlert('Acceso removido', 'ok');
                    loadSystemUsersList();
                } catch (err) { showAlert(err.message); }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`;
        renderSystemUsersPagination({ total: 0 });
    }
}

let _editingSystemUserRoles = null;

function closeSystemUserRolesModal() {
    document.getElementById('system-user-roles-modal')?.classList.add('hidden');
    _editingSystemUserRoles = null;
}

async function openSystemUserRolesModal(username, displayName = '', selectedIds = []) {
    const modal = document.getElementById('system-user-roles-modal');
    const list = document.getElementById('system-user-roles-list');
    if (!modal || !list) return;
    await refreshSystemRolesCache();
    _editingSystemUserRoles = username;
    const selected = new Set((selectedIds || []).map(Number));
    document.getElementById('system-user-roles-title').textContent = `Roles · ${username}`;
    document.getElementById('system-user-roles-sub').textContent = displayName
        ? `${displayName} — marca uno o varios roles internos`
        : 'Marca uno o varios roles internos para este usuario';
    if (!systemRolesCache.length) {
        list.innerHTML = '<p class="empty">Este sistema no tiene roles internos definidos.</p>';
    } else {
        const allChecked = systemRolesCache.length > 0
            && systemRolesCache.every((r) => selected.has(Number(r.id)));
        list.innerHTML = `
            <label class="checkbox-item roles-check-all">
                <input type="checkbox" id="system-user-roles-all" ${allChecked ? 'checked' : ''}>
                <span><strong>Todos</strong></span>
            </label>
            ${systemRolesCache.map((r) => `
            <label class="checkbox-item">
                <input type="checkbox" data-modal-user-role value="${r.id}" ${selected.has(Number(r.id)) ? 'checked' : ''}>
                <span>${esc(r.nombre)} <code>${esc(r.codigo)}</code></span>
            </label>`).join('')}`;
        wireSystemUserRolesSelectAll(list);
    }
    modal.classList.remove('hidden');
}

function syncSystemUserRolesSelectAll(list) {
    const allCb = list.querySelector('#system-user-roles-all');
    const roleCbs = [...list.querySelectorAll('[data-modal-user-role]')];
    if (!allCb || !roleCbs.length) return;
    const checkedCount = roleCbs.filter((cb) => cb.checked).length;
    allCb.checked = checkedCount === roleCbs.length;
    allCb.indeterminate = checkedCount > 0 && checkedCount < roleCbs.length;
}

function wireSystemUserRolesSelectAll(list) {
    const allCb = list.querySelector('#system-user-roles-all');
    if (!allCb) return;
    allCb.addEventListener('change', () => {
        list.querySelectorAll('[data-modal-user-role]').forEach((cb) => {
            cb.checked = allCb.checked;
        });
        allCb.indeterminate = false;
    });
    list.querySelectorAll('[data-modal-user-role]').forEach((cb) => {
        cb.addEventListener('change', () => syncSystemUserRolesSelectAll(list));
    });
    syncSystemUserRolesSelectAll(list);
}

async function saveSystemUserRoles() {
    if (!_editingSystemUserRoles || !currentRolesSistemaId) return;
    const btn = document.getElementById('btn-save-user-roles');
    const roleIds = [...document.querySelectorAll('#system-user-roles-list [data-modal-user-role]:checked')]
        .map((el) => Number(el.value))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando…';
    }
    try {
        await api(`/api/systems/${currentRolesSistemaId}/users/${encodeURIComponent(_editingSystemUserRoles)}`, {
            method: 'PUT',
            body: JSON.stringify({ sistema_role_ids: roleIds }),
        });
        showAlert(`Roles de ${_editingSystemUserRoles} actualizados`, 'ok');
        closeSystemUserRolesModal();
        loadSystemUsersList();
    } catch (err) {
        showAlert(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Guardar roles';
        }
    }
}

function renderUserSearchResults(users) {
    const box = document.getElementById('system-user-search-results');
    if (!box) return;
    if (!users.length) {
        box.innerHTML = '<p class="search-empty">No hay usuarios disponibles con ese criterio.</p>';
        box.classList.remove('hidden');
        return;
    }
    box.innerHTML = users.map((u) => `
        <div class="search-result-row">
            <div class="search-result-info">
                <strong>${esc(u.user)}</strong>
                <span>${esc(u.name)} ${esc(u.last_name)} · ${esc(u.email || '')}</span>
            </div>
            <button type="button" class="btn-primary btn-sm" data-add-user="${esc(u.user)}">Agregar</button>
        </div>`).join('');
    box.classList.remove('hidden');

    box.querySelectorAll('[data-add-user]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const username = btn.dataset.addUser;
            try {
                await api(`/api/systems/${currentRolesSistemaId}/users`, {
                    method: 'POST',
                    body: JSON.stringify({ user: username, sistema_role_ids: [] }),
                });
                showAlert(`Usuario ${username} agregado. Puedes asignarle roles con el botón Roles.`, 'ok', 8000);
                document.getElementById('system-user-search').value = '';
                box.classList.add('hidden');
                box.innerHTML = '';
                loadSystemUsersList();
            } catch (err) { showAlert(err.message); }
        });
    });
}

async function searchUsersForSystem(query) {
    if (!currentRolesSistemaId) return;
    await refreshSystemRolesCache();
    const users = await api(`/api/systems/${currentRolesSistemaId}/users/search?q=${encodeURIComponent(query)}`);
    renderUserSearchResults(users);
}

function initSystemUsersSection() {
    const searchInput = document.getElementById('system-user-search');
    const tableSearchInput = document.getElementById('system-users-filter');
    const loadBtn = document.getElementById('btn-load-available-users');

    tableSearchInput?.addEventListener('input', () => {
        clearTimeout(systemUserSearchTimer);
        systemUsersQuery = tableSearchInput.value.trim();
        systemUsersPage = 1;
        systemUserSearchTimer = setTimeout(() => loadSystemUsersList(1), 250);
    });

    searchInput?.addEventListener('input', () => {
        clearTimeout(systemUserSearchTimer);
        const q = searchInput.value.trim();
        if (q.length < 2) {
            document.getElementById('system-user-search-results')?.classList.add('hidden');
            return;
        }
        systemUserSearchTimer = setTimeout(() => searchUsersForSystem(q), 300);
    });

    loadBtn?.addEventListener('click', async () => {
        try {
            await searchUsersForSystem('');
            searchInput.value = '';
        } catch (err) { showAlert(err.message); }
    });

    document.addEventListener('click', (e) => {
        const box = document.getElementById('system-user-search-results');
        const wrap = document.querySelector('.user-add-card');
        if (box && wrap && !wrap.contains(e.target)) {
            box.classList.add('hidden');
        }
    });

    document.getElementById('btn-save-user-roles')?.addEventListener('click', saveSystemUserRoles);
    document.querySelectorAll('[data-close-user-roles-modal]').forEach((el) => {
        el.addEventListener('click', closeSystemUserRolesModal);
    });
}

async function loadSystemDetail() {
    const root = document.getElementById('system-detail-root');
    if (!root) return;

    const sistemaId = root.dataset.systemId;
    currentRolesSistemaId = sistemaId;

    try {
        const system = await api(`/api/systems/${sistemaId}`);
        document.getElementById('detail-title').textContent = system.nombre || system.client_id;
        document.getElementById('detail-client-id').textContent = system.client_id;
        document.getElementById('df-clientId').value = system.client_id;
        document.getElementById('df-name').value = system.nombre || '';
        document.getElementById('df-redirectUris').value = (system.redirectUris || []).join('\n');
        document.getElementById('df-webOrigins').value = system.web_origins || '+';
        document.getElementById('df-enabled').value = system.enabled ? '1' : '0';
        document.title = `${system.nombre || system.client_id} — Sistemas — MOBO SSO`;
        loadSystemRolesList();
        loadSystemUsersList();
    } catch (err) {
        showAlert(err.message);
        setTimeout(() => { window.location.href = appUrl('/sistemas'); }, 2000);
    }
}

function showDetailSecret(secret) {
    const box = document.getElementById('detail-secret-display');
    const val = document.getElementById('detail-secret-value');
    if (!box || !val) return;
    val.textContent = secret;
    box.classList.remove('hidden');
}

function setSystemDetailEditing(editing) {
    ['df-name', 'df-redirectUris', 'df-webOrigins', 'df-enabled'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.disabled = !editing;
    });
    document.getElementById('btn-detail-edit')?.classList.toggle('hidden', editing);
    document.getElementById('system-detail-edit-actions')?.classList.toggle('hidden', !editing);
}

function initSystemDetailPage() {
    const root = document.getElementById('system-detail-root');
    if (!root) return;

    loadSystemDetail();

    document.getElementById('btn-detail-edit')?.addEventListener('click', () => {
        setSystemDetailEditing(true);
        document.getElementById('df-name')?.focus();
    });

    document.getElementById('btn-detail-cancel-edit')?.addEventListener('click', () => {
        setSystemDetailEditing(false);
        loadSystemDetail();
    });

    document.getElementById('system-detail-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = root.dataset.systemId;
        const body = {
            name: document.getElementById('df-name').value,
            redirectUris: document.getElementById('df-redirectUris').value,
            webOrigins: document.getElementById('df-webOrigins').value,
            enabled: document.getElementById('df-enabled').value,
        };
        try {
            await api(`/api/systems/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            showAlert('Sistema actualizado', 'ok');
            setSystemDetailEditing(false);
            loadSystemDetail();
        } catch (err) { showAlert(err.message); }
    });

    document.getElementById('btn-detail-show-secret')?.addEventListener('click', async () => {
        try {
            const { secret } = await api(`/api/systems/${root.dataset.systemId}/secret`);
            showDetailSecret(secret);
        } catch (err) { showAlert(err.message); }
    });

    document.getElementById('btn-detail-regen-secret')?.addEventListener('click', async () => {
        if (!confirm('¿Regenerar el secreto? Las apps deberán actualizar su configuración.')) return;
        try {
            const { secret } = await api(`/api/systems/${root.dataset.systemId}/regenerate-secret`, { method: 'POST' });
            showDetailSecret(secret);
            showAlert('Secreto regenerado', 'ok');
        } catch (err) { showAlert(err.message); }
    });

    document.getElementById('btn-detail-copy-secret')?.addEventListener('click', () => {
        const secret = document.getElementById('detail-secret-value')?.textContent;
        if (secret) navigator.clipboard.writeText(secret).then(() => showAlert('Copiado al portapapeles', 'ok'));
    });

    document.getElementById('btn-detail-delete')?.addEventListener('click', async () => {
        const clientId = document.getElementById('detail-client-id')?.textContent;
        if (!confirm(`¿Eliminar sistema "${clientId}"?`)) return;
        try {
            await api(`/api/systems/${root.dataset.systemId}`, { method: 'DELETE' });
            window.location.href = appUrl('/sistemas');
        } catch (err) { showAlert(err.message); }
    });

    initSystemRolesForm();
    initSystemUsersSection();
}

function initSystemRolesForm() {
    document.getElementById('btn-add-system-role')?.addEventListener('click', async () => {
        if (!currentRolesSistemaId) return;
        const codigo = document.getElementById('new-role-codigo').value.trim();
        const nombre = document.getElementById('new-role-nombre').value.trim();
        const descripcion = document.getElementById('new-role-desc').value.trim();
        const require2fa = document.getElementById('new-role-require-2fa')?.checked;
        if (!codigo || !nombre) return showAlert('Código y nombre son obligatorios');
        try {
            await api(`/api/systems/${currentRolesSistemaId}/roles`, {
                method: 'POST',
                body: JSON.stringify({ codigo, nombre, descripcion, require_2fa: require2fa ? 1 : 0 }),
            });
            showAlert('Rol creado', 'ok');
            document.getElementById('new-role-codigo').value = '';
            document.getElementById('new-role-nombre').value = '';
            document.getElementById('new-role-desc').value = '';
            document.getElementById('new-role-require-2fa').checked = false;
            loadSystemRolesList();
            loadSystemUsersList();
        } catch (err) { showAlert(err.message); }
    });
}

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rolBadge(rol, nombre) {
    const variant = rol === 1 ? 'admin' : rol === 3 ? 'devadmin' : 'user';
    return badge(nombre, variant);
}

async function loadDashboard() {
    const statActive = document.getElementById('stat-active');
    if (!statActive) return;

    try {
        const data = await api('/api/dashboard');

        statActive.textContent = data.activeUsers;
        document.getElementById('stat-systems').textContent = data.systems;
        document.getElementById('stat-links').textContent = data.links;
        document.getElementById('stat-unlinked').textContent = data.usersWithoutCount;

        const blockedHint = document.getElementById('stat-blocked-hint');
        if (blockedHint) {
            blockedHint.textContent = data.blockedUsers > 0
                ? `${data.blockedUsers} bloqueado(s)`
                : 'Todos activos o sin bloqueos';
        }

        const unlinkedHint = document.getElementById('stat-unlinked-hint');
        if (unlinkedHint) {
            unlinkedHint.textContent = data.scope === 'own'
                ? 'Sin vínculo a tus sistemas'
                : 'Sin vínculo a ningún sistema';
        }

        const kcStatus = document.getElementById('kc-status');
        if (kcStatus) {
            kcStatus.innerHTML = data.keycloakOnline
                ? '<span class="status-dot ok"></span><span>Keycloak en línea</span>'
                : '<span class="status-dot off"></span><span>Keycloak no responde</span>';
        }

        const unlinkedTbody = document.getElementById('unlinked-tbody');
        if (!data.usersWithoutSystem.length) {
            unlinkedTbody.innerHTML = '<tr><td colspan="3" class="empty">Todos los usuarios activos tienen al menos un sistema.</td></tr>';
        } else {
            unlinkedTbody.innerHTML = data.usersWithoutSystem.map((u) => `
                <tr>
                    <td><strong>${u.user}</strong></td>
                    <td>${u.name} ${u.last_name}</td>
                    <td>${rolBadge(u.rol, u.rol_nombre)}</td>
                </tr>
            `).join('');
        }

        const systemsTbody = document.getElementById('systems-stats-tbody');
        if (!data.systemsWithUsers.length) {
            systemsTbody.innerHTML = '<tr><td colspan="3" class="empty">No hay sistemas registrados.</td></tr>';
        } else {
            systemsTbody.innerHTML = data.systemsWithUsers.map((s) => `
                <tr class="clickable-row" data-href="${appUrl(`/sistemas/${s.id}`)}">
                    <td><strong>${s.nombre}</strong></td>
                    <td><code>${s.client_id}</code></td>
                    <td>${s.user_count}</td>
                </tr>
            `).join('');
            systemsTbody.querySelectorAll('[data-href]').forEach((row) => {
                row.addEventListener('click', () => { window.location.href = row.dataset.href; });
            });
        }

        const recentTbody = document.getElementById('recent-tbody');
        if (!data.recentUsers.length) {
            recentTbody.innerHTML = '<tr><td colspan="5" class="empty">Sin usuarios registrados.</td></tr>';
        } else {
            recentTbody.innerHTML = data.recentUsers.map((u) => `
                <tr>
                    <td><strong>${u.user}</strong></td>
                    <td>${u.name} ${u.last_name}</td>
                    <td>${rolBadge(u.rol, u.rol_nombre)}</td>
                    <td>${badge(u.enabled ? 'Activo' : 'Bloqueado', u.enabled ? 'ok' : 'off')}</td>
                    <td>${formatDate(u.created_at)}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        [['unlinked-tbody', 3], ['systems-stats-tbody', 3], ['recent-tbody', 5]].forEach(([id, cols]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<tr><td colspan="${cols}" class="error">${err.message}</td></tr>`;
        });
        showAlert(err.message);
    }
}

function initDashboardPage() {
    loadDashboard();

    if (!isAdmin()) {
        document.getElementById('btn-dashboard-sync')?.remove();
    }

    document.getElementById('btn-dashboard-sync')?.addEventListener('click', () => {
        runFullSync(document.getElementById('btn-dashboard-sync'), () => loadDashboard());
    });
}

function showSyncOverlay(title = 'Sincronizando', subtitle = 'Actualizando usuarios en Keycloak') {
    let el = document.getElementById('sync-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sync-overlay';
        el.className = 'sync-overlay';
        el.innerHTML = `
            <div class="sync-overlay-card" role="status" aria-live="polite">
                <div class="sync-spinner" aria-hidden="true"></div>
                <h3 class="sync-overlay-title"></h3>
                <p class="sync-overlay-sub"></p>
            </div>
        `;
        document.body.appendChild(el);
    }
    el.querySelector('.sync-overlay-title').textContent = title;
    el.querySelector('.sync-overlay-sub').textContent = subtitle;
    el.classList.add('is-visible');
    document.body.classList.add('sync-overlay-open');
}

function hideSyncOverlay() {
    const el = document.getElementById('sync-overlay');
    if (el) el.classList.remove('is-visible');
    document.body.classList.remove('sync-overlay-open');
}

async function runFullSync(btn, onDone) {
    if (!btn || btn.dataset.busy === '1') return;
    const original = btn.textContent;
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.textContent = 'Sincronizando…';
    showSyncOverlay('Sincronizando', 'Esto puede tardar unos minutos. No cierres esta ventana.');
    try {
        const r = await api('/api/users/sync/all', { method: 'POST' });
        const errPart = r.errorCount ? ` · ${r.errorCount} con error` : '';
        showAlert(
            `Sincronizados ${r.synced}/${r.total || r.synced} usuarios · ${r.accessSynced || 0} accesos${errPart}`,
            r.errorCount ? 'error' : 'ok',
            12000
        );
        if (typeof onDone === 'function') onDone();
        else loadUsers();
    } catch (err) {
        showAlert(err.message || 'Error al sincronizar');
    } finally {
        hideSyncOverlay();
        btn.dataset.busy = '0';
        btn.disabled = false;
        btn.textContent = original;
    }
}


// ── Puestos (catálogo + sistemas por puesto) ──

let _puestosCache = [];
let _editingPuestoId = null;

function renderPuestosRows(puestos) {
    const tbody = document.getElementById('puestos-tbody');
    const count = document.getElementById('puestos-count');
    if (!tbody) return;
    if (count) count.textContent = `${puestos.length} puesto${puestos.length === 1 ? '' : 's'}`;
    if (!puestos.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">Sin resultados.</td></tr>';
        return;
    }
    tbody.innerHTML = puestos.map((p) => `
        <tr>
            <td><strong>${esc(p.nombre || '—')}</strong></td>
            <td>${Number(p.usuarios) || 0}</td>
            <td>${Number(p.sistemas) || 0}</td>
            <td class="actions">
                <button type="button" class="btn-row-action" data-puesto-sistemas="${p.id}" title="Vincular sistemas">
                    Sistemas <span aria-hidden="true">→</span>
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('[data-puesto-sistemas]').forEach((btn) => {
        btn.addEventListener('click', () => openPuestoSistemasModal(Number(btn.dataset.puestoSistemas)));
    });
}

function filterPuestos() {
    const q = (document.getElementById('puestos-search')?.value || '').trim().toLowerCase();
    let rows = _puestosCache;
    if (q) {
        rows = rows.filter((p) => String(p.nombre || '').toLowerCase().includes(q));
    }
    renderPuestosRows(rows);
}

async function loadPuestos() {
    const tbody = document.getElementById('puestos-tbody');
    if (!tbody) return;
    try {
        _puestosCache = await api('/api/puestos');
        filterPuestos();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="error">${esc(err.message)}</td></tr>`;
    }
}

function closePuestoModal() {
    document.getElementById('puesto-modal')?.classList.add('hidden');
    _editingPuestoId = null;
}

async function loadPuestoSistemasCheckboxes(links = []) {
    const box = document.getElementById('puesto-sistemas-checkboxes');
    if (!box) return;
    const sistemas = await api('/api/systems');
    const linkMap = new Map(
        links.map((l) => {
            const ids = Array.isArray(l.sistema_role_ids) && l.sistema_role_ids.length
                ? l.sistema_role_ids.map(Number)
                : (l.sistema_role_id != null ? [Number(l.sistema_role_id)] : []);
            return [Number(l.sistema_id ?? l), ids];
        })
    );
    if (!sistemas.length) {
        box.innerHTML = '<p class="empty">No hay sistemas disponibles.</p>';
        return;
    }
    const rolesBySystem = await Promise.all(
        sistemas.map((s) => api(`/api/systems/${s.id}/roles`).catch(() => []))
    );
    box.innerHTML = sistemas.map((s, i) => {
        const roles = rolesBySystem[i];
        const sid = Number(s.id);
        const checked = linkMap.has(sid);
        const selectedRoles = new Set(linkMap.get(sid) || []);
        const roleChecks = roles.length
            ? roles.map((r) => {
                const on = checked
                    ? (selectedRoles.size ? selectedRoles.has(Number(r.id)) : Number(r.is_default) === 1)
                    : Number(r.is_default) === 1;
                return `<label class="role-chip"><input type="checkbox" data-puesto-sistema-role="${s.id}" value="${r.id}" ${on ? 'checked' : ''} ${checked ? '' : 'disabled'}> ${esc(r.nombre)}</label>`;
            }).join('')
            : '<span class="muted">Sin roles internos</span>';
        return `
        <div class="sistema-link-row">
            <label class="checkbox-item">
                <input type="checkbox" value="${s.id}" data-puesto-sistema-check ${checked ? 'checked' : ''}>
                <span>${esc(s.nombre)} <code>${esc(s.client_id)}</code></span>
            </label>
            <div class="role-chips">${roleChecks}</div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-puesto-sistema-check]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const roles = box.querySelectorAll(`[data-puesto-sistema-role="${cb.value}"]`);
            roles.forEach((roleCb) => {
                roleCb.disabled = !cb.checked;
                if (!cb.checked) roleCb.checked = false;
            });
            if (cb.checked) {
                const any = [...roles].some((r) => r.checked);
                if (!any && roles.length) {
                    const def = [...roles].find((r) => Number(r.dataset?.default) === 1) || roles[0];
                    if (def) def.checked = true;
                }
            }
        });
    });
}

function getSelectedPuestoSistemaLinks() {
    return [...document.querySelectorAll('#puesto-sistemas-checkboxes [data-puesto-sistema-check]:checked')].map((cb) => {
        const roleIds = [...document.querySelectorAll(`#puesto-sistemas-checkboxes [data-puesto-sistema-role="${cb.value}"]:checked`)]
            .map((r) => Number(r.value))
            .filter((n) => Number.isFinite(n) && n > 0);
        return { sistema_id: Number(cb.value), sistema_role_ids: roleIds };
    });
}

async function openPuestoSistemasModal(puestoId) {
    const modal = document.getElementById('puesto-modal');
    if (!modal) return;
    _editingPuestoId = puestoId;
    try {
        const puesto = await api(`/api/puestos/${puestoId}`);
        document.getElementById('puesto-modal-title').textContent = `Sistemas · ${puesto.nombre}`;
        document.getElementById('puesto-modal-sub').textContent =
            `${Number(puesto.usuarios) || 0} usuario(s) recibirán estos sistemas y roles internos automáticamente.`;
        await loadPuestoSistemasCheckboxes(puesto.sistema_links || []);
        modal.classList.remove('hidden');
    } catch (err) {
        showAlert(err.message || 'No se pudo abrir el puesto');
    }
}

async function savePuestoSistemas() {
    if (!_editingPuestoId) return;
    const btn = document.getElementById('btn-save-puesto-sistemas');
    const links = getSelectedPuestoSistemaLinks();
    showSyncOverlay('Aplicando accesos', 'Actualizando usuarios del puesto en Keycloak…');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Aplicando…';
    }
    try {
        const r = await api(`/api/puestos/${_editingPuestoId}/sistemas`, {
            method: 'PUT',
            body: JSON.stringify({ sistema_links: links }),
        });
        closePuestoModal();
        const errPart = r.keycloakErrors?.length ? ` · ${r.keycloakErrors.length} error(es) KC` : '';
        showAlert(
            `Puesto actualizado · ${r.sistemas} sistema(s) · ${r.usersAffected} usuario(s)${errPart}`,
            r.keycloakErrors?.length ? 'error' : 'ok',
            12000
        );
        await loadPuestos();
    } catch (err) {
        showAlert(err.message || 'Error al guardar');
    } finally {
        hideSyncOverlay();
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Guardar y aplicar';
        }
    }
}

function initPuestosPage() {
    if (!document.getElementById('puestos-tbody')) return;
    loadPuestos();
    document.getElementById('puestos-search')?.addEventListener('input', filterPuestos);
    document.getElementById('btn-save-puesto-sistemas')?.addEventListener('click', savePuestoSistemas);
    document.querySelectorAll('[data-close-puesto-modal]').forEach((el) => {
        el.addEventListener('click', closePuestoModal);
    });
}

function monitorDate(value) {
    if (!value) return '—';
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
        ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
        : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX');
}

function monitorDuration(start) {
    const numeric = Number(start);
    if (!Number.isFinite(numeric)) return '—';
    const started = numeric < 1e12 ? numeric * 1000 : numeric;
    const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
}

function monitorDetail(detail) {
    if (!detail || typeof detail !== 'object' || !Object.keys(detail).length) return '—';
    return esc(JSON.stringify(detail));
}

const monitorSessionsPageSize = 10;
let monitorSessions = [];
let monitorSessionsPage = 1;

function renderMonitorSessions() {
    const body = document.getElementById('monitor-sessions-tbody');
    const pager = document.getElementById('monitor-sessions-pagination');
    const total = monitorSessions.length;
    const totalPages = Math.max(1, Math.ceil(total / monitorSessionsPageSize));
    monitorSessionsPage = Math.min(Math.max(monitorSessionsPage, 1), totalPages);
    const start = (monitorSessionsPage - 1) * monitorSessionsPageSize;
    const pageRows = monitorSessions.slice(start, start + monitorSessionsPageSize);

    body.innerHTML = pageRows.length ? pageRows.map((session) => `
        <tr>
            <td><strong>${esc(session.username || session.user_id)}</strong></td>
            <td><code>${esc(session.ip || '—')}</code></td>
            <td>${monitorDate(session.inicio)}</td>
            <td>${monitorDate(session.ultima_actividad)}</td>
            <td>${monitorDuration(session.inicio)}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="empty">No hay sesiones activas para este sistema.</td></tr>';

    if (!pager) return;
    if (total <= monitorSessionsPageSize) {
        pager.classList.add('hidden');
        pager.innerHTML = '';
        return;
    }
    pager.classList.remove('hidden');
    pager.innerHTML = `
        <span>Mostrando ${start + 1}–${Math.min(start + monitorSessionsPageSize, total)} de ${total}</span>
        <div class="pagination-actions">
            <button type="button" class="btn-secondary btn-sm" data-monitor-page="${monitorSessionsPage - 1}" ${monitorSessionsPage <= 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${monitorSessionsPage} de ${totalPages}</span>
            <button type="button" class="btn-secondary btn-sm" data-monitor-page="${monitorSessionsPage + 1}" ${monitorSessionsPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
        </div>`;
    pager.querySelectorAll('[data-monitor-page]').forEach((button) => {
        button.addEventListener('click', () => {
            monitorSessionsPage = Number(button.dataset.monitorPage);
            renderMonitorSessions();
        });
    });
}

async function loadMonitoringData() {
    const sessionsBody = document.getElementById('monitor-sessions-tbody');
    const auditBody = document.getElementById('monitor-audit-tbody');
    const systemId = Number(document.getElementById('monitor-system')?.value);
    if (!systemId) return;
    sessionsBody.innerHTML = '<tr><td colspan="5" class="loading">Consultando Keycloak…</td></tr>';
    auditBody.innerHTML = '<tr><td colspan="5" class="loading">Consultando bitácora…</td></tr>';
    try {
        const data = await api(`/api/monitoring/systems/${systemId}?limit=200`);
        const sessions = (data.sessions || []).sort((a, b) => Number(b.inicio || 0) - Number(a.inicio || 0));
        const audit = data.audit || [];
        document.getElementById('monitor-session-count').textContent = String(sessions.length);
        document.getElementById('monitor-updated').textContent =
            `${data.sistema.nombre} · actualizado ${monitorDate(data.generated_at)}`;
        monitorSessions = sessions;
        monitorSessionsPage = 1;
        renderMonitorSessions();
        auditBody.innerHTML = audit.length ? audit.map((entry) => `
            <tr>
                <td>${monitorDate(entry.created_at)}</td>
                <td><strong>${esc(entry.actor_user)}</strong><br><span class="muted">Rol ${esc(entry.actor_rol || '—')}</span></td>
                <td>${esc(entry.accion)}</td>
                <td><code>${monitorDetail(entry.detalle)}</code></td>
                <td><code>${esc(entry.ip || '—')}</code></td>
            </tr>`).join('') : '<tr><td colspan="5" class="empty">Aún no hay movimientos registrados para este sistema.</td></tr>';
    } catch (error) {
        sessionsBody.innerHTML = `<tr><td colspan="5" class="error">${esc(error.message)}</td></tr>`;
        auditBody.innerHTML = `<tr><td colspan="5" class="error">${esc(error.message)}</td></tr>`;
    }
}

async function initMonitoringPage() {
    const select = document.getElementById('monitor-system');
    const trigger = document.getElementById('monitor-system-trigger');
    const label = document.getElementById('monitor-system-label');
    const options = document.getElementById('monitor-system-options');
    if (!select) return;
    try {
        const systems = await api('/api/monitoring/systems');
        select.innerHTML = '<option value="">Elige un sistema para comenzar</option>' + systems.map((system) =>
            `<option value="${system.id}">${esc(system.nombre)} · ${esc(system.client_id)}${Number(system.enabled) ? '' : ' · Inactivo'}</option>`
        ).join('');
        label.textContent = 'Elige un sistema para comenzar';
        options.innerHTML = systems.length ? systems.map((system) => `
            <button type="button" class="monitor-system-option" role="option"
                data-monitor-option="${system.id}" aria-selected="false">
                <span><strong>${esc(system.nombre)}</strong><code>${esc(system.client_id)}</code></span>
                <span class="monitor-option-state ${Number(system.enabled) ? 'is-active' : ''}">${Number(system.enabled) ? 'Activo' : 'Inactivo'}</span>
            </button>`).join('') : '<p class="empty">No hay sistemas registrados.</p>';
        options.querySelectorAll('[data-monitor-option]').forEach((option) => {
            option.addEventListener('click', () => {
                select.value = option.dataset.monitorOption;
                label.textContent = option.querySelector('strong')?.textContent || 'Sistema seleccionado';
                options.querySelectorAll('[data-monitor-option]').forEach((item) => {
                    const selected = item === option;
                    item.classList.toggle('selected', selected);
                    item.setAttribute('aria-selected', selected ? 'true' : 'false');
                });
                options.classList.add('hidden');
                trigger.setAttribute('aria-expanded', 'false');
                loadMonitoringData();
            });
        });
    } catch (error) {
        select.innerHTML = `<option value="">${esc(error.message)}</option>`;
        select.disabled = true;
        label.textContent = error.message;
        trigger.disabled = true;
    }
    trigger.addEventListener('click', () => {
        const opening = options.classList.contains('hidden');
        options.classList.toggle('hidden', !opening);
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.monitor-select-wrap')) {
            options.classList.add('hidden');
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            options.classList.add('hidden');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
        }
    });
    document.getElementById('btn-monitor-refresh')?.addEventListener('click', loadMonitoringData);
}

function initModalScrollLock() {
    const syncScrollLock = () => {
        const hasOpenModal = [...document.querySelectorAll('.modal')]
            .some((modal) => !modal.classList.contains('hidden'));
        document.body.classList.toggle('modal-open', hasOpenModal);
    };

    const observer = new MutationObserver(syncScrollLock);
    document.querySelectorAll('.modal').forEach((modal) => {
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
    syncScrollLock();
}

document.addEventListener('DOMContentLoaded', () => {
    initModalScrollLock();
    if (document.getElementById('stat-active')) initDashboardPage();
    if (document.getElementById('roles-tbody')) loadRoles();
    if (document.getElementById('users-tbody')) initUsersPage();
    if (document.getElementById('puestos-tbody')) initPuestosPage();
    if (document.getElementById('systems-tbody')) initSystemsPage();
    if (document.getElementById('system-detail-root')) initSystemDetailPage();
    if (document.getElementById('monitor-system')) initMonitoringPage();
});
