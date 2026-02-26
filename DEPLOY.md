# Guia de despliegue - EventsAdmg (Debian 12 + Docker)

Esta guia corresponde al repositorio actual:

- Repo: `https://github.com/erikstiven/EventsAdmg.git`
- Rama: `main`

## 1. Preparar servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git
```

## 2. Clonar proyecto

```bash
git clone https://github.com/erikstiven/EventsAdmg.git
cd EventsAdmg
git checkout main
```

## 3. Revisar configuracion

El despliegue base usa `docker-compose.yml` con:

- Backend interno en red Docker
- Frontend/Nginx publicado en `80:80`
- SQLite persistido en volumen `backend-data`

Variables ya definidas en compose para backend:

- `DATABASE_URL=sqlite+aiosqlite:////app/data/eventaccess.db`
- `DEBUG=false`
- `ENVIRONMENT=production`
- `PORT=8000`

Si necesitas variables adicionales (ej. `JWT_SECRET_KEY`, `PYTHON_BACKEND_URL`), agregalas en el servicio `backend` de `docker-compose.yml` o usa override.

## 4. Levantar contenedores

```bash
docker compose up -d --build
```

## 5. Verificacion

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

Acceso esperado:

- Aplicacion: `http://<IP_DEL_SERVIDOR>/`

## 6. Proxy Apache externo (opcional)

Si tienes un Apache frontal con dominio publico:

```apache
<VirtualHost *:443>
    ServerName eventos.ge-admg.com

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    ProxyPreserveHost On
    ProxyPass / http://10.100.46.37/
    ProxyPassReverse / http://10.100.46.37/
</VirtualHost>
```

La topologia queda:

`Usuario (HTTPS)` -> `Apache` -> `Nginx (contenedor frontend)` -> `FastAPI (contenedor backend)`

## Notas operativas

- Persistencia DB: volumen Docker `backend-data`
- Reinicio servicios:

```bash
docker compose restart
```

- Actualizacion de version:

```bash
git pull origin main
docker compose up -d --build
```

Ultima actualizacion: 2026-02-23

## CI/CD (GitHub Actions)

Se agregaron workflows en `.github/workflows`:

- `ci.yml`: validaciones en push/PR (`compileall`, `alembic upgrade head`, smoke tests backend, build frontend).
- `deploy.yml`: despliegue a produccion por SSH, solo cuando CI de `main` termina OK o por disparo manual.

Secrets requeridos para `deploy.yml` (en GitHub `Settings > Secrets and variables > Actions`):

- `DEPLOY_HOST`: host/IP del servidor.
- `DEPLOY_USER`: usuario SSH.
- `DEPLOY_SSH_KEY`: llave privada SSH.
- `DEPLOY_PATH`: ruta absoluta del repo en el servidor (ej. `/opt/EventsAdmg`).

Secret opcional:

- `APP_HEALTHCHECK_URL`: URL para verificacion post deploy (ej. `https://tu-dominio/health`).

Recomendado:

- Configurar `Environment` llamado `production` en GitHub con reglas de aprobacion.
