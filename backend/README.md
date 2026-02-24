# Backend - EventAccess

API del sistema EventAccess construida con FastAPI + SQLAlchemy async.

## Requisitos

- Python 3.10+
- Dependencias de `requirements.txt`

## Instalacion

```bash
cd backend
pip install -r requirements.txt
```

## Variables de entorno principales

Basadas en `backend/core/config.py`:

- `DATABASE_URL` (default: `sqlite+aiosqlite:///./eventaccess.db`)
- `ENVIRONMENT` (default: `development`)
- `HOST` (default: `0.0.0.0`)
- `PORT` (default en config: `8001`)
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM` (default: `HS256`)
- `JWT_EXPIRE_MINUTES` (default: 7 dias)
- `PYTHON_BACKEND_URL` (para construir URL publica de backend)

## Ejecucion local recomendada

Para mantener compatibilidad con el proxy de Vite del frontend:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Swagger:

- `http://localhost:8000/docs`

## Arranque alternativo

```bash
python main.py
```

Nota: este modo usa `PORT` de entorno o el default interno (`8001`), por lo que puede no coincidir con el proxy del frontend si no se ajusta.

## Routers relevantes

- Auth simple: `routers/auth_simple.py`
- Invitaciones custom: `routers/invitations_custom.py`
- Check-in: `routers/checkin_custom.py`
- Invitaciones grupales: `routers/invitation_groups.py`
- RBAC/permisos: `routers/rbac.py`
- Config publica: `routers/config_public.py`

## Endpoints de referencia

- `POST /api/v1/auth-simple/login`
- `GET /api/v1/auth-simple/me`
- `POST /api/v1/invitations/generate`
- `POST /api/v1/invitations/activate`
- `POST /api/v1/checkin/validate-qr`
- `POST /api/v1/checkin/validate-biometric`
- `POST /api/v1/checkin/manual-validate`

Ultima actualizacion: 2026-02-23
