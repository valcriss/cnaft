# CNAFT Workspace

Monorepo avec deux applications:

- `frontend/`: Vue + Vite
- `backend/`: Express + Prisma + PostgreSQL

## Developpement local

Prerequis:

- Node.js 22+
- Docker Desktop (si PostgreSQL via compose)

Installation:

```bash
cd backend && npm install
cd ../frontend && npm install
```

PostgreSQL local:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Backend:

```bash
cd backend
cp .env.example .env
npm run prisma:migrate -- --name init
npm run prisma:generate
npm run dev
```

Frontend (nouveau terminal):

```bash
cd frontend
npm run dev
```

URLs:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/health`
- API backend: `http://localhost:4000/api`

Note: en dev, Vite proxy automatiquement `/api` et `/ws` vers `localhost:4000`.

## Docker

### Mode split (2 images: frontend + backend)

Production-style (GHCR):

```bash
docker compose up -d
```

Images utilisees:

- `ghcr.io/valcriss/cnaft-backend:latest`
- `ghcr.io/valcriss/cnaft-frontend:latest`

### Mode full (1 image: backend + frontend)

Production-style (GHCR):

```bash
docker compose --profile full up -d full postgres
```

Image utilisee:

- `ghcr.io/valcriss/cnaft-full:latest`

Port expose en mode full:

- `http://localhost:8080`

### Test (build local des images)

```bash
docker compose -f docker-compose.test.yml up --build -d
```

Services exposes:

- split frontend: `http://localhost:4173`
- full image: `http://localhost:4174`
