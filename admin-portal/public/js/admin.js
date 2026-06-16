async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
    return data;
}

function showAlert(msg, type = 'error') {
    const el = document.getElementById('alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function badge(text, variant) {
    return `<span class="badge badge-${variant}">${text}</span>`;
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
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="error">${err.message}</td></tr>`;
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

async function loadSistemasCheckboxes(selectedIds = []) {
    const box = document.getElementById('sistemas-checkboxes');
    if (!box) return;
    sistemasCache = await api('/api/systems');
    const selected = new Set(selectedIds.map(Number));
    if (!sistemasCache.length) {
        box.innerHTML = '<p class="empty">No hay sistemas disponibles.</p>';
        return;
    }
    box.innerHTML = sistemasCache.map((s) => `
        <label class="checkbox-item">
            <input type="checkbox" name="sistema" value="${s.id}" ${selected.has(s.id) ? 'checked' : ''}>
            <span>${s.nombre} <code>${s.client_id}</code></span>
        </label>
    `).join('');
}

function getSelectedSistemaIds() {
    return [...document.querySelectorAll('#sistemas-checkboxes input:checked')].map((el) => Number(el.value));
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    try {
        const users = await api('/api/users');
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay usuarios registrados.</td></tr>';
            return;
        }
        tbody.innerHTML = users.map((u) => `
            <tr>
                <td><strong>${u.user}</strong></td>
                <td>${u.name} ${u.last_name}</td>
                <td>${u.email || '—'}</td>
                <td>${badge(u.rol_nombre, u.rol === 1 ? 'admin' : u.rol === 3 ? 'devadmin' : 'user')}</td>
                <td>${badge(u.enabled ? 'Activo' : 'Bloqueado', u.enabled ? 'ok' : 'off')}</td>
                <td class="actions">
                    <button class="btn-icon" data-edit="${u.user}" title="Editar">✎</button>
                    <button class="btn-icon danger" data-delete="${u.user}" title="Eliminar">✕</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error">${err.message}</td></tr>`;
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

    if (mode === 'create') {
        title.textContent = 'Nuevo usuario';
        document.getElementById('user-form').reset();
        document.getElementById('f-enabled').value = '1';
        loadRolesSelect().then(() => loadSistemasCheckboxes([]));
    } else {
        title.textContent = `Editar: ${user.user}`;
        document.getElementById('f-user').value = user.user;
        document.getElementById('f-name').value = user.name || '';
        document.getElementById('f-lastname').value = user.last_name || '';
        document.getElementById('f-email').value = user.email || '';
        document.getElementById('f-area').value = user.area || '';
        document.getElementById('f-dept').value = user.dept || '';
        document.getElementById('f-enabled').value = String(user.enabled);
        document.getElementById('f-password').value = '';
        loadRolesSelect().then(() => {
            document.getElementById('f-rol').value = String(user.rol);
            loadSistemasCheckboxes(user.sistema_ids || []);
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

    if (!isAdmin()) {
        document.getElementById('btn-sync')?.remove();
    }

    document.getElementById('btn-new-user')?.addEventListener('click', () => openModal('create'));
    document.getElementById('btn-sync')?.addEventListener('click', async () => {
        try {
            const r = await api('/api/users/sync/all', { method: 'POST' });
            showAlert(`Sincronizados ${r.synced} usuarios a Keycloak`, 'ok');
            loadUsers();
        } catch (err) { showAlert(err.message); }
    });

    tbody.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        const del = e.target.closest('[data-delete]');
        if (edit) {
            try {
                const user = await api(`/api/users/${edit.dataset.edit}`);
                openModal('edit', user);
            } catch (err) { showAlert(err.message); }
        }
        if (del) {
            if (!confirm(`¿Eliminar usuario "${del.dataset.delete}"?`)) return;
            try {
                await api(`/api/users/${del.dataset.delete}`, { method: 'DELETE' });
                showAlert('Usuario eliminado', 'ok');
                loadUsers();
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
            area: document.getElementById('f-area').value,
            dept: document.getElementById('f-dept').value,
            enabled: document.getElementById('f-enabled').value,
            rol: document.getElementById('f-rol').value,
        };
        const password = document.getElementById('f-password').value;

        try {
            const sistemaIds = getSelectedSistemaIds();
            if (mode === 'create') {
                body.password = password;
                body.sistema_ids = sistemaIds;
                await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
                showAlert('Usuario creado y sincronizado', 'ok');
            } else {
                await api(`/api/users/${body.user}`, { method: 'PUT', body: JSON.stringify(body) });
                if (password) {
                    await api(`/api/users/${body.user}/password`, {
                        method: 'PUT',
                        body: JSON.stringify({ password }),
                    });
                }
                await api(`/api/users/${body.user}/sistemas`, {
                    method: 'PUT',
                    body: JSON.stringify({ sistema_ids: sistemaIds }),
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

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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
            <tr>
                <td><strong>${esc(s.client_id)}</strong></td>
                <td>${esc(s.nombre)}</td>
                ${isAdmin() ? `<td class="col-owner">${esc(s.owner || '—')}</td>` : ''}
                <td class="uris-cell">${(s.redirectUris || []).map((u) => `<code>${esc(u)}</code>`).join('<br>')}</td>
                <td>${badge(s.enabled ? 'Activo' : 'Inactivo', s.enabled ? 'ok' : 'off')}</td>
                <td class="actions">
                    <button class="btn-icon" data-edit-system="${s.id}" title="Editar">✎</button>
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

function openSystemModal(mode, system) {
    const modal = document.getElementById('modal');
    document.getElementById('edit-mode').value = mode;
    document.getElementById('secret-display').classList.add('hidden');
    document.getElementById('btn-show-secret').style.display = mode === 'edit' ? '' : 'none';
    document.getElementById('btn-regen-secret').style.display = mode === 'edit' ? '' : 'none';
    document.getElementById('secret-field').style.display = mode === 'create' ? '' : 'none';

    if (mode === 'create') {
        document.getElementById('modal-title').textContent = 'Nuevo sistema';
        document.getElementById('system-form').reset();
        document.getElementById('f-webOrigins').value = '+';
        document.getElementById('f-enabled').value = '1';
        document.getElementById('f-clientId').disabled = false;
        document.getElementById('edit-id').value = '';
    } else {
        document.getElementById('modal-title').textContent = `Editar: ${system.client_id}`;
        document.getElementById('edit-id').value = system.id;
        document.getElementById('f-clientId').value = system.client_id;
        document.getElementById('f-clientId').disabled = true;
        document.getElementById('f-name').value = system.nombre || '';
        document.getElementById('f-redirectUris').value = (system.redirectUris || []).join('\n');
        document.getElementById('f-webOrigins').value = system.web_origins || '+';
        document.getElementById('f-enabled').value = system.enabled ? '1' : '0';
    }

    modal.classList.remove('hidden');
}

function initSystemsPage() {
    const tbody = document.getElementById('systems-tbody');
    if (!tbody) return;

    loadSystems();

    document.getElementById('btn-new-system')?.addEventListener('click', () => openSystemModal('create'));

    tbody.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit-system]');
        const del = e.target.closest('[data-delete-system]');
        if (edit) {
            try {
                const system = await api(`/api/systems/${edit.dataset.editSystem}`);
                openSystemModal('edit', system);
            } catch (err) { showAlert(err.message); }
        }
        if (del) {
            const name = del.dataset.name;
            if (!confirm(`¿Eliminar sistema "${name}"?`)) return;
            try {
                await api(`/api/systems/${del.dataset.deleteSystem}`, { method: 'DELETE' });
                showAlert('Sistema eliminado', 'ok');
                loadSystems();
            } catch (err) { showAlert(err.message); }
        }
    });

    document.getElementById('btn-show-secret')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-id').value;
        try {
            const { secret } = await api(`/api/systems/${id}/secret`);
            showSecretBox(secret);
        } catch (err) { showAlert(err.message); }
    });

    document.getElementById('btn-regen-secret')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-id').value;
        if (!confirm('¿Regenerar el secreto? Las apps deberán actualizar su configuración.')) return;
        try {
            const { secret } = await api(`/api/systems/${id}/regenerate-secret`, { method: 'POST' });
            showSecretBox(secret);
            showAlert('Secreto regenerado', 'ok');
        } catch (err) { showAlert(err.message); }
    });

    document.getElementById('btn-copy-secret')?.addEventListener('click', () => {
        const secret = document.getElementById('secret-value')?.textContent;
        if (secret) navigator.clipboard.writeText(secret).then(() => showAlert('Copiado al portapapeles', 'ok'));
    });

    document.getElementById('system-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mode = document.getElementById('edit-mode').value;
        const body = {
            clientId: document.getElementById('f-clientId').value,
            name: document.getElementById('f-name').value,
            redirectUris: document.getElementById('f-redirectUris').value,
            webOrigins: document.getElementById('f-webOrigins').value,
            enabled: document.getElementById('f-enabled').value,
        };

        try {
            if (mode === 'create') {
                body.secret = document.getElementById('f-secret').value;
                const created = await api('/api/systems', { method: 'POST', body: JSON.stringify(body) });
                showAlert('Sistema creado', 'ok');
                if (created.secret) showSecretBox(created.secret);
                else closeModal();
            } else {
                const id = document.getElementById('edit-id').value;
                await api(`/api/systems/${id}`, { method: 'PUT', body: JSON.stringify(body) });
                showAlert('Sistema actualizado', 'ok');
                closeModal();
            }
            loadSystems();
        } catch (err) { showAlert(err.message); }
    });

    document.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
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
                <tr>
                    <td><strong>${s.nombre}</strong></td>
                    <td><code>${s.client_id}</code></td>
                    <td>${s.user_count}</td>
                </tr>
            `).join('');
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

    document.getElementById('btn-dashboard-sync')?.addEventListener('click', async () => {
        try {
            const r = await api('/api/users/sync/all', { method: 'POST' });
            showAlert(`Sincronizados ${r.synced} usuarios · ${r.accessSynced} accesos`, 'ok');
            loadDashboard();
        } catch (err) {
            showAlert(err.message);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('stat-active')) initDashboardPage();
    if (document.getElementById('roles-tbody')) loadRoles();
    if (document.getElementById('users-tbody')) initUsersPage();
    if (document.getElementById('systems-tbody')) initSystemsPage();
});
