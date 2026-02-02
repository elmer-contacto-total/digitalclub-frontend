# Despliegue Holape - digitalclub.contactototal.com.pe

## Configuración

| Servicio | Puerto |
|----------|--------|
| Frontend (Nginx) | 3001 (HTTPS) |
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
```

## Despliegue Completo

```bash
cd ~/digitalclub/digitalclub-frontend/deploy
chmod +x deploy.sh
./deploy.sh
```

## Despliegue Solo Frontend

```bash
cd ~/digitalclub/digitalclub-frontend
git pull origin main
npm install
npm run build
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

- **App**: https://digitalclub.contactototal.com.pe:3001
- **API**: https://digitalclub.contactototal.com.pe:3001/api/

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
```
