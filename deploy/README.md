# Deploy frontend (Holape — Angular)

Este directorio contiene los artefactos para desplegar el SPA en cualquiera de las dos VMs:

- **mws.digitalclub.com.pe** — usa `nginx.mws.conf`, `env.mws.js`, `deploy-mws.sh`
- **infinance.innovag.com.pe** — usa `nginx.infinance.conf`, `env.infinance.js`, `deploy-infinance.sh`

El frontend es estático (`/var/www/holape-angular/`). Las URLs de API/WebSocket se inyectan en runtime vía `window.__env` desde `env.js` — el mismo bundle sirve para los dos dominios.

## Bootstrap (una sola vez por VM)

```bash
# 1. Carpeta web y permisos
sudo mkdir -p /var/www/holape-angular
sudo chown -R $USER:www-data /var/www/holape-angular

# 2. nginx + certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# 3. Certificado TLS (Let's Encrypt)
sudo certbot --nginx -d mws.digitalclub.com.pe          # en VM mws
# o
sudo certbot --nginx -d infinance.innovag.com.pe        # en VM infinance

# 4. Sustituir el server block que generó certbot por el de este repo
cd ~/digitalclub/digitalclub-frontend
sudo cp deploy/nginx.mws.conf /etc/nginx/sites-available/mws            # VM mws
sudo ln -sf /etc/nginx/sites-available/mws /etc/nginx/sites-enabled/mws
# (idem para infinance con nginx.infinance.conf)

sudo nginx -t
sudo systemctl reload nginx
```

## Deploy continuo

```bash
cd ~/digitalclub/digitalclub-frontend
./deploy/deploy-mws.sh        # en VM mws
./deploy/deploy-infinance.sh  # en VM infinance
```

Cada script:
1. `git fetch && git reset --hard origin/main`
2. `npm ci && npm run build:prod`
3. Copia `dist/holape-angular/browser/*` a `/var/www/holape-angular/`
4. Copia `deploy/env.<dominio>.js` a `/var/www/holape-angular/env.js`
5. `sudo nginx -t && sudo systemctl reload nginx`

## Branding por dominio (vía `window.__env`)

Cada `env.<dominio>.js` define en runtime:

| Clave | mws | infinance |
|---|---|---|
| `apiUrl` | `''` (relativo, vía nginx proxy) | `''` |
| `wsUrl` | `wss://mws.digitalclub.com.pe/websocket` | `wss://infinance.innovag.com.pe/websocket` |
| `logoPath` | `null` (logo SVG por defecto) | `/assets/images/logo-sip.png` |
| `appName` | `MWS` | `InFinance` |
| `title` | `MWS Desktop` | `InFinance Cobranza` |

Para cambiar branding (logo, título, nombre de la app), basta editar el `env.<dominio>.js` correspondiente y volver a correr `deploy-<dominio>.sh`. **No requiere rebuild del bundle.**

## Operación

```bash
sudo nginx -t                                    # validar config
sudo systemctl reload nginx                      # recargar (no corta conexiones)
sudo systemctl restart nginx                     # reinicio completo
sudo journalctl -u nginx -n 100 --no-pager       # logs del servicio
sudo tail -f /var/log/nginx/access.log           # acceso en vivo
sudo tail -f /var/log/nginx/error.log            # errores
sudo certbot renew --dry-run                     # probar renovación TLS
```

## Verificación post-deploy

Desde un browser, abrir `https://<dominio>/` y comprobar:
- Título del browser tab (debe ser `MWS Desktop` o `InFinance Cobranza`)
- Logo en sidebar (mws → SVG por defecto, infinance → logo-sip.png)
- Nombre de la app en sidebar (`MWS` vs `InFinance`)
- DevTools → Network → WS: la conexión STOMP debe ser `wss://<dominio>/websocket` (status `101 Switching Protocols`)
- Login funcional (POST a `/api/v1/auth/login` debe pasar)
