# UAT SSO MOBO

Plataforma **Single Sign-On (SSO)** para el entorno UAT de MOBO: Keycloak como Identity Provider, consola de administración propia y catálogo maestro en MySQL (`SSOMOBO`).

**Servidor UAT:** `192.168.10.150`  
**Ruta en servidor:** `/var/www/html/uat.sso/public_html`

**Logs en servidor:** `/var/www/html/uat.sso/logs`
**Repo:** https://github.com/cris1059/sso-mobo.git

| Servicio | URL (dominio) | URL (IP) |
|----------|---------------|----------|
| Keycloak | http://auth.uat.sso.mobo.com.mx | http://192.168.10.150:8089 |
| Consola admin | http://admin.uat.sso.mobo.com.mx | http://192.168.10.150:3010 |

> Los puertos 8080 (Jenkins) y 3002 (dax-query-builder) están ocupados en el servidor UAT.

---

## Flujo de despliegue (Git → servidor)

Los cambios **no se reflejan solos** en UAT. El flujo es:

```
Editar código → commit → push (GitHub) → git pull en servidor → docker rebuild
```

### En tu PC (cada cambio)

```powershell
git add .
git commit -m "descripción del cambio"
git push origin main
.\scripts\deploy-uat.ps1
```

### En el servidor (manual, si prefieres)

```bash
cd /var/www/html/uat.sso/public_html
git pull origin main
./scripts/deploy-uat.sh
```

### Qué hace `deploy-uat.sh`

1. `git pull origin main`
2. Recarga vhost Apache (`apache/uat.sso.conf`)
3. `docker compose up -d --build`

| Cambiaste | Efecto |
|-----------|--------|
| `admin-portal/` | Rebuild imagen Node |
| `themes/` | Reinicio Keycloak (volúmenes montados) |
| `docker-compose.yml` / `.env` | Recrea contenedores |
| `apache/` | Recarga httpd |

> **`.env` no va al repo.** Vive en `/var/www/html/uat.sso/public_html/.env` en UAT.

### Estructura en el servidor

```
/var/www/html/uat.sso/
├── public_html/     ← código del repo (docker compose, admin-portal, etc.)
└── logs/            ← logs Apache y futuros logs de aplicación
```

### Migración única del servidor a Git

```bash
mkdir -p /var/www/html/uat.sso/logs
cd /var/www/html/uat.sso/public_html   # o crear con migrate-server-to-git.sh
chmod +x scripts/migrate-server-to-git.sh
./scripts/migrate-server-to-git.sh
```

---

## Despliegue inicial (primera vez)

### 1. Clonar en el servidor

```bash
cd /var/www/html
mkdir -p uat.sso/logs
git clone https://github.com/cris1059/sso-mobo.git uat.sso/public_html
```

### 2. Configurar variables

```bash
cd /var/www/html/uat.sso
cp .env.example .env
# Editar .env con MYSQL_PASS, SESSION_SECRET y contraseñas reales
```

### 3. Levantar servicios

```bash
docker compose up -d --build
docker compose logs -f keycloak
```

Verificar:
- Keycloak: http://192.168.10.150:8089
- Consola admin: http://192.168.10.150:3010

### 4. Post-instalación (primera vez)

Si las tablas SSO aún no existen en MoboNet:

```powershell
# Desde Windows (con acceso a la BD)
.\scripts\create-userSSO-table.ps1
.\scripts\run-migration-05.ps1
.\scripts\sync-userSSO-to-keycloak.ps1
.\scripts\seed-initial-access.ps1
```

Si ya existían los sistemas demo `node-app` / `php-app`:

```powershell
.\scripts\run-migration-08.ps1
```

---

## Desarrollo local

### Keycloak en Docker (puerto 8080)

```powershell
cd uat.sso
copy .env.example .env
docker compose -f docker-compose.dev.yml up -d
.\scripts\start.ps1
```

### Consola admin (nativa)

```powershell
cd admin-portal
copy .env.example .env
# Ajustar KEYCLOAK_URL a http://localhost:8080/realms/mobo
npm install
npm start
```

Consola: http://localhost:3002

---

## Configuración (`.env`)

| Variable | UAT (dominio) | UAT (IP) | Local |
|----------|---------------|----------|-------|
| `KC_PUBLIC_URL` | `http://auth.uat.sso.mobo.com.mx` | — | — |
| `ADMIN_PUBLIC_URL` | `http://admin.uat.sso.mobo.com.mx` | — | — |
| `MYSQL_HOST` | `192.168.10.150` | `192.168.10.150` | `192.168.10.150` |
| `KC_PORT` | `8089` | `8089` | `8080` (dev compose) |
| `ADMIN_PORT` | `3010` | `3010` | `3002` (npm start) |
| `KC_HOSTNAME` | `auth.uat.sso.mobo.com.mx` | `192.168.10.150` | `localhost` |

---

## Roles y acceso

| roleSSO.id | nombre | Consola admin | Apps conectadas |
|------------|--------|:-------------:|:---------------:|
| `1` | Admin | Sí | Sí (si vinculado) |
| `2` | Usuario | No | Sí (si vinculado) |
| `3` | developAdmin | Sí (solo sus sistemas) | Sí (si vinculado) |

---

## Estructura del proyecto

| Carpeta | Descripción |
|---------|-------------|
| `admin-portal/` | Consola admin MOBO |
| `keycloak-imports/` | Realm `mobo` |
| `themes/` | Temas `sso-admin` y `sso-apps` |
| `scripts/` | Sincronización MySQL ↔ Keycloak |
| `sql/` | Migraciones BD |

Documentación detallada: [DOCUMENTACION-PROYECTO.md](./DOCUMENTACION-PROYECTO.md)

---

## Scripts de gestión

| Script | Propósito |
|--------|-----------|
| `scripts/start.ps1` | Keycloak local + temas + cliente admin-portal |
| `scripts/create-userSSO-table.ps1` | Crea tablas base y usuario admin |
| `scripts/sync-userSSO-to-keycloak.ps1` | Re-sincroniza perfiles + acceso |
| `scripts/seed-initial-access.ps1` | Vincula admin a sistemas + enforcement |
| `scripts/run-migration-08.ps1` | Elimina sistemas demo node-app / php-app |
| `scripts/deploy-uat.sh` | Pull + rebuild en servidor UAT |
| `scripts/deploy-uat.ps1` | Push verificado + deploy remoto vía SSH |
| `scripts/migrate-server-to-git.sh` | Migración única del servidor a Git |

---

## Referencias

- [DOCUMENTACION-PROYECTO.md](./DOCUMENTACION-PROYECTO.md) — Arquitectura y flujos
- [themes/GUIA-PERSONALIZACION.md](./themes/GUIA-PERSONALIZACION.md) — Personalización de temas
