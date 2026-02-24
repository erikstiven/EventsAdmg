# Frontend - EventAccess

Cliente web del sistema EventAccess (React + Vite + TypeScript).

## Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- shadcn/radix UI

## Instalacion

```bash
cd frontend
pnpm install
```

## Scripts

Desde `frontend/package.json`:

- `pnpm run dev`
- `pnpm run build`
- `pnpm run preview`
- `pnpm run lint`

## Ejecucion local recomendada

```bash
pnpm run dev -- --host 0.0.0.0 --port 3000
```

## Configuracion API

`src/lib/config.ts` usa este orden:

1. Runtime config via `GET /api/config`
2. `VITE_API_BASE_URL`
3. Fallback dev: `http://localhost:8000`

En desarrollo, `vite.config.ts` tiene proxy:

- `/api` -> `http://localhost:8000`
- `/uploads` -> `http://localhost:8000`

Por eso el backend local recomendado para desarrollo es puerto `8000`.

## Estructura base

```text
frontend/
├── src/
│   ├── api/
│   ├── components/
│   ├── contexts/
│   ├── lib/
│   ├── pages/
│   └── services/
├── public/
├── package.json
└── vite.config.ts
```

Ultima actualizacion: 2026-02-23
