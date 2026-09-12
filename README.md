# Deployment Portal

Centralized DevOps Deployment Portal — Phase 1 (foundation).

## Stack

- **Backend**: Node.js + Express + TypeScript, Prisma ORM
- **Frontend**: React + Vite + TypeScript
- **Database**: PostgreSQL
- **Auth**: JWT in an httpOnly cookie, bcrypt password hashing, role-based permissions
- **Secrets**: Credentials (SSH keys, passwords, git tokens) are encrypted at rest with AES-256-GCM

## Run it

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32),
# ENCRYPTION_KEY (openssl rand -hex 32), and SEED_ADMIN_PASSWORD

docker compose up -d --build
```

The portal is served at `http://localhost:8080` (or `PORTAL_HTTP_PORT`). Log in with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env`.

No backend install is required on the host — Postgres, the API, and the frontend all run in
Docker containers, and database migrations + seeding run automatically on backend startup.

## Development (without Docker)

```bash
# backend
cd backend && npm install
npm run prisma:migrate:dev
npm run prisma:seed
npm run dev

# frontend
cd frontend && npm install
npm run dev
```

## Roles

Seeded roles: `Admin`, `Developer`, `QA`, `UAT`, `Viewer`, each with a starter permission set
in `backend/src/lib/permissions.ts`. Later phases will scope these further to specific
servers/applications/environments.
