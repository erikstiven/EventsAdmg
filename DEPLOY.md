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
