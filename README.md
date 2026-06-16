# UAT SSO MOBO

Plataforma **Single Sign-On (SSO)** para el entorno UAT de MOBO: Keycloak como Identity Provider, consola de administración propia y sincronización con MySQL (MoboNet).

**Servidor UAT:** `192.168.10.150`  
**Ruta en servidor:** `/var/www/html/uat.sso`

| Servicio | Puerto | URL |
|----------|--------|-----|
| Keycloak | 8089 | http://192.168.10.150:8089 |
| Consola admin | 3010 | http://192.168.10.150:3010 |

> Los puertos 8080 (Jenkins) y 3002 (dax-query-builder) están ocupados en el servidor UAT.

---

## Despliegue en servidor UAT

### 1. Subir el proyecto

```bash
# En el servidor
cd /var/www/html
git clone <tu-repo> uat.sso
# o desde tu PC:
scp -r uat.sso root@192.168.10.150:/var/www/html/
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

| Variable | UAT | Local |
|----------|-----|-------|
| `MYSQL_HOST` | `192.168.10.150` | `192.168.10.150` |
| `KC_PORT` | `8089` | `8080` (dev compose) |
| `ADMIN_PORT` | `3010` | `3002` (npm start) |
| `KC_HOSTNAME` | `192.168.10.150` | `localhost` |

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

---

## Referencias

- [DOCUMENTACION-PROYECTO.md](./DOCUMENTACION-PROYECTO.md) — Arquitectura y flujos
- [themes/GUIA-PERSONALIZACION.md](./themes/GUIA-PERSONALIZACION.md) — Personalización de temas
