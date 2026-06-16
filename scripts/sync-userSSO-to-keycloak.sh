#!/usr/bin/env bash
# Sincroniza perfiles y roles de userSSO al realm mobo en Keycloak.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

MYSQL_HOST="${MYSQL_HOST:?MYSQL_HOST no definido en .env}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:?MYSQL_USER no definido en .env}"
MYSQL_PASS="${MYSQL_PASS:?MYSQL_PASS no definido en .env}"
MYSQL_DB="${MYSQL_DB:?MYSQL_DB no definido en .env}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_ADMIN_PASS="${KC_ADMIN_PASS:-admin}"
KC_REALM="${KC_REALM:-mobo}"

mysql_cli() {
  docker run --rm -e MYSQL_PWD="$MYSQL_PASS" mysql:8.0 \
    mysql "-h${MYSQL_HOST}" "-P${MYSQL_PORT}" "-u${MYSQL_USER}" "$@"
}

role_name() {
  case "$1" in
    1) echo "Admin" ;;
    2) echo "Usuario" ;;
    *) echo "Usuario" ;;
  esac
}

ensure_realm_roles() {
  for role in Admin Usuario; do
    if ! docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get "roles/$role" -r "$KC_REALM" >/dev/null 2>&1; then
      docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create roles -r "$KC_REALM" -s "name=$role" >/dev/null
    fi
  done
}

sync_user_role() {
  local username="$1"
  local rol_id="$2"
  local target
  target=$(role_name "$rol_id")

  for role in Admin Usuario; do
    if [ "$role" != "$target" ]; then
      docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh remove-roles -r "$KC_REALM" \
        --uusername "$username" --rolename "$role" >/dev/null 2>&1 || true
    fi
  done

  docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh add-roles -r "$KC_REALM" \
    --uusername "$username" --rolename "$target" >/dev/null
}

echo "Esperando MySQL ($MYSQL_HOST:$MYSQL_PORT)..."
for i in $(seq 1 30); do
  if mysql_cli -e "SELECT 1" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "Esperando Keycloak..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:8080/realms/$KC_REALM" >/dev/null; then break; fi
  sleep 2
done

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user "$KC_ADMIN" --password "$KC_ADMIN_PASS"

ensure_realm_roles

ROWS=$(mysql_cli "$MYSQL_DB" -N -B -e "
SELECT u.user, IFNULL(u.name,''), IFNULL(u.last_name,''), IFNULL(u.email,''), u.enabled, u.rol, r.nombre
FROM userSSO u
INNER JOIN roleSSO r ON u.rol = r.id")

while IFS=$'\t' read -r username firstname lastname email enabled rol_id rol_nombre; do
  [ -z "$username" ] && continue
  echo "  → $username (enabled=$enabled, rol=$rol_id $rol_nombre)"

  USER_ID=$(docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users -r "$KC_REALM" \
    -q "username=$username" --fields id --format csv --noquotes 2>/dev/null | tail -n 1 || true)

  if [ -z "$USER_ID" ] || [ "$USER_ID" = "id" ]; then
    docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create users -r "$KC_REALM" \
      -s "username=$username" -s "enabled=$enabled" -s "email=$email" \
      -s "firstName=$firstname" -s "lastName=$lastname" -s "emailVerified=true" >/dev/null
  else
    docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update "users/$USER_ID" -r "$KC_REALM" \
      -s "enabled=$enabled" -s "email=$email" \
      -s "firstName=$firstname" -s "lastName=$lastname" -s "emailVerified=true" >/dev/null
  fi

  sync_user_role "$username" "$rol_id"
done <<< "$ROWS"

echo "Sincronización de perfiles y roles completada."
