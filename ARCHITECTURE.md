# EventAccess - Arquitectura tecnica

## Vision general

El sistema sigue una arquitectura frontend/backend:

- Frontend SPA en React (Vite), servido por Vite en dev o Nginx en Docker.
- Backend FastAPI con carga dinamica de routers (`backend/routers/__init__.py`).
- Persistencia con SQLAlchemy async y SQLite.

## Componentes principales

## Frontend (`frontend/`)

- App React + TypeScript.
- Config runtime en `src/lib/config.ts`:
  - Intenta leer `GET /api/config`.
  - Si no hay config runtime, usa `VITE_API_BASE_URL`.
  - Fallback en dev: `http://localhost:8000`.
- En desarrollo, Vite proxya:
  - `/api` -> `http://localhost:8000`
  - `/uploads` -> `http://localhost:8000`

## Backend (`backend/`)

- FastAPI en `main.py`.
- CORS abierto (`allow_origins=["*"]`) en estado actual.
- Routers cargados automaticamente desde `backend/routers/*.py`.
- Inicializacion de base de datos al startup (`services.database.initialize_database`).

## Autenticacion

Se usa JWT con usuarios en base de datos (`backend/routers/auth_simple.py`).

Flujo:

1. `POST /api/v1/auth-simple/login` valida email/password contra DB.
2. Si es valido, genera JWT con `sub`, `email` y `role`.
3. Frontend guarda token y lo envia en `Authorization: Bearer`.
4. `GET /api/v1/auth-simple/me` resuelve usuario actual y permisos.

Endpoints actuales de auth simple:

- `POST /api/v1/auth-simple/login`
- `GET /api/v1/auth-simple/me`
- `POST /api/v1/auth-simple/register`
- `POST /api/v1/auth-simple/logout`

## Dominio funcional

## Invitaciones

Routers clave:

- CRUD base: `backend/routers/invitations.py`
- Flujo custom: `backend/routers/invitations_custom.py`
- Invitaciones grupales: `backend/routers/invitation_groups.py`

Endpoints custom principales:

- `POST /api/v1/invitations/generate`
- `POST /api/v1/invitations/activate`
- `GET /api/v1/invitations/pending-approvals`
- `POST /api/v1/invitations/approve`
- `GET /api/v1/invitations/my-invitations`

## Check-in

Router: `backend/routers/checkin_custom.py`

Endpoints:

- `POST /api/v1/checkin/validate-qr`
- `POST /api/v1/checkin/qr-checkin`
- `POST /api/v1/checkin/validate-biometric`
- `POST /api/v1/checkin/manual-validate`
- `GET /api/v1/checkin/recent`

Notas:

- Soporta QR clasico y QR de invitaciones grupales.
- Un QR consumido deja de ser reutilizable.
- Si biometria falla por umbral, se requiere validacion manual.

## Configuracion publica para frontend

Actualmente existen rutas de configuracion publica:

- `GET /api/config` en `backend/routers/config_public.py` (usa `settings.backend_url`)
- `GET /api/config` en `backend/routers/config.py` (usa `BACKEND_URL` env, default `http://localhost:8002`)

Esto implica posible solapamiento funcional y debe mantenerse alineado para evitar respuestas inconsistentes.

## Topologia de despliegue (Docker actual)

`docker-compose.yml` define:

- `backend` en red interna Docker.
- `frontend` (Nginx) expuesto en `80:80`.
- proxy Nginx `/api` -> `http://backend:8000`.
- volumen `backend-data` para SQLite en `/app/data`.

## Puertos de referencia

- Dev recomendado:
  - Backend: `8000` (alineado con proxy de Vite)
  - Frontend: `3000`
- Docker:
  - Publico: `80` (frontend)
  - Backend interno: `8000` (solo red Docker)

Ultima actualizacion: 2026-02-23
