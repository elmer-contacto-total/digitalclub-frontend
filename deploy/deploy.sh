#!/bin/bash
# Deploy script for Holape - digitalclub.contactototal.com.pe
# Frontend: Puerto 3001 (Nginx + Angular)
# Backend: Puerto 8443 (Spring Boot)
#
# Ejecutar: cd ~/digitalclub/digitalclub-frontend/deploy && chmod +x deploy.sh && ./deploy.sh

set -e

DOMAIN="digitalclub.contactototal.com.pe"
FRONTEND_DIR="/var/www/holape-angular"

# Rutas de los proyectos clonados
ANGULAR_PROJECT="$HOME/digitalclub/digitalclub-frontend"
BACKEND_PROJECT="$HOME/digitalclub/digitalclub-backend"

echo "=== Rutas de proyectos ==="
echo "Angular: $ANGULAR_PROJECT"
echo "Backend: $BACKEND_PROJECT"

# ============================================
# SSL CERTIFICATE
# ============================================
echo ""
echo "=== [SSL] Verificando certificado ==="
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "Certificado SSL no encontrado. Generando con certbot..."

    # Detener nginx si está corriendo (para liberar puerto 80)
    sudo systemctl stop nginx 2>/dev/null || true

    # Generar certificado
    sudo certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || {
        echo "ERROR: No se pudo generar el certificado SSL"
        echo "Asegúrate de que:"
        echo "  1. El dominio $DOMAIN apunta a esta IP"
        echo "  2. El puerto 80 está abierto en el firewall"
        exit 1
    }

    echo "Certificado SSL generado correctamente"
else
    echo "Certificado SSL ya existe"
fi

# ============================================
# FRONTEND
# ============================================
echo ""
echo "=== [FRONTEND] Actualizando código ==="
cd "$ANGULAR_PROJECT"
git pull origin main

echo ""
echo "=== [FRONTEND] Compilando Angular ==="
npm install
npm run build

echo ""
echo "=== [FRONTEND] Desplegando ==="
sudo mkdir -p $FRONTEND_DIR
sudo rm -rf $FRONTEND_DIR/*
sudo cp -r dist/holape-angular/browser/* $FRONTEND_DIR/
sudo chown -R www-data:www-data $FRONTEND_DIR
sudo chmod -R 755 $FRONTEND_DIR

echo ""
echo "=== [FRONTEND] Configurando Nginx ==="
sudo cp "$ANGULAR_PROJECT/deploy/nginx.conf" /etc/nginx/sites-available/digitalclub
sudo ln -sf /etc/nginx/sites-available/digitalclub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ============================================
# BACKEND
# ============================================
echo ""
echo "=== [BACKEND] Actualizando código ==="
cd "$BACKEND_PROJECT"
rm -rf target/
git pull origin main

echo ""
echo "=== [BACKEND] Compilando Spring Boot ==="
mvn clean package -DskipTests

echo ""
echo "=== [BACKEND] Deteniendo proceso anterior ==="
JAVA_PID=$(pgrep -f "holape-1.0.0.jar" || true)
if [ -n "$JAVA_PID" ]; then
    echo "Matando proceso Java PID: $JAVA_PID"
    kill $JAVA_PID
    sleep 3
fi

echo ""
echo "=== [BACKEND] Iniciando aplicación ==="
mkdir -p logs
nohup java -jar target/holape-1.0.0.jar --spring.profiles.active=prod > logs/app.log 2>&1 &

echo "Esperando que inicie..."
sleep 5

# Verificar que inició
if pgrep -f "holape-1.0.0.jar" > /dev/null; then
    echo "Backend iniciado correctamente"
else
    echo "ERROR: Backend no inició. Revisar logs/app.log"
    tail -50 logs/app.log
    exit 1
fi

echo ""
echo "=========================================="
echo "       DESPLIEGUE COMPLETADO"
echo "=========================================="
echo ""
echo "Frontend: https://$DOMAIN:3001"
echo "API:      https://$DOMAIN:3001/api/"
echo ""
echo "Logs backend: tail -f $BACKEND_PROJECT/logs/app.log"
echo "=========================================="
