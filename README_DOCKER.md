# Guía de Despliegue con Docker - EventAccess

Este proyecto está preparado para ser desplegado utilizando Docker y Docker Compose. Esta configuración incluye un servidor backend (FastAPI) y un servidor frontend (React + Nginx).

## Estructura de Docker

- **Backend:** Imagen basada en Python 3.13-slim. Corre en el puerto 8000 dentro del contenedor.
- **Frontend:** Construcción multi-etapa (Node.js para construir, Nginx para servir). Nginx actúa como proxy inverso para redirigir las peticiones `/api` al backend.
- **Base de Datos:** Se utiliza SQLite persistido mediante un volumen de Docker (`backend-data`).

## Requisitos Previos

- Docker instalado en el servidor Linux.
- Docker Compose instalado.

## Pasos para el Despliegue

### 1. Preparar las variables de entorno

Crea un archivo `.env` en la raíz del proyecto (donde está el `docker-compose.yml`):

```env
# Configuración del Backend
DATABASE_URL=sqlite+aiosqlite:////app/data/eventaccess.db
SECRET_KEY=tu_clave_secreta_muy_segura_aqui
JWT_SECRET_KEY=otra_clave_secreta_para_jwt
DEBUG=false
ENVIRONMENT=production
PORT=8000

# Configuración de Storage (OSS) - Requerido para fotos/biometría
OSS_SERVICE_URL=http://tu-servicio-oss.com
OSS_API_KEY=tu-api-key
```

### 2. Construir y Levantar los Contenedores

Ejecuta el siguiente comando en la raíz del proyecto:

```bash
docker-compose up -d --build
```

Este comando:
- Construirá las imágenes del frontend y backend.
- Levantará los servicios en segundo plano (`-d`).
- El frontend estará disponible en el puerto **80** del servidor.

### 3. Verificar el estado

```bash
docker-compose ps
docker-compose logs -f backend
```

## Notas Adicionales

- **Persistencia:** La base de datos SQLite se guarda en `/var/lib/docker/volumes/...` (gestionado por el volumen `backend-data`). No se perderán los datos al reiniciar los contenedores.
- **Nginx:** La configuración de Nginx en el frontend ya maneja el enrutamiento de React (SPA) y el proxy hacia el backend.
- **Puertos:** El backend no está expuesto directamente al exterior por seguridad; solo es accesible a través del frontend/Nginx.

---
Creado para el despliegue de EventAccess en producción.
