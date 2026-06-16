#!/usr/bin/env bash
# Asigna el tema sso-admin al realm master (consola de administración).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Esperando a que Keycloak responda..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:8080/realms/master" >/dev/null; then
    break
  fi
  sleep 2
  if [ "$i" -eq 60 ]; then
    echo "Keycloak no respondió en http://localhost:8080"
    exit 1
  fi
done

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master \
  -s loginTheme=sso-admin \
  -s adminTheme=sso-admin \
  -s accountTheme=sso-admin \
  -s internationalizationEnabled=true \
  -s 'supportedLocales=["es","en"]' \
  -s defaultLocale=es

echo "Tema sso-admin aplicado al realm master."
