# Despliegue Holape - digitalclub.contactototal.com.pe

## Requisitos del Servidor

```bash
# Java 21 para Spring Boot
sudo apt install openjdk-21-jdk -y

# Node.js 20 LTS para Angular 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Maven, Nginx, Git, Certbot
sudo apt install maven nginx git certbot -y
```

## Configuración de Puertos

| Servicio | Puerto |
|----------|--------|
| Frontend (Nginx + SSL) | 9080 |
| Backend (Spring Boot) | 8443 |

## Estructura en VM

```
~/digitalclub/
├── digitalclub-frontend/        # Frontend Angular
│   └── deploy/
│       ├── deploy.sh
│       ├── nginx.conf
│       └── README.md
└── digitalclub-backend/         # Backend Spring Boot
    └── logs/app.log

/var/www/holape-angular/         # Archivos Angular compilados
```

## Primer Despliegue (Servidor Nuevo)

```bash
# 1. Clonar repositorios
mkdir -p ~/digitalclub
cd ~/digitalclub
git clone https://github.com/elmer-contacto-total/digitalclub-frontend.git
git clone https://github.com/elmer-contacto-total/digitalclub-backend.git

# 2. Ejecutar script de despliegue
cd ~/digitalclub/digitalclub-frontend/deploy
chmod +x deploy.sh
./deploy.sh
```

## Despliegue Completo (Actualización)

```bash
cd ~/digitalclub/digitalclub-frontend/deploy
./deploy.sh
```

## Despliegue Solo Frontend

```bash
cd ~/digitalclub/digitalclub-frontend
git pull origin main
npm install
npm run build:prod
sudo rm -rf /var/www/holape-angular/*
sudo cp -r dist/holape-angular/browser/* /var/www/holape-angular/
sudo systemctl reload nginx
```

## Despliegue Solo Backend

```bash
cd ~/digitalclub/digitalclub-backend
rm -rf target/
git pull origin main
mvn clean package -DskipTests

# Detener proceso anterior
kill $(pgrep -f "holape-1.0.0.jar")

# Iniciar
mkdir -p logs
nohup java -jar target/holape-1.0.0.jar --spring.profiles.active=prod > logs/app.log 2>&1 &
```

## URLs

- **App**: https://digitalclub.contactototal.com.pe:9080
- **API**: https://digitalclub.contactototal.com.pe:9080/api/
- **WebSocket**: wss://digitalclub.contactototal.com.pe:9080/ws/

## Comandos Útiles

```bash
# Ver logs del backend
tail -f ~/digitalclub/digitalclub-backend/logs/app.log

# Ver proceso Java
ps aux | grep java

# Estado Nginx
sudo systemctl status nginx

# Reiniciar Nginx
sudo systemctl reload nginx

# Verificar certificado SSL
sudo certbot certificates

# Renovar certificado SSL
sudo certbot renew
```

## Verificación

```bash
# Verificar versiones
java -version      # Debe ser 21.x
node -v            # Debe ser 20.x
nginx -v

# Verificar servicios
curl -k https://localhost:9080/          # Frontend
curl -k https://localhost:9080/api/health  # Backend API
```
