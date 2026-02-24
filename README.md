# EventAccess (EventsAdmg)

Aplicacion para gestion de eventos, invitaciones y control de acceso con QR y validacion biometrica.

## Estado actual

- Frontend: React + Vite + TypeScript (`frontend/`)
- Backend: FastAPI + SQLAlchemy async (`backend/`)
- Base de datos: SQLite (local/dev) y SQLite en volumen Docker (deploy actual)
- Autenticacion: JWT (`/api/v1/auth-simple/*`)

## Estructura del repositorio

```text
.
├── backend/
├── frontend/
├── docker-compose.yml
├── DEPLOY.md
├── ARCHITECTURE.md
└── README_DOCKER.md
```

## Requisitos locales

- Node.js 18+
- pnpm 8+
- Python 3.10+

## Ejecucion local (sin Docker)

1. Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

2. Frontend (nueva terminal):

```bash
cd frontend
pnpm install
pnpm run dev -- --host 0.0.0.0 --port 3000
```

## URLs locales

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

Nota: `frontend/vite.config.ts` hace proxy de `/api` y `/uploads` a `http://localhost:8000`.

## Ejecucion con Docker

```bash
docker compose up -d --build
```

Con la configuracion actual:

- Frontend/Nginx expuesto en `:80`
- Backend interno en la red Docker (no expuesto directamente)
- Volumen `backend-data` para persistencia SQLite

Ver mas detalle en `README_DOCKER.md` y `DEPLOY.md`.

## Endpoints relevantes (actuales)

### Auth simple

- `POST /api/v1/auth-simple/login`
- `GET /api/v1/auth-simple/me`
- `POST /api/v1/auth-simple/register`
- `POST /api/v1/auth-simple/logout`

### Invitaciones (flujo custom)

- `POST /api/v1/invitations/generate`
- `POST /api/v1/invitations/activate`
- `GET /api/v1/invitations/pending-approvals`
- `POST /api/v1/invitations/approve`
- `GET /api/v1/invitations/my-invitations`

### Check-in

- `POST /api/v1/checkin/validate-qr`
- `POST /api/v1/checkin/qr-checkin`
- `POST /api/v1/checkin/validate-biometric`
- `POST /api/v1/checkin/manual-validate`
- `GET /api/v1/checkin/recent`

## Documentacion adicional

- Arquitectura tecnica: `ARCHITECTURE.md`
- Despliegue con proxy: `DEPLOY.md`
- Despliegue Docker: `README_DOCKER.md`
- Backend: `backend/README.md`
- Frontend: `frontend/README.md`

Ultima actualizacion: 2026-02-23
