#!/usr/bin/env bash
# Deploy del frontend Angular a la VM de infinance.innovag.com.pe
set -euo pipefail

# Silenciar el prompt de telemetría de Angular CLI (no interactivo).
export NG_CLI_ANALYTICS=false

REPO_DIR="${REPO_DIR:-$HOME/digitalclub/digitalclub-frontend}"
WEB_ROOT="/var/www/holape-angular"
DOMAIN_ENV="deploy/env.infinance.js"

echo "==> Sincronizando repo en $REPO_DIR"
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main
git clean -fd

echo "==> Instalando dependencias"
npm ci

echo "==> Build de producción"
npm run build:prod

echo "==> Copiando build a $WEB_ROOT"
sudo rm -rf "$WEB_ROOT"/*
sudo cp -r dist/holape-angular/browser/* "$WEB_ROOT/"

echo "==> Inyectando env.js para infinance"
sudo cp "$DOMAIN_ENV" "$WEB_ROOT/env.js"

echo "==> Probando y recargando nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "Deploy infinance.innovag.com.pe terminado."
